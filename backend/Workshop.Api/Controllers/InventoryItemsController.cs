using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Models;
using Workshop.Api.Services;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/inventory-items")]
public class InventoryItemsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly InventoryItemService _inventoryItemService;

    public InventoryItemsController(AppDbContext db, InventoryItemService inventoryItemService)
    {
        _db = db;
        _inventoryItemService = inventoryItemService;
    }

    [HttpGet]
    public async Task<IActionResult> Search([FromQuery] string? query, [FromQuery] int limit = 20, CancellationToken ct = default)
    {
        var items = await _inventoryItemService.SearchAsync(query, limit, ct);
        return Ok(items);
    }

    [HttpPost("import")]
    public async Task<IActionResult> Import(CancellationToken ct)
    {
        var result = await _inventoryItemService.ImportFromConfiguredFileAsync(ct);
        if (!result.Ok)
            return BadRequest(new { error = result.Error });

        return Ok(new
        {
            success = true,
            importedCount = result.ImportedCount,
            sourcePath = result.SourcePath,
        });
    }

    [HttpGet("manage")]
    public async Task<IActionResult> List([FromQuery] string? query, CancellationToken ct)
    {
        var search = query?.Trim();
        var itemsQuery = _db.InventoryItems.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var pattern = $"%{search}%";
            itemsQuery = itemsQuery.Where(x =>
                EF.Functions.ILike(x.ItemCode, pattern) ||
                EF.Functions.ILike(x.ItemName, pattern) ||
                EF.Functions.ILike(x.SalesDescription ?? "", pattern) ||
                EF.Functions.ILike(x.PurchasesDescription ?? "", pattern) ||
                EF.Functions.ILike(x.Status, pattern));
        }

        var items = await itemsQuery
            .OrderBy(x => x.ItemCode)
            .Select(x => new InventoryItemManageDto(
                x.Id,
                x.ItemCode,
                x.ItemName,
                x.Quantity,
                x.PurchasesDescription,
                x.PurchasesUnitPrice,
                x.PurchasesAccount,
                x.PurchasesTaxRate,
                x.SalesDescription,
                x.SalesUnitPrice,
                x.SalesAccount,
                x.SalesTaxRate,
                x.InventoryAssetAccount,
                x.CostOfGoodsSoldAccount,
                x.Status,
                x.InventoryType,
                x.CreatedAt,
                x.UpdatedAt))
            .ToListAsync(ct);

        return Ok(items);
    }

    [HttpPost("manage")]
    public async Task<IActionResult> Create([FromBody] UpsertInventoryItemRequest request, CancellationToken ct)
    {
        var validationError = Validate(request);
        if (validationError is not null)
            return BadRequest(new { error = validationError });

        var itemCode = request.ItemCode.Trim();
        var exists = await _db.InventoryItems.AsNoTracking()
            .AnyAsync(x => x.ItemCode == itemCode, ct);
        if (exists)
            return Conflict(new { error = $"Item code '{itemCode}' already exists." });

        var entity = new InventoryItem
        {
            ItemCode = itemCode,
            ItemName = request.ItemName.Trim(),
            Quantity = request.Quantity,
            PurchasesDescription = TrimOrNull(request.PurchasesDescription),
            PurchasesUnitPrice = request.PurchasesUnitPrice,
            PurchasesAccount = TrimOrNull(request.PurchasesAccount),
            PurchasesTaxRate = TrimOrNull(request.PurchasesTaxRate),
            SalesDescription = TrimOrNull(request.SalesDescription),
            SalesUnitPrice = request.SalesUnitPrice,
            SalesAccount = TrimOrNull(request.SalesAccount),
            SalesTaxRate = TrimOrNull(request.SalesTaxRate),
            InventoryAssetAccount = TrimOrNull(request.InventoryAssetAccount),
            CostOfGoodsSoldAccount = TrimOrNull(request.CostOfGoodsSoldAccount),
            Status = request.Status.Trim(),
            InventoryType = TrimOrNull(request.InventoryType),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };

        _db.InventoryItems.Add(entity);
        await _db.SaveChangesAsync(ct);

        return Created($"/api/inventory-items/manage/{entity.Id}", MapManageDto(entity));
    }

    [HttpPut("manage/{id:long}")]
    public async Task<IActionResult> Update(long id, [FromBody] UpsertInventoryItemRequest request, CancellationToken ct)
    {
        var validationError = Validate(request);
        if (validationError is not null)
            return BadRequest(new { error = validationError });

        var entity = await _db.InventoryItems.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (entity is null)
            return NotFound(new { error = "Inventory item not found." });

        var itemCode = request.ItemCode.Trim();
        var duplicate = await _db.InventoryItems.AsNoTracking()
            .AnyAsync(x => x.Id != id && x.ItemCode == itemCode, ct);
        if (duplicate)
            return Conflict(new { error = $"Item code '{itemCode}' already exists." });

        entity.ItemCode = itemCode;
        entity.ItemName = request.ItemName.Trim();
        entity.Quantity = request.Quantity;
        entity.PurchasesDescription = TrimOrNull(request.PurchasesDescription);
        entity.PurchasesUnitPrice = request.PurchasesUnitPrice;
        entity.PurchasesAccount = TrimOrNull(request.PurchasesAccount);
        entity.PurchasesTaxRate = TrimOrNull(request.PurchasesTaxRate);
        entity.SalesDescription = TrimOrNull(request.SalesDescription);
        entity.SalesUnitPrice = request.SalesUnitPrice;
        entity.SalesAccount = TrimOrNull(request.SalesAccount);
        entity.SalesTaxRate = TrimOrNull(request.SalesTaxRate);
        entity.InventoryAssetAccount = TrimOrNull(request.InventoryAssetAccount);
        entity.CostOfGoodsSoldAccount = TrimOrNull(request.CostOfGoodsSoldAccount);
        entity.Status = request.Status.Trim();
        entity.InventoryType = TrimOrNull(request.InventoryType);
        entity.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);
        return Ok(MapManageDto(entity));
    }

    [HttpPost("manage/sync-xero")]
    public async Task<IActionResult> SyncFromXero(CancellationToken ct)
    {
        var result = await _inventoryItemService.SyncFromXeroAsync(ct);
        if (!result.Ok)
            return StatusCode(result.StatusCode, new { error = result.Error });

        return Ok(new
        {
            success = true,
            syncedCount = result.SyncedCount,
            syncedAtUtc = result.SyncedAtUtc,
        });
    }

    [HttpGet("manage/sync-status")]
    public async Task<IActionResult> GetSyncStatus(CancellationToken ct)
    {
        var state = await _inventoryItemService.GetXeroInventorySyncStateAsync(ct);
        return Ok(new
        {
            syncKey = state.SyncKey,
            lastSyncedAt = state.LastSyncedAt,
            lastResult = state.LastResult,
            lastError = state.LastError,
            updatedAt = state.UpdatedAt,
        });
    }

    private static string? Validate(UpsertInventoryItemRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.ItemCode))
            return "Item code is required.";
        if (string.IsNullOrWhiteSpace(request.ItemName))
            return "Item name is required.";
        if (string.IsNullOrWhiteSpace(request.Status))
            return "Status is required.";
        return null;
    }

    private static string? TrimOrNull(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }

    private static InventoryItemManageDto MapManageDto(InventoryItem x) =>
        new(
            x.Id,
            x.ItemCode,
            x.ItemName,
            x.Quantity,
            x.PurchasesDescription,
            x.PurchasesUnitPrice,
            x.PurchasesAccount,
            x.PurchasesTaxRate,
            x.SalesDescription,
            x.SalesUnitPrice,
            x.SalesAccount,
            x.SalesTaxRate,
            x.InventoryAssetAccount,
            x.CostOfGoodsSoldAccount,
            x.Status,
            x.InventoryType,
            x.CreatedAt,
            x.UpdatedAt);
}

public sealed record UpsertInventoryItemRequest(
    string ItemCode,
    string ItemName,
    decimal? Quantity,
    string? PurchasesDescription,
    decimal? PurchasesUnitPrice,
    string? PurchasesAccount,
    string? PurchasesTaxRate,
    string? SalesDescription,
    decimal? SalesUnitPrice,
    string? SalesAccount,
    string? SalesTaxRate,
    string? InventoryAssetAccount,
    string? CostOfGoodsSoldAccount,
    string Status,
    string? InventoryType);

public sealed record InventoryItemManageDto(
    long Id,
    string ItemCode,
    string ItemName,
    decimal? Quantity,
    string? PurchasesDescription,
    decimal? PurchasesUnitPrice,
    string? PurchasesAccount,
    string? PurchasesTaxRate,
    string? SalesDescription,
    decimal? SalesUnitPrice,
    string? SalesAccount,
    string? SalesTaxRate,
    string? InventoryAssetAccount,
    string? CostOfGoodsSoldAccount,
    string Status,
    string? InventoryType,
    DateTime CreatedAt,
    DateTime UpdatedAt);
