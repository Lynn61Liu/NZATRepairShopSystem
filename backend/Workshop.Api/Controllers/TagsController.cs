using System.Globalization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Models;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/tags")]
public class TagsController : ControllerBase
{
    private readonly AppDbContext _db;

    public TagsController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken ct)
    {
        var rows = await _db.Tags.AsNoTracking()
            .OrderBy(x => x.Name)
            .Select(x => new
            {
                id = x.Id.ToString(CultureInfo.InvariantCulture),
                name = x.Name,
                isActive = x.IsActive,
                createdAt = x.CreatedAt.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture),
                updatedAt = x.UpdatedAt.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture)
            })
            .ToListAsync(ct);

        return Ok(rows);
    }

    public record TagUpsertRequest(string Name);

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] TagUpsertRequest req, CancellationToken ct)
    {
        if (req is null || string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { error = "Name is required." });

        var name = req.Name.Trim();
        var exists = await _db.Tags.AsNoTracking().AnyAsync(x => x.Name == name, ct);
        if (exists)
            return Conflict(new { error = "Tag already exists." });

        var tag = new Tag
        {
            Name = name,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _db.Tags.Add(tag);
        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            id = tag.Id.ToString(CultureInfo.InvariantCulture),
            name = tag.Name,
            isActive = tag.IsActive,
            createdAt = tag.CreatedAt.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture),
            updatedAt = tag.UpdatedAt.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture)
        });
    }

    [HttpPut("{id:long}")]
    public async Task<IActionResult> Update(long id, [FromBody] TagUpsertRequest req, CancellationToken ct)
    {
        if (req is null || string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { error = "Name is required." });

        var tag = await _db.Tags.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (tag is null)
            return NotFound(new { error = "Tag not found." });

        var name = req.Name.Trim();
        var exists = await _db.Tags.AsNoTracking()
            .AnyAsync(x => x.Name == name && x.Id != id, ct);
        if (exists)
            return Conflict(new { error = "Tag already exists." });

        tag.Name = name;
        tag.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            id = tag.Id.ToString(CultureInfo.InvariantCulture),
            name = tag.Name,
            isActive = tag.IsActive,
            createdAt = tag.CreatedAt.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture),
            updatedAt = tag.UpdatedAt.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture)
        });
    }

    [HttpDelete("{id:long}")]
    public async Task<IActionResult> Delete(long id, CancellationToken ct)
    {
        var tag = await _db.Tags.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (tag is null)
            return NotFound(new { error = "Tag not found." });

        var inUse = await _db.JobTags.AsNoTracking().AnyAsync(x => x.TagId == id, ct);
        if (inUse)
            return BadRequest(new { error = "Tag is used by jobs and cannot be deleted." });

        _db.Tags.Remove(tag);
        await _db.SaveChangesAsync(ct);
        return Ok(new { success = true });
    }
}
