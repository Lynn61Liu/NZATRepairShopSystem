using System.Globalization;
using System.Diagnostics;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Workshop.Api.Data;
using Workshop.Api.Models;
using Workshop.Api.Options;

namespace Workshop.Api.Services;

public sealed class PaymarkTransactionSyncService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly AppDbContext _db;
    private readonly PaymarkOptions _options;
    private readonly ILogger<PaymarkTransactionSyncService> _logger;

    public PaymarkTransactionSyncService(
        AppDbContext db,
        IOptions<PaymarkOptions> options,
        ILogger<PaymarkTransactionSyncService> logger)
    {
        _db = db;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<PaymarkSyncResult> SyncAsync(DateTime transactionTimeFromUtc, DateTime transactionTimeToUtc, CancellationToken ct)
    {
        var apiResult = await FetchTransactionsAsync(transactionTimeFromUtc, transactionTimeToUtc, ct);
        if (!apiResult.Success)
            return apiResult;

        var now = DateTime.UtcNow;
        var existingKeys = apiResult.Transactions.Select(BuildTransactionKey).ToArray();
        var existing = await _db.PaymarkTransactions
            .Where(x => existingKeys.Contains(x.TransactionKey))
            .ToDictionaryAsync(x => x.TransactionKey, ct);

        var imported = 0;
        var updated = 0;

        foreach (var dto in apiResult.Transactions)
        {
            var key = BuildTransactionKey(dto);
            if (existing.TryGetValue(key, out var row))
            {
                Apply(row, dto, now);
                updated++;
                continue;
            }

            row = new PaymarkTransaction
            {
                TransactionKey = key,
                ImportedAt = now,
            };
            Apply(row, dto, now);
            _db.PaymarkTransactions.Add(row);
            imported++;
        }

        await _db.SaveChangesAsync(ct);

        return apiResult with
        {
            ImportedCount = imported,
            UpdatedCount = updated,
        };
    }

    public async Task<List<PaymarkTransaction>> GetTransactionsAsync(DateTime fromUtc, DateTime toUtc, CancellationToken ct)
        => await _db.PaymarkTransactions
            .AsNoTracking()
            .Where(x => x.TransactionTimeUtc >= fromUtc && x.TransactionTimeUtc <= toUtc)
            .OrderByDescending(x => x.TransactionTimeUtc)
            .ThenByDescending(x => x.Id)
            .Take(500)
            .ToListAsync(ct);

    private async Task<PaymarkSyncResult> FetchTransactionsAsync(DateTime fromUtc, DateTime toUtc, CancellationToken ct)
    {
        try
        {
            var shellDir = FindShellDirectory();
            var scriptPath = Path.Combine(shellDir, "scripts", "paymarkSync.mjs");
            var payload = JsonSerializer.Serialize(new
            {
                profilePath = ResolveProfilePath(_options.BrowserProfilePath),
                apiBaseUrl = _options.ApiBaseUrl.TrimEnd('/'),
                insightsBaseUrl = _options.InsightsBaseUrl.TrimEnd('/'),
                cardAcceptorIdCode = _options.CardAcceptorIdCode,
                headless = _options.Headless,
                loginWaitMs = Math.Max(30, _options.LoginWaitSeconds) * 1000,
                fromUtc = FormatUtc(fromUtc),
                toUtc = FormatUtc(toUtc),
            }, JsonOptions);

            var startInfo = new ProcessStartInfo("node")
            {
                WorkingDirectory = shellDir,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
            };
            startInfo.ArgumentList.Add(scriptPath);
            startInfo.ArgumentList.Add(payload);

            using var process = Process.Start(startInfo)
                ?? throw new InvalidOperationException("Failed to start Paymark sync process.");
            var stdoutTask = process.StandardOutput.ReadToEndAsync(ct);
            var stderrTask = process.StandardError.ReadToEndAsync(ct);
            await process.WaitForExitAsync(ct);
            var stdout = await stdoutTask;
            var stderr = await stderrTask;

            if (process.ExitCode != 0)
            {
                _logger.LogWarning("Paymark sync process exited {ExitCode}: {Error}", process.ExitCode, stderr);
                return PaymarkSyncResult.Fail(500, "Paymark sync process failed.");
            }

            var response = JsonSerializer.Deserialize<PaymarkBrowserResponse>(stdout, JsonOptions)
                ?? new PaymarkBrowserResponse { Success = false, Status = 500, Error = "Invalid Paymark sync response." };

            if (!response.Success)
            {
                _logger.LogWarning("Paymark transaction sync returned status {Status}: {Payload}", response.Status, response.Text);
                return PaymarkSyncResult.Fail(response.Status == 0 ? 500 : response.Status, response.Error ?? "Paymark sync failed.");
            }

            var envelope = JsonSerializer.Deserialize<PaymarkTransactionEnvelope>(response.Text, JsonOptions);
            foreach (var transaction in envelope?.Transactions ?? [])
            {
                if (string.IsNullOrWhiteSpace(transaction.CardAcceptorIdCode))
                    transaction.CardAcceptorIdCode = _options.CardAcceptorIdCode;
            }

            return PaymarkSyncResult.Ok(
                response.Status,
                envelope?.Transactions ?? [],
                envelope?.TotalResults ?? 0,
                envelope?.TotalPages ?? 0);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "Paymark transaction sync failed.");
            return PaymarkSyncResult.Fail(500, ex.Message);
        }
    }

    private static void Apply(PaymarkTransaction row, PaymarkTransactionDto dto, DateTime now)
    {
        row.CardAcceptorIdCode = dto.CardAcceptorIdCode ?? "";
        row.TerminalId = dto.TerminalId ?? "";
        row.RetrievalRef = dto.RetrievalRef ?? "";
        row.TransactionNumber = dto.TransactionNumber;
        row.TransactionTimeUtc = dto.TransactionTime.Kind == DateTimeKind.Utc
            ? dto.TransactionTime
            : DateTime.SpecifyKind(dto.TransactionTime, DateTimeKind.Utc);
        row.SettlementDate = ParseDateOnly(dto.SettlementDate);
        row.CardLogo = dto.CardLogo ?? "";
        row.Suffix = dto.Suffix ?? "";
        row.TranType = dto.TranType;
        row.TransactionAmount = dto.TransactionAmount;
        row.PurchaseAmount = dto.PurchaseAmount;
        row.CashoutAmount = dto.CashoutAmount;
        row.Status = dto.Status ?? "";
        row.ActionCode = dto.ActionCode ?? "";
        row.Bin = dto.Bin ?? "";
        row.RawPayloadJson = JsonSerializer.Serialize(dto, JsonOptions);
        row.UpdatedAt = now;
    }

    private static string BuildTransactionKey(PaymarkTransactionDto dto)
        => string.Join(
            ":",
            dto.CardAcceptorIdCode ?? "",
            dto.TerminalId ?? "",
            dto.TransactionNumber.ToString(CultureInfo.InvariantCulture),
            FormatUtc(dto.TransactionTime));

    private static string FormatUtc(DateTime value)
        => value.Kind == DateTimeKind.Utc
            ? value.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture)
            : value.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

    private static DateOnly? ParseDateOnly(string? value)
        => DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed)
            ? parsed
            : null;

    private static string ResolveProfilePath(string path)
    {
        if (path.StartsWith("~/", StringComparison.Ordinal))
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), path[2..]);

        return Environment.ExpandEnvironmentVariables(path);
    }

    private static string FindShellDirectory()
    {
        var current = new DirectoryInfo(AppContext.BaseDirectory);
        while (current is not null)
        {
            var candidate = Path.Combine(current.FullName, "apps", "shell", "scripts", "paymarkSync.mjs");
            if (File.Exists(candidate))
                return Path.Combine(current.FullName, "apps", "shell");

            current = current.Parent;
        }

        throw new DirectoryNotFoundException("Could not locate apps/shell for Paymark sync.");
    }
}

