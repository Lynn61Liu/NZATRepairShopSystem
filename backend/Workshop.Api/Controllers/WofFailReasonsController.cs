using System.Globalization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Models;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/wof-fail-reasons")]
public class WofFailReasonsController : ControllerBase
{
    private readonly AppDbContext _db;

    public WofFailReasonsController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken ct)
    {
        var reasons = await _db.WofFailReasons.AsNoTracking()
            .OrderBy(x => x.Label)
            .Select(x => new
            {
                id = x.Id.ToString(CultureInfo.InvariantCulture),
                label = x.Label,
                isActive = x.IsActive,
                createdAt = x.CreatedAt.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture),
                updatedAt = x.UpdatedAt.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture)
            })
            .ToListAsync(ct);

        return Ok(reasons);
    }

    public record WofFailReasonUpsertRequest(string Label, bool IsActive);

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] WofFailReasonUpsertRequest req, CancellationToken ct)
    {
        if (req is null || string.IsNullOrWhiteSpace(req.Label))
            return BadRequest(new { error = "Label is required." });

        var label = req.Label.Trim();
        var exists = await _db.WofFailReasons.AsNoTracking().AnyAsync(x => x.Label == label, ct);
        if (exists)
            return Conflict(new { error = "Fail reason already exists." });

        var reason = new WofFailReason
        {
            Label = label,
            IsActive = req.IsActive,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _db.WofFailReasons.Add(reason);
        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            id = reason.Id.ToString(CultureInfo.InvariantCulture),
            label = reason.Label,
            isActive = reason.IsActive,
            createdAt = reason.CreatedAt.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture),
            updatedAt = reason.UpdatedAt.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture)
        });
    }

    [HttpPut("{id:long}")]
    public async Task<IActionResult> Update(long id, [FromBody] WofFailReasonUpsertRequest req, CancellationToken ct)
    {
        if (req is null || string.IsNullOrWhiteSpace(req.Label))
            return BadRequest(new { error = "Label is required." });

        var reason = await _db.WofFailReasons.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (reason is null)
            return NotFound(new { error = "Fail reason not found." });

        var label = req.Label.Trim();
        var exists = await _db.WofFailReasons.AsNoTracking()
            .AnyAsync(x => x.Label == label && x.Id != id, ct);
        if (exists)
            return Conflict(new { error = "Fail reason already exists." });

        reason.Label = label;
        reason.IsActive = req.IsActive;
        reason.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            id = reason.Id.ToString(CultureInfo.InvariantCulture),
            label = reason.Label,
            isActive = reason.IsActive,
            createdAt = reason.CreatedAt.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture),
            updatedAt = reason.UpdatedAt.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture)
        });
    }

    [HttpDelete("{id:long}")]
    public async Task<IActionResult> Delete(long id, CancellationToken ct)
    {
        var reason = await _db.WofFailReasons.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (reason is null)
            return NotFound(new { error = "Fail reason not found." });

        _db.WofFailReasons.Remove(reason);
        await _db.SaveChangesAsync(ct);
        return Ok(new { success = true });
    }
}
