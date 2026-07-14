using Microsoft.AspNetCore.Mvc;
using Workshop.Api.Services;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/po")]
public sealed class PoController : ControllerBase
{
    private readonly PoTodoService _poTodoService;

    public PoController(PoTodoService poTodoService)
    {
        _poTodoService = poTodoService;
    }

    [HttpGet("todo")]
    public async Task<IActionResult> GetTodo(
        [FromQuery] string? status,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 500,
        CancellationToken ct = default)
    {
        var result = await _poTodoService.GetTodoAsync(status, page, pageSize, ct);
        return Ok(result);
    }

    [HttpGet("dashboard")]
    public async Task<IActionResult> GetDashboard(CancellationToken ct)
    {
        var result = await _poTodoService.GetTodoAsync(null, ct);
        var summary = new
        {
            needsPo = result.Total,
            draft = result.Items.Count(x => x.Status == "draft"),
            awaitingReply = result.Items.Count(x => x.Status == "awaitingReply"),
            escalationRequired = result.Items.Count(x => x.Status == "escalationRequired"),
            pendingConfirmation = result.Items.Count(x => x.Status == "pendingConfirmation"),
            poConfirmed = result.Items.Count(x => x.Status == "poConfirmed"),
        };

        return Ok(new
        {
            summary,
            generatedAt = DateTime.UtcNow,
        });
    }

    [HttpGet("jobs")]
    public async Task<IActionResult> GetJobs([FromQuery] string? status, [FromQuery] string? search, CancellationToken ct)
    {
        var result = await _poTodoService.GetTodoAsync(null, ct);
        var normalizedStatus = NormalizeLegacyStatus(status);
        var normalizedSearch = search?.Trim();

        var items = result.Items
            .Where(x => normalizedStatus is null || x.Status == normalizedStatus)
            .Where(x =>
                string.IsNullOrWhiteSpace(normalizedSearch) ||
                Contains(x.JobId.ToString(), normalizedSearch) ||
                Contains(x.Plate, normalizedSearch) ||
                Contains(x.Code, normalizedSearch) ||
                Contains(x.Model, normalizedSearch) ||
                Contains(x.DetectedPoNumber, normalizedSearch) ||
                Contains(x.ConfirmedPoNumber, normalizedSearch))
            .Select(x => new
            {
                id = x.JobId.ToString(),
                plate = x.Plate,
                customer = x.Code,
                supplier = "",
                status = ToLegacyStatus(x.Status),
                confirmedPo = x.ConfirmedPoNumber,
                detectedPo = x.DetectedPoNumber,
                unreadReplies = 0,
                followUpCount = 0,
                followUpEnabled = x.Status == "awaitingReply",
                firstSent = FormatDateTime(x.FirstRequestSentAt),
                lastSent = FormatDateTime(x.LastRequestSentAt) ?? "-",
                lastReply = FormatDateTime(x.LastSupplierReplyAt),
                nextFollowUp = "",
            })
            .ToList();

        return Ok(new
        {
            total = items.Count,
            items,
        });
    }
 
 // RUN ONETIME TO SYNC ALL EXISTING JOBS WITH GMAIL
 [HttpPost("todo/sync-dashboard")]
public async Task<IActionResult> SyncDashboard(CancellationToken ct = default)
{
    var result = await _poTodoService.SyncDashboardGmailAsync(ct);
    return Ok(result);
}

// end api
// TEST XERO SYNC FRO PO
[HttpPost("todo/test-draft-xero")]
public async Task<IActionResult> SyncDraftXero(CancellationToken ct = default)
{
    var result = await _poTodoService.DebugSyncDraftPoInvoicesFromXeroAsync(ct);
    return Ok(result);
}
// END TEST XERO SYNC FRO PO
    [HttpPost("todo/sync")]
    public async Task<IActionResult> Sync(
        [FromQuery] string? status,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 15,
        CancellationToken ct = default)
    {
        var result = await _poTodoService.SyncActiveAsync(status, page, pageSize, ct);
        return Ok(result);
    }

