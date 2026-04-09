using Microsoft.AspNetCore.Mvc;
using Workshop.Api.Services;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/jobs/{id:long}/parts-services")]
public class PartsServicesController : ControllerBase
{
    private static readonly TimeSpan PartsServicesCacheDuration = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan PartsFlowCacheDuration = TimeSpan.FromSeconds(20);

    private readonly IAppCache _cache;
    private readonly PartsServicesService _partsService;

    public PartsServicesController(IAppCache cache, PartsServicesService partsService)
    {
        _cache = cache;
        _partsService = partsService;
    }

    [HttpGet]
    public async Task<IActionResult> GetServices(long id, CancellationToken ct)
    {
        var payload = await _cache.GetOrCreateJsonAsync(
            GetPartsServicesCacheKey(id),
            PartsServicesCacheDuration,
            async token =>
            {
                var result = await _partsService.GetServices(id, token);
                if (result.StatusCode != 200)
                    return null;

                return System.Text.Json.JsonSerializer.Serialize(result.Payload);
            },
            ct
        );

        if (payload is null)
            return NotFound(new { error = "Job not found." });

        return Content(payload, "application/json");
    }

    [HttpGet("~/api/parts-flow")]
    public async Task<IActionResult> GetPartFlow(CancellationToken ct)
    {
        var payload = await _cache.GetOrCreateJsonAsync(
            GetPartsFlowCacheKey(),
            PartsFlowCacheDuration,
            async token =>
            {
                var result = await _partsService.GetPartFlow(token);
                if (result.StatusCode != 200)
                    return null;

                return System.Text.Json.JsonSerializer.Serialize(result.Payload);
            },
            ct
        );

        if (payload is null)
            return StatusCode(500, new { error = "Failed to load parts flow." });

        return Content(payload, "application/json");
    }

    [HttpPost("{serviceId:long}/arrival-notice")]
    public async Task<IActionResult> SendArrivalNotice(long id, long serviceId, [FromBody] SendArrivalNoticeRequest? request, CancellationToken ct)
    {
        if (request is null)
            return BadRequest(new { error = "Missing payload." });

        var result = await _partsService.SendArrivalNotice(id, serviceId, request, ct);
        await InvalidatePartsCachesAsync(id, result, ct);
        return ToActionResult(result);
    }

    [HttpPost]
    public async Task<IActionResult> CreateService(long id, [FromBody] CreatePartsServiceRequest? request, CancellationToken ct)
    {
        if (request is null)
            return BadRequest(new { error = "Missing payload." });

        var result = await _partsService.CreateService(id, request, ct);
        await InvalidatePartsCachesAsync(id, result, ct);
        return ToActionResult(result);
    }

    [HttpPut("{serviceId:long}")]
    public async Task<IActionResult> UpdateService(long id, long serviceId, [FromBody] UpdatePartsServiceRequest? request, CancellationToken ct)
    {
        if (request is null)
            return BadRequest(new { error = "Missing payload." });

        var result = await _partsService.UpdateService(id, serviceId, request, ct);
        await InvalidatePartsCachesAsync(id, result, ct);
        return ToActionResult(result);
    }

    [HttpDelete("{serviceId:long}")]
    public async Task<IActionResult> DeleteService(long id, long serviceId, CancellationToken ct)
    {
        var result = await _partsService.DeleteService(id, serviceId, ct);
        await InvalidatePartsCachesAsync(id, result, ct);
        return ToActionResult(result);
    }

    [HttpPost("{serviceId:long}/notes")]
    public async Task<IActionResult> CreateNote(long id, long serviceId, [FromBody] NoteRequest? request, CancellationToken ct)
    {
        if (request is null)
            return BadRequest(new { error = "Missing payload." });

        var result = await _partsService.CreateNote(id, serviceId, request, ct);
        await InvalidatePartsCachesAsync(id, result, ct);
        return ToActionResult(result);
    }

    [HttpPut("~/api/jobs/{id:long}/parts-notes/{noteId:long}")]
    public async Task<IActionResult> UpdateNote(long id, long noteId, [FromBody] NoteRequest? request, CancellationToken ct)
    {
        if (request is null)
            return BadRequest(new { error = "Missing payload." });

        var result = await _partsService.UpdateNote(id, noteId, request, ct);
        await InvalidatePartsCachesAsync(id, result, ct);
        return ToActionResult(result);
    }

    [HttpDelete("~/api/jobs/{id:long}/parts-notes/{noteId:long}")]
    public async Task<IActionResult> DeleteNote(long id, long noteId, CancellationToken ct)
    {
        var result = await _partsService.DeleteNote(id, noteId, ct);
        await InvalidatePartsCachesAsync(id, result, ct);
        return ToActionResult(result);
    }

    private async Task InvalidatePartsCachesAsync(long jobId, WofServiceResult result, CancellationToken ct)
    {
        if (result.StatusCode != 200)
            return;

        await _cache.RemoveAsync(GetPartsServicesCacheKey(jobId), ct);
        await _cache.RemoveAsync(GetJobDetailCacheKey(jobId), ct);
        await _cache.RemoveAsync(GetPartsFlowCacheKey(), ct);
    }

    private static string GetPartsServicesCacheKey(long jobId)
        => $"job:parts-services:{jobId}:v1";

    private static string GetJobDetailCacheKey(long jobId)
        => $"job:detail:{jobId}:v1";

    private static string GetPartsFlowCacheKey()
        => "parts-flow:v1";

    private IActionResult ToActionResult(WofServiceResult result)
    {
        if (result.StatusCode == 200)
            return Ok(result.Payload);

        return StatusCode(result.StatusCode, new { error = result.Error });
    }
}
