using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Models;
using Workshop.Api.Services;
using Workshop.Api.Utils;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/po")]
public class PoStateController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly GmailFollowUpSenderService _gmailFollowUpSenderService;
    private readonly JobPoStateService _jobPoStateService;

    public PoStateController(
        AppDbContext db,
        GmailFollowUpSenderService gmailFollowUpSenderService,
        JobPoStateService jobPoStateService)
    {
        _db = db;
        _gmailFollowUpSenderService = gmailFollowUpSenderService;
        _jobPoStateService = jobPoStateService;
    }

    [HttpGet("dashboard")]
    public async Task<IActionResult> GetDashboard(CancellationToken ct)
    {
        await _jobPoStateService.EnsureStatesForNeedsPoJobsAsync(ct);

        var states = await (
                from state in _db.JobPoStates.AsNoTracking()
                join job in _db.Jobs.AsNoTracking() on state.JobId equals job.Id
                where job.NeedsPo
                select state
            )
            .ToListAsync(ct);

        return Ok(new
        {
            summary = new
            {
                needsPo = states.Count,
                draft = states.Count(x => x.Status == JobPoStateStatus.Draft),
                awaitingReply = states.Count(x => x.Status == JobPoStateStatus.AwaitingReply),
                escalationRequired = states.Count(x => x.Status == JobPoStateStatus.EscalationRequired),
                pendingConfirmation = states.Count(x => x.Status == JobPoStateStatus.PendingConfirmation),
                poConfirmed = states.Count(x => x.Status == JobPoStateStatus.PoConfirmed),
            },
            generatedAt = DateTime.UtcNow,
        });
    }

    [HttpGet("jobs")]
    public async Task<IActionResult> GetJobs(
        [FromQuery] string? status,
        [FromQuery] string? search,
        CancellationToken ct)
    {
        await _jobPoStateService.EnsureStatesForNeedsPoJobsAsync(ct);

        var normalizedStatus = NormalizeStatusFilter(status);
        var normalizedSearch = search?.Trim().ToLowerInvariant();

        var states = await (
                from state in _db.JobPoStates.AsNoTracking()
                join job in _db.Jobs.AsNoTracking() on state.JobId equals job.Id
                where job.NeedsPo
                select state
            )
            .OrderBy(x => x.JobId)
            .ToListAsync(ct);

        var filteredStates = normalizedStatus.HasValue
            ? states.Where(x => x.Status == normalizedStatus.Value).ToList()
            : states;

        var jobIds = filteredStates.Select(x => x.JobId).Distinct().ToArray();
        if (jobIds.Length == 0)
            return Ok(new { items = Array.Empty<object>(), total = 0 });

        var jobs = await (
            from j in _db.Jobs.AsNoTracking()
            join v in _db.Vehicles.AsNoTracking() on j.VehicleId equals v.Id
            join c in _db.Customers.AsNoTracking() on j.CustomerId equals c.Id
            where jobIds.Contains(j.Id)
            select new
            {
                j.Id,
                VehiclePlate = v.Plate,
                CustomerName = c.Name,
            })
            .ToListAsync(ct);

        var unreadReplies = await _db.GmailMessageLogs.AsNoTracking()
            .Where(x => x.Direction == "reply" && !x.IsRead)
            .Where(x => !string.IsNullOrWhiteSpace(x.CorrelationId))
            .Select(x => new
            {
                x.CorrelationId,
                x.GmailMessageId,
            })
            .ToListAsync(ct);

        var unreadReplyCounts = unreadReplies
            .Select(x => new
            {
                JobId = ParseJobIdFromCorrelationId(x.CorrelationId),
                x.GmailMessageId,
            })
            .Where(x => x.JobId.HasValue && jobIds.Contains(x.JobId.Value))
            .GroupBy(x => x.JobId!.Value)
            .ToDictionary(x => x.Key, x => x.Count());

        var items = filteredStates
            .Join(
                jobs,
                state => state.JobId,
                job => job.Id,
                (state, job) => new
                {
                    id = state.JobId.ToString(),
                    plate = job.VehiclePlate,
                    customer = job.CustomerName,
                    supplier = state.CounterpartyEmail ?? "",
                    status = MapStatusLabel(state.Status),
                    confirmedPo = state.ConfirmedPoNumber ?? "",
                detectedPo = state.DetectedPoNumber ?? "",
                unreadReplies = unreadReplyCounts.TryGetValue(state.JobId, out var unreadCount) ? unreadCount : 0,
                followUpCount = state.FollowUpCount,
                followUpEnabled = state.FollowUpEnabled,
                firstSent = FormatDateTime(state.FirstRequestSentAt),
                lastSent = FormatDateTime(state.LastFollowUpSentAt ?? state.LastRequestSentAt),
                lastReply = FormatDateTime(state.LastSupplierReplyAt),
                nextFollowUp = FormatDateTime(state.NextFollowUpDueAt),
                })
            .Where(item =>
                string.IsNullOrWhiteSpace(normalizedSearch) ||
                item.id.Contains(normalizedSearch!, StringComparison.OrdinalIgnoreCase) ||
                item.plate.Contains(normalizedSearch!, StringComparison.OrdinalIgnoreCase) ||
                item.customer.Contains(normalizedSearch!, StringComparison.OrdinalIgnoreCase) ||
                item.supplier.Contains(normalizedSearch!, StringComparison.OrdinalIgnoreCase) ||
                item.confirmedPo.Contains(normalizedSearch!, StringComparison.OrdinalIgnoreCase) ||
                item.detectedPo.Contains(normalizedSearch!, StringComparison.OrdinalIgnoreCase))
            .ToList();

        return Ok(new
        {
            items,
            total = items.Count,
        });
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

    [HttpPost("jobs/{jobId:long}/send-follow-up")]
    public async Task<IActionResult> SendFollowUp(long jobId, CancellationToken ct)
    {
        if (await HasPaidInvoiceAsync(jobId, ct))
            return BadRequest(new { error = "PO Request data is locked because the invoice is already marked as Paid in Xero." });

        var state = await _db.JobPoStates.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (state is null)
            return NotFound(new { error = "PO state not found." });

        if (state.Status != JobPoStateStatus.AwaitingReply && state.Status != JobPoStateStatus.EscalationRequired)
            return BadRequest(new { error = "Current PO state does not allow follow-up." });

        var sent = await _gmailFollowUpSenderService.SendFollowUpAsync(state, ct);
        if (!sent)
            return BadRequest(new { error = "Failed to send follow-up email." });

        await _jobPoStateService.SyncStateForJobAsync(jobId, ct);

        var refreshed = await _db.JobPoStates.AsNoTracking()
            .Where(x => x.JobId == jobId)
            .Select(x => new
            {
                jobId = x.JobId,
                status = x.Status.ToString(),
                x.FollowUpCount,
                x.LastFollowUpSentAt,
                x.NextFollowUpDueAt,
            })
            .FirstAsync(ct);

        return Ok(new
        {
            success = true,
            refreshed.jobId,
            refreshed.status,
            refreshed.FollowUpCount,
            refreshed.LastFollowUpSentAt,
            refreshed.NextFollowUpDueAt,
        });
    }

    [HttpPost("jobs/{jobId:long}/cancel-follow-up")]
    public async Task<IActionResult> CancelFollowUp(long jobId, CancellationToken ct)
    {
        if (await HasPaidInvoiceAsync(jobId, ct))
            return BadRequest(new { error = "PO Request data is locked because the invoice is already marked as Paid in Xero." });

        var state = await _db.JobPoStates.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (state is null)
            return NotFound(new { error = "PO state not found." });

        state.FollowUpEnabled = false;
        state.NextFollowUpDueAt = null;
        state.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        await _jobPoStateService.SyncStateForJobAsync(jobId, ct);

        var refreshed = await _db.JobPoStates.AsNoTracking()
            .Where(x => x.JobId == jobId)
            .Select(x => new
            {
                jobId = x.JobId,
                status = x.Status.ToString(),
                x.FollowUpEnabled,
                x.FollowUpCount,
                x.LastFollowUpSentAt,
                x.NextFollowUpDueAt,
            })
            .FirstAsync(ct);

        return Ok(new
        {
            success = true,
            refreshed.jobId,
            refreshed.status,
            refreshed.FollowUpEnabled,
            refreshed.FollowUpCount,
            refreshed.LastFollowUpSentAt,
            refreshed.NextFollowUpDueAt,
        });
    }

    private static JobPoStateStatus? NormalizeStatusFilter(string? value)
    {
        return value?.Trim().ToLowerInvariant() switch
        {
            null or "" or "needspo" => null,
            "draft" => JobPoStateStatus.Draft,
            "awaitingreply" => JobPoStateStatus.AwaitingReply,
            "escalationrequired" => JobPoStateStatus.EscalationRequired,
            "pendingconfirmation" => JobPoStateStatus.PendingConfirmation,
            "poconfirmed" => JobPoStateStatus.PoConfirmed,
            _ => null,
        };
    }

    private static long? ParseJobIdFromCorrelationId(string? correlationId)
    {
        if (string.IsNullOrWhiteSpace(correlationId))
            return null;

        var parts = correlationId.Split('-', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length < 3 || !string.Equals(parts[0], "PO", StringComparison.OrdinalIgnoreCase))
            return null;

        return long.TryParse(parts[1], out var jobId) ? jobId : null;
    }

    private static string MapStatusLabel(JobPoStateStatus status) =>
        status switch
        {
            JobPoStateStatus.AwaitingReply => "Awaiting Reply",
            JobPoStateStatus.PendingConfirmation => "Pending Confirmation",
            JobPoStateStatus.PoConfirmed => "PO Confirmed",
            JobPoStateStatus.EscalationRequired => "Escalation Required",
            _ => "Draft",
        };

    private static string FormatDateTime(DateTime? value) =>
        DateTimeHelper.FormatNz(value, "yyyy-MM-dd HH:mm", "-");

    private Task<bool> HasPaidInvoiceAsync(long jobId, CancellationToken ct) =>
        _db.JobInvoices.AsNoTracking()
            .AnyAsync(x => x.JobId == jobId && x.ExternalStatus != null && x.ExternalStatus.ToUpper() == "PAID", ct);
}