    [HttpPost("jobs/{jobId:long}/manual-confirm-sent")]
    public async Task<IActionResult> ManualConfirmSent(long jobId, CancellationToken ct)
    {
        var result = await _poTodoService.ManualConfirmSentAsync(jobId, ct);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpGet("jobs/{jobId:long}/draft-preview")]
    public async Task<IActionResult> GetDraftPreview(long jobId, CancellationToken ct)
    {
        var result = await _poTodoService.GetDraftPreviewAsync(jobId, ct);
        return result is null ? NotFound(new { error = "PO draft preview is not available." }) : Ok(result);
    }

    [HttpPost("jobs/{jobId:long}/confirm-po")]
    public async Task<IActionResult> ConfirmPo(long jobId, [FromBody] ConfirmPoRequest? request, CancellationToken ct)
    {
        var result = await _poTodoService.ConfirmPoAsync(jobId, request?.PoNumber, request?.SendInvoice == true, ct);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpPost("jobs/confirm-po-batch")]
    public async Task<IActionResult> ConfirmPoBatch([FromBody] ConfirmPoBatchRequest? request, CancellationToken ct)
    {
        if (request?.Items is null || request.Items.Length == 0)
            return BadRequest(new { error = "At least one job is required." });

        var results = await _poTodoService.ConfirmPoBatchAsync(
            request.Items.Select(x => new PoBatchConfirmItem(x.JobId, x.PoNumber)).ToArray(),
            request.SendInvoice,
            ct);
        return Ok(new
        {
            total = results.Count,
            succeeded = results.Count(x => x.Success),
            failed = results.Count(x => !x.Success),
            results,
        });
    }

    [HttpPost("jobs/xero-summaries")]
    public async Task<IActionResult> RefreshXeroSummaries([FromBody] XeroSummaryRequest? request, CancellationToken ct)
    {
        if (request?.JobIds is null)
            return BadRequest(new { error = "jobIds is required." });
        return Ok(new { items = await _poTodoService.RefreshXeroSummariesAsync(request.JobIds, ct) });
    }

    [HttpPost("jobs/complete")]
    public async Task<IActionResult> Complete([FromBody] CompleteRequest? request, CancellationToken ct)
    {
        if (request?.JobIds is null)
            return BadRequest(new { error = "jobIds is required." });

        var result = await _poTodoService.CompleteAsync(request.JobIds, ct);
        return Ok(result);
    }

    public sealed record ConfirmPoRequest(string? PoNumber, bool SendInvoice = false);
    public sealed record ConfirmPoBatchItem(long JobId, string? PoNumber);
    public sealed record ConfirmPoBatchRequest(ConfirmPoBatchItem[]? Items, bool SendInvoice = false);
    public sealed record XeroSummaryRequest(long[]? JobIds);

    public sealed record CompleteRequest(long[]? JobIds);

    private static string? NormalizeLegacyStatus(string? status)
    {
        if (string.IsNullOrWhiteSpace(status))
            return null;

        var normalized = status.Trim().Replace(" ", "", StringComparison.OrdinalIgnoreCase);
        return normalized.ToLowerInvariant() switch
        {
            "draft" => "draft",
            "awaitingreply" => "awaitingReply",
            "escalationrequired" => "escalationRequired",
            "pendingconfirmation" => "pendingConfirmation",
            "poconfirmed" => "poConfirmed",
            _ => "__unknown__",
        };
    }

    private static string ToLegacyStatus(string status) => status switch
    {
        "draft" => "Draft",
        "awaitingReply" => "Awaiting Reply",
        "escalationRequired" => "Escalation Required",
        "pendingConfirmation" => "Pending Confirmation",
        "poConfirmed" => "PO Confirmed",
        _ => "Draft",
    };

    private static string? FormatDateTime(DateTime? value) =>
        value.HasValue ? value.Value.ToString("yyyy-MM-dd HH:mm") : null;

    private static bool Contains(string? value, string search) =>
        !string.IsNullOrWhiteSpace(value) &&
        value.Contains(search, StringComparison.OrdinalIgnoreCase);
}
