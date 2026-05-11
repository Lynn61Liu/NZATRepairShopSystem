using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Models;
using Workshop.Api.Services;
using Workshop.Api.Utils;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/staff")]
public class StaffController : ControllerBase
{
    private const string StaffCacheKey = "dict:staff:v1";
    private static readonly TimeSpan StaffCacheDuration = TimeSpan.FromMinutes(30);

    private readonly AppDbContext _db;
    private readonly IAppCache _cache;

    public StaffController(AppDbContext db, IAppCache cache)
    {
        _db = db;
        _cache = cache;
    }

    public record StaffResponse(
        string Id,
        string Name,
        decimal CostRate,
        string CreatedAt,
        string UpdatedAt
    );

    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken ct)
    {
        var data = await _cache.GetOrCreateAsync(
            StaffCacheKey,
            StaffCacheDuration,
            async token => await _db.Staff.AsNoTracking()
                .Where(x => x.IsActive)
                .OrderBy(x => x.Name)
                .Select(x => new StaffResponse(
                    x.Id.ToString(),
                    x.Name,
                    x.CostRate,
                    DateTimeHelper.FormatUtc(x.CreatedAt),
                    DateTimeHelper.FormatUtc(x.UpdatedAt)
                ))
                .ToListAsync(token),
            ct
        ) ?? [];

        return Ok(data);
    }

    public record StaffPayload(string? Name, decimal? CostRate);

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] StaffPayload payload, CancellationToken ct)
    {
        if (payload is null || string.IsNullOrWhiteSpace(payload.Name))
            return BadRequest(new { error = "Name is required." });
        if (payload.CostRate is null || payload.CostRate <= 0)
            return BadRequest(new { error = "Cost rate must be greater than 0." });

        var entity = new Staff
        {
            Name = payload.Name.Trim(),
            CostRate = payload.CostRate.Value,
        };

        _db.Staff.Add(entity);
        await _db.SaveChangesAsync(ct);
        await _cache.RemoveAsync(StaffCacheKey, ct);

        return Ok(new StaffResponse(
            entity.Id.ToString(),
            entity.Name,
            entity.CostRate,
            DateTimeHelper.FormatUtc(entity.CreatedAt),
            DateTimeHelper.FormatUtc(entity.UpdatedAt)
        ));
    }

    [HttpPut("{id:long}")]
    public async Task<IActionResult> Update(long id, [FromBody] StaffPayload payload, CancellationToken ct)
    {
        var entity = await _db.Staff.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (entity is null) return NotFound(new { error = "Staff not found." });

        if (!string.IsNullOrWhiteSpace(payload.Name))
            entity.Name = payload.Name.Trim();
        if (payload.CostRate is > 0)
            entity.CostRate = payload.CostRate.Value;

        await _db.SaveChangesAsync(ct);
        await _cache.RemoveAsync(StaffCacheKey, ct);

        return Ok(new StaffResponse(
            entity.Id.ToString(),
            entity.Name,
            entity.CostRate,
            DateTimeHelper.FormatUtc(entity.CreatedAt),
            DateTimeHelper.FormatUtc(entity.UpdatedAt)
        ));
    }

    [HttpDelete("{id:long}")]
    public async Task<IActionResult> Delete(long id, [FromQuery] bool force = false, CancellationToken ct = default)
    {
        var entity = await _db.Staff.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (entity is null) return NotFound(new { error = "Staff not found." });
        if (!entity.IsActive) return Ok(new { success = true, relatedWorklogCount = 0 });

        var relatedWorklogCount = await _db.WorklogEntries.CountAsync(x => x.StaffId == id, ct);
        if (relatedWorklogCount > 0 && !force)
        {
            return Conflict(new
            {
                error = "Staff has related worklog records.",
                relatedWorklogCount,
                requiresConfirmation = true
            });
        }

        entity.IsActive = false;
        entity.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        await _cache.RemoveAsync(StaffCacheKey, ct);
        return Ok(new { success = true, relatedWorklogCount });
    }
}
