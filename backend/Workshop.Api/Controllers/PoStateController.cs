using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/po")]
public class PoStateController : ControllerBase
{
    private readonly AppDbContext _db;

    public PoStateController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet("states")]
    public async Task<IActionResult> GetStates(CancellationToken ct)
    {
        var items = await _db.JobPoStates.AsNoTracking()
            .OrderBy(x => x.JobId)
            .Select(x => new
            {
                jobId = x.JobId,
                x.CorrelationId,
                status = x.Status.ToString(),
                x.RequiresAdminAttention,
                x.AdminAttentionReason,
                x.ConfirmedPoNumber,
                x.DetectedPoNumber,
                x.CounterpartyEmail,
                x.FollowUpCount,
                x.FirstRequestSentAt,
                x.LastRequestSentAt,
                x.LastFollowUpSentAt,
                x.LastSupplierReplyAt,
                x.LastSyncedAt,
                x.UpdatedAt,
            })
            .ToListAsync(ct);

        return Ok(items);
    }

    [HttpGet("jobs/{jobId:long}/state")]
    public async Task<IActionResult> GetState(long jobId, CancellationToken ct)
    {
        var item = await _db.JobPoStates.AsNoTracking()
            .Where(x => x.JobId == jobId)
            .Select(x => new
            {
                jobId = x.JobId,
                x.CorrelationId,
                status = x.Status.ToString(),
                x.RequiresAdminAttention,
                x.AdminAttentionReason,
                x.ConfirmedPoNumber,
                x.DetectedPoNumber,
                x.CounterpartyEmail,
                x.FollowUpCount,
                x.FirstRequestSentAt,
                x.LastRequestSentAt,
                x.LastFollowUpSentAt,
                x.LastSupplierReplyAt,
                x.LastSyncedAt,
                x.UpdatedAt,
            })
            .FirstOrDefaultAsync(ct);

        return item is null ? NotFound(new { error = "PO state not found." }) : Ok(item);
    }
}