public sealed record PaymarkSyncResult(
    bool Success,
    int StatusCode,
    string? Error,
    List<PaymarkTransactionDto> Transactions,
    int TotalResults,
    int TotalPages,
    int ImportedCount,
    int UpdatedCount)
{
    public static PaymarkSyncResult Ok(int statusCode, List<PaymarkTransactionDto> transactions, int totalResults, int totalPages)
        => new(true, statusCode, null, transactions, totalResults, totalPages, 0, 0);

    public static PaymarkSyncResult Fail(int statusCode, string error)
        => new(false, statusCode, error, [], 0, 0, 0, 0);
}

public sealed class PaymarkBrowserResponse
{
    public bool Success { get; set; }
    public int Status { get; set; }
    public string? Error { get; set; }
    public string Text { get; set; } = "";
}

public sealed class PaymarkTransactionEnvelope
{
    public int Page { get; set; }
    public int TotalPages { get; set; }
    public int TotalResults { get; set; }
    public List<PaymarkTransactionDto> Transactions { get; set; } = [];
}

public sealed class PaymarkTransactionDto
{
    public string? ActionCode { get; set; }
    public string? Bin { get; set; }
    public string? CardAcceptorIdCode { get; set; }
    public string? CardLogo { get; set; }
    public decimal CashoutAmount { get; set; }
    public decimal PurchaseAmount { get; set; }
    public string? RetrievalRef { get; set; }
    public string? SettlementDate { get; set; }
    public string? Status { get; set; }
    public string? Suffix { get; set; }
    public string? TerminalId { get; set; }
    public int? TranType { get; set; }
    public decimal TransactionAmount { get; set; }
    public long TransactionNumber { get; set; }
    public DateTime TransactionTime { get; set; }
}
