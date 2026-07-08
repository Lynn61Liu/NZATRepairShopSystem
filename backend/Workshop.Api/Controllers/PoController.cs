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
    public async Task<IActionResult> GetTodo([FromQuery] string? status, CancellationToken ct)
    {
        var result = await _poTodoService.GetTodoAsync(status, ct);
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

    [HttpPost("todo/sync")]
    public async Task<IActionResult> Sync(CancellationToken ct)
    {
        var result = await _poTodoService.SyncActiveAsync(ct);
        return Ok(result);
    }

    [HttpPost("jobs/{jobId:long}/manual-confirm-sent")]
    public async Task<IActionResult> ManualConfirmSent(long jobId, CancellationToken ct)
    {
        var result = await _poTodoService.ManualConfirmSentAsync(jobId, ct);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpPost("jobs/{jobId:long}/confirm-po")]
    public async Task<IActionResult> ConfirmPo(long jobId, [FromBody] ConfirmPoRequest? request, CancellationToken ct)
    {
        var result = await _poTodoService.ConfirmPoAsync(jobId, request?.PoNumber, ct);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpPost("jobs/complete")]
    public async Task<IActionResult> Complete([FromBody] CompleteRequest? request, CancellationToken ct)
    {
        if (request?.JobIds is null)
            return BadRequest(new { error = "jobIds is required." });

        var result = await _poTodoService.CompleteAsync(request.JobIds, ct);
        return Ok(result);
    }

    public sealed record ConfirmPoRequest(string? PoNumber);

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
