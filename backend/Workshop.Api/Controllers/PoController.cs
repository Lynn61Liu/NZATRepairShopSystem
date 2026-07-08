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
        var result = await _poTodoService.CompleteAsync(request?.JobIds ?? [], ct);
        return Ok(result);
    }

    public sealed record ConfirmPoRequest(string? PoNumber);

    public sealed record CompleteRequest(long[]? JobIds);
}
