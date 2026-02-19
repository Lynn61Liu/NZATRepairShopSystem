using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Models;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/jobs/{id:long}/mech-services")]
public class MechServicesController : ControllerBase
{
    private readonly AppDbContext _db;

    public MechServicesController(AppDbContext db)
    {
        _db = db;
    }

    public record MechServiceRequest(string? Description, decimal? Cost);

    [HttpGet]
    public async Task<IActionResult> GetAll(long id, CancellationToken ct)
    {
        var list = await _db.JobMechServices.AsNoTracking()
            .Where(x => x.JobId == id)
            .OrderByDescending(x => x.CreatedAt)
            .Select(x => new
            {
                id = x.Id.ToString(),
                jobId = x.JobId.ToString(),
                description = x.Description,
                cost = x.Cost,
                createdAt = x.CreatedAt,
                updatedAt = x.UpdatedAt
            })
            .ToListAsync(ct);

        return Ok(list);
    }

    [HttpPost]
    public async Task<IActionResult> Create(long id, [FromBody] MechServiceRequest? request, CancellationToken ct)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.Description))
            return BadRequest(new { error = "Description is required." });

        var exists = await _db.Jobs.AsNoTracking().AnyAsync(x => x.Id == id, ct);
        if (!exists)
            return NotFound(new { error = "Job not found." });

        var now = DateTime.UtcNow;
        var service = new JobMechService
        {
            JobId = id,
            Description = request.Description.Trim(),
            Cost = request.Cost,
            CreatedAt = now,
            UpdatedAt = now,
        };

        _db.JobMechServices.Add(service);
        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            id = service.Id.ToString(),
            jobId = service.JobId.ToString(),
            description = service.Description,
            cost = service.Cost,
            createdAt = service.CreatedAt,
            updatedAt = service.UpdatedAt
        });
    }

    [HttpPut("{serviceId:long}")]
    public async Task<IActionResult> Update(long id, long serviceId, [FromBody] MechServiceRequest? request, CancellationToken ct)
    {
        if (request is null)
            return BadRequest(new { error = "Missing payload." });

        var service = await _db.JobMechServices
            .FirstOrDefaultAsync(x => x.Id == serviceId && x.JobId == id, ct);
        if (service is null)
            return NotFound(new { error = "Mech service not found." });

        if (!string.IsNullOrWhiteSpace(request.Description))
            service.Description = request.Description.Trim();
        if (request.Cost.HasValue)
            service.Cost = request.Cost;
        if (request.Description is not null || request.Cost.HasValue)
            service.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            id = service.Id.ToString(),
            jobId = service.JobId.ToString(),
            description = service.Description,
            cost = service.Cost,
            createdAt = service.CreatedAt,
            updatedAt = service.UpdatedAt
        });
    }

    [HttpDelete("{serviceId:long}")]
    public async Task<IActionResult> Delete(long id, long serviceId, CancellationToken ct)
    {
        var deleted = await _db.JobMechServices
            .Where(x => x.JobId == id && x.Id == serviceId)
            .ExecuteDeleteAsync(ct);
        if (deleted == 0)
            return NotFound(new { error = "Mech service not found." });

        return Ok(new { success = true });
    }
}
