using System.Globalization;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.VisualBasic.FileIO;
using Workshop.Api.Data;
using Workshop.Api.Models;
using Workshop.Api.Options;

namespace Workshop.Api.Services;

public sealed class InventoryItemService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private const string XeroInventorySyncKey = "xero_inventory_items";

    private readonly AppDbContext _db;
    private readonly InventoryItemOptions _options;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly XeroTokenService _xeroTokenService;
    private readonly XeroTokenStore _xeroTokenStore;

    public InventoryItemService(
        AppDbContext db,
        IOptions<InventoryItemOptions> options,
        IHttpClientFactory httpClientFactory,
        XeroTokenService xeroTokenService,
        XeroTokenStore xeroTokenStore)
    {
        _db = db;
        _options = options.Value;
        _httpClientFactory = httpClientFactory;
        _xeroTokenService = xeroTokenService;
        _xeroTokenStore = xeroTokenStore;
    }

    public async Task<List<InventoryItemLookupDto>> SearchAsync(string? query, int limit, CancellationToken ct)
    {
        var normalized = query?.Trim();
        var resolvedLimit = Math.Clamp(limit, 1, 50);

        var items = _db.InventoryItems.AsNoTracking()
            .Where(x => string.IsNullOrWhiteSpace(normalized) ||
                        EF.Functions.ILike(x.ItemCode, $"%{normalized}%") ||
                        EF.Functions.ILike(x.ItemName, $"%{normalized}%") ||
                        (x.SalesDescription != null && EF.Functions.ILike(x.SalesDescription, $"%{normalized}%")) ||
                        (x.PurchasesDescription != null && EF.Functions.ILike(x.PurchasesDescription, $"%{normalized}%")));

        return await items
            .OrderBy(x => x.ItemCode)
            .Take(resolvedLimit)
            .Select(x => new InventoryItemLookupDto
            {
                Code = x.ItemCode,
                Name = x.ItemName,
                Description = string.IsNullOrWhiteSpace(x.SalesDescription) ? (x.PurchasesDescription ?? x.ItemName) : x.SalesDescription!,
                UnitPrice = x.SalesUnitPrice ?? x.PurchasesUnitPrice ?? 0m,
                Account = x.SalesAccount ?? x.PurchasesAccount ?? "",
                TaxRate = x.SalesTaxRate ?? x.PurchasesTaxRate ?? "No GST",
                Status = x.Status,
            })
            .ToListAsync(ct);
    }

    public async Task<InventoryItemImportResult> ImportFromConfiguredFileAsync(CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(_options.ImportPath))
            return InventoryItemImportResult.Fail("Missing InventoryItems:ImportPath configuration.");

        return await ImportFromFileAsync(_options.ImportPath, ct);
    }

    public async Task EnsureSeededAsync(CancellationToken ct)
    {
        if (await _db.InventoryItems.AsNoTracking().AnyAsync(ct))
            return;

        var importResult = await ImportFromConfiguredFileAsync(ct);
        if (!importResult.Ok && importResult.Error is not null)
            throw new InvalidOperationException(importResult.Error);
    }

    public async Task<InventoryItemSyncResult> SyncFromXeroAsync(CancellationToken ct)
    {
        var state = await _xeroTokenStore.GetEffectiveAsync(ct);
        if (string.IsNullOrWhiteSpace(state.TenantId))
        {
            await UpsertSyncStateAsync(null, null, "Missing Xero tenant id.", ct);
            return InventoryItemSyncResult.Fail(400, "Missing Xero tenant id.");
        }

        var tokenResult = await _xeroTokenService.RefreshAccessTokenAsync(ct);
        if (!tokenResult.Ok)
        {
            await UpsertSyncStateAsync(null, null, tokenResult.Error ?? "Failed to refresh Xero access token.", ct);
            return InventoryItemSyncResult.Fail(tokenResult.StatusCode, tokenResult.Error ?? "Failed to refresh Xero access token.");
        }

        var client = _httpClientFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "https://api.xero.com/api.xro/2.0/Items?pageSize=1000");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenResult.AccessToken);
        request.Headers.Add("xero-tenant-id", state.TenantId);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        using var response = await client.SendAsync(request, ct);
        var payload = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
        {
            await UpsertSyncStateAsync(null, null, payload, ct);
            return InventoryItemSyncResult.Fail((int)response.StatusCode, payload);
        }

        XeroItemsEnvelope? parsed;
        try
        {
            parsed = JsonSerializer.Deserialize<XeroItemsEnvelope>(payload, JsonOptions);
        }
        catch (JsonException)
        {
            await UpsertSyncStateAsync(null, null, "Failed to parse Xero items response.", ct);
            return InventoryItemSyncResult.Fail(502, "Failed to parse Xero items response.");
        }

        var syncedAt = DateTime.UtcNow;
        var imported = (parsed?.Items ?? [])
            .Where(x => !string.IsNullOrWhiteSpace(x.Code))
            .Select(x => new InventoryItem
            {
                ItemCode = x.Code!.Trim(),
                ItemName = x.Name?.Trim() ?? "",
                Quantity = x.QuantityOnHand,
                PurchasesDescription = NullIfWhiteSpace(x.PurchaseDetails?.Description),
                PurchasesUnitPrice = x.PurchaseDetails?.UnitPrice,
                PurchasesAccount = NullIfWhiteSpace(x.PurchaseDetails?.AccountCode),
                PurchasesTaxRate = NullIfWhiteSpace(x.PurchaseDetails?.TaxType),
                SalesDescription = NullIfWhiteSpace(x.SalesDetails?.Description),
                SalesUnitPrice = x.SalesDetails?.UnitPrice,
                SalesAccount = NullIfWhiteSpace(x.SalesDetails?.AccountCode),
                SalesTaxRate = NullIfWhiteSpace(x.SalesDetails?.TaxType),
                InventoryAssetAccount = NullIfWhiteSpace(x.InventoryAssetAccountCode),
                CostOfGoodsSoldAccount = NullIfWhiteSpace(x.CogsAccountCode),
                Status = x.Status?.Trim() ?? "",
                InventoryType = NullIfWhiteSpace(x.Type),
                CreatedAt = syncedAt,
                UpdatedAt = syncedAt,
            })
            .ToList();

        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        await _db.InventoryItems.ExecuteDeleteAsync(ct);
        await _db.InventoryItems.AddRangeAsync(imported, ct);
        await _db.SaveChangesAsync(ct);
        await UpsertSyncStateAsync(syncedAt, $"Synced {imported.Count} item(s) from Xero.", null, ct);
        await tx.CommitAsync(ct);

        return InventoryItemSyncResult.Success(imported.Count, syncedAt);
    }

    public async Task<SystemSyncStateDto> GetXeroInventorySyncStateAsync(CancellationToken ct)
    {
        var state = await _db.SystemSyncStates.AsNoTracking()
            .FirstOrDefaultAsync(x => x.SyncKey == XeroInventorySyncKey, ct);

        return new SystemSyncStateDto(
            state?.SyncKey ?? XeroInventorySyncKey,
            state?.LastSyncedAt,
            state?.LastResult,
            state?.LastError,
            state?.UpdatedAt);
    }

    private async Task<InventoryItemImportResult> ImportFromFileAsync(string path, CancellationToken ct)
    {
        if (!File.Exists(path))
            return InventoryItemImportResult.Fail($"Inventory import file not found: {path}");

        var imported = new List<InventoryItem>();

        using var parser = new TextFieldParser(path);
        parser.SetDelimiters(",");
        parser.HasFieldsEnclosedInQuotes = true;

        if (parser.EndOfData)
            return InventoryItemImportResult.Fail("Inventory import file is empty.");

        _ = parser.ReadFields(); // header

        while (!parser.EndOfData)
        {
            ct.ThrowIfCancellationRequested();
            var fields = parser.ReadFields();
            if (fields is null || fields.Length == 0)
                continue;

            var itemCode = GetField(fields, 0)?.Trim();
            if (string.IsNullOrWhiteSpace(itemCode))
                continue;

            imported.Add(new InventoryItem
            {
                ItemCode = itemCode,
                ItemName = GetField(fields, 1)?.Trim() ?? "",
                Quantity = ParseNullableDecimal(GetField(fields, 2)),
                PurchasesDescription = NullIfWhiteSpace(GetField(fields, 3)),
                PurchasesUnitPrice = ParseNullableDecimal(GetField(fields, 4)),
                PurchasesAccount = NullIfWhiteSpace(GetField(fields, 5)),
                PurchasesTaxRate = NullIfWhiteSpace(GetField(fields, 6)),
                SalesDescription = NullIfWhiteSpace(GetField(fields, 7)),
                SalesUnitPrice = ParseNullableDecimal(GetField(fields, 8)),
                SalesAccount = NullIfWhiteSpace(GetField(fields, 9)),
                SalesTaxRate = NullIfWhiteSpace(GetField(fields, 10)),
                InventoryAssetAccount = NullIfWhiteSpace(GetField(fields, 11)),
                CostOfGoodsSoldAccount = NullIfWhiteSpace(GetField(fields, 12)),
                Status = GetField(fields, 13)?.Trim() ?? "",
                InventoryType = NullIfWhiteSpace(GetField(fields, 14)),
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            });
        }

        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        await _db.InventoryItems.ExecuteDeleteAsync(ct);
        await _db.InventoryItems.AddRangeAsync(imported, ct);
        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return InventoryItemImportResult.Success(imported.Count, path);
    }

    private static string? GetField(string[] fields, int index)
        => index < fields.Length ? fields[index] : null;

    private static decimal? ParseNullableDecimal(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;

        return decimal.TryParse(value.Trim(), NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : null;
    }

    private static string? NullIfWhiteSpace(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private async Task UpsertSyncStateAsync(DateTime? lastSyncedAt, string? lastResult, string? lastError, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var state = await _db.SystemSyncStates.FirstOrDefaultAsync(x => x.SyncKey == XeroInventorySyncKey, ct);
        if (state is null)
        {
            state = new SystemSyncState
            {
                SyncKey = XeroInventorySyncKey,
                CreatedAt = now,
            };
            _db.SystemSyncStates.Add(state);
        }

        state.LastSyncedAt = lastSyncedAt ?? state.LastSyncedAt;
        state.LastResult = lastResult;
        state.LastError = lastError;
        state.UpdatedAt = now;
        await _db.SaveChangesAsync(ct);
    }
}

public sealed class InventoryItemLookupDto
{
    public string Code { get; init; } = "";
    public string Name { get; init; } = "";
    public string Description { get; init; } = "";
    public decimal UnitPrice { get; init; }
    public string Account { get; init; } = "";
    public string TaxRate { get; init; } = "No GST";
    public string Status { get; init; } = "";
}

public sealed class InventoryItemImportResult
{
    public bool Ok { get; private init; }
    public int ImportedCount { get; private init; }
    public string? SourcePath { get; private init; }
    public string? Error { get; private init; }

    public static InventoryItemImportResult Success(int importedCount, string sourcePath) =>
        new()
        {
            Ok = true,
            ImportedCount = importedCount,
            SourcePath = sourcePath,
        };

    public static InventoryItemImportResult Fail(string error) =>
        new()
        {
            Ok = false,
            Error = error,
        };
}

public sealed class InventoryItemSyncResult
{
    public bool Ok { get; private init; }
    public int StatusCode { get; private init; }
    public int SyncedCount { get; private init; }
    public DateTime? SyncedAtUtc { get; private init; }
    public string? Error { get; private init; }

    public static InventoryItemSyncResult Success(int syncedCount, DateTime syncedAtUtc) =>
        new()
        {
            Ok = true,
            StatusCode = 200,
            SyncedCount = syncedCount,
            SyncedAtUtc = syncedAtUtc,
        };

    public static InventoryItemSyncResult Fail(int statusCode, string error) =>
        new()
        {
            Ok = false,
            StatusCode = statusCode,
            Error = error,
        };
}

public sealed record SystemSyncStateDto(
    string SyncKey,
    DateTime? LastSyncedAt,
    string? LastResult,
    string? LastError,
    DateTime? UpdatedAt);

public sealed class XeroItemsEnvelope
{
    [JsonPropertyName("Items")]
    public List<XeroItemDto> Items { get; set; } = [];
}

public sealed class XeroItemDto
{
    [JsonPropertyName("Code")]
    public string? Code { get; set; }

    [JsonPropertyName("Name")]
    public string? Name { get; set; }

    [JsonPropertyName("QuantityOnHand")]
    public decimal? QuantityOnHand { get; set; }

    [JsonPropertyName("InventoryAssetAccountCode")]
    public string? InventoryAssetAccountCode { get; set; }

    [JsonPropertyName("COGSAccountCode")]
    public string? CogsAccountCode { get; set; }

    [JsonPropertyName("Status")]
    public string? Status { get; set; }

    [JsonPropertyName("Type")]
    public string? Type { get; set; }

    [JsonPropertyName("PurchaseDetails")]
    public XeroItemDetailDto? PurchaseDetails { get; set; }

    [JsonPropertyName("SalesDetails")]
    public XeroItemDetailDto? SalesDetails { get; set; }
}

public sealed class XeroItemDetailDto
{
    [JsonPropertyName("Description")]
    public string? Description { get; set; }

    [JsonPropertyName("UnitPrice")]
    public decimal? UnitPrice { get; set; }

    [JsonPropertyName("AccountCode")]
    public string? AccountCode { get; set; }

    [JsonPropertyName("TaxType")]
    public string? TaxType { get; set; }
}
