using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Models;
using Workshop.Api.Services;
using Workshop.Api.Utils;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/jobs/{id:long}/mech-services")]
public class MechServicesController : ControllerBase
{
    private static readonly TimeSpan MechServicesCacheDuration = TimeSpan.FromMinutes(2);
    private const string PaintBoardCacheKey = "jobs:paint-board:v1";

    private readonly IAppCache _cache;
    private readonly AppDbContext _db;
    private readonly InvoiceOutboxService _invoiceOutboxService;

    public MechServicesController(IAppCache cache, AppDbContext db, InvoiceOutboxService invoiceOutboxService)
    {
        _cache = cache;
        _db = db;
        _invoiceOutboxService = invoiceOutboxService;
    }

    public record MechServiceRequest(string? Description, decimal? Cost);

    [HttpGet]
    public async Task<IActionResult> GetAll(long id, CancellationToken ct)
    {
        var payload = await _cache.GetOrCreateJsonAsync(
            GetMechServicesCacheKey(id),
            MechServicesCacheDuration,
            async token =>
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
                        createdAt = DateTimeHelper.FormatUtc(x.CreatedAt),
                        updatedAt = DateTimeHelper.FormatUtc(x.UpdatedAt)
                    })
                    .ToListAsync(token);

                return JsonSerializer.Serialize(list);
            },
            ct
        );

        return Content(payload ?? "[]", "application/json");
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
        await _invoiceOutboxService.EnqueueSyncJobContentDraftAsync(id, null, ct);
        await InvalidateMechCachesAsync(id, ct);

        return Ok(new
        {
            id = service.Id.ToString(),
            jobId = service.JobId.ToString(),
            description = service.Description,
            cost = service.Cost,
            createdAt = DateTimeHelper.FormatUtc(service.CreatedAt),
            updatedAt = DateTimeHelper.FormatUtc(service.UpdatedAt)
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
        await _invoiceOutboxService.EnqueueSyncJobContentDraftAsync(id, null, ct);
        await InvalidateMechCachesAsync(id, ct);

        return Ok(new
        {
            id = service.Id.ToString(),
            jobId = service.JobId.ToString(),
            description = service.Description,
            cost = service.Cost,
            createdAt = DateTimeHelper.FormatUtc(service.CreatedAt),
            updatedAt = DateTimeHelper.FormatUtc(service.UpdatedAt)
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
        await _invoiceOutboxService.EnqueueSyncJobContentDraftAsync(id, null, ct);
        await InvalidateMechCachesAsync(id, ct);

        return Ok(new { success = true });
    }

    private async Task InvalidateMechCachesAsync(long jobId, CancellationToken ct)
    {
        await _cache.RemoveAsync(GetMechServicesCacheKey(jobId), ct);
        await _cache.RemoveAsync(GetJobDetailCacheKey(jobId), ct);
        await _cache.RemoveAsync(PaintBoardCacheKey, ct);
    }

    private static string GetMechServicesCacheKey(long jobId)
        => $"job:mech-services:{jobId}:v1";

    private static string GetJobDetailCacheKey(long jobId)
        => $"job:detail:{jobId}:v1";
}
