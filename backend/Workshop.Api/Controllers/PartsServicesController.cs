using Microsoft.AspNetCore.Mvc;
using Workshop.Api.Services;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/jobs/{id:long}/parts-services")]
public class PartsServicesController : ControllerBase
{
    private readonly PartsServicesService _partsService;

    public PartsServicesController(PartsServicesService partsService)
    {
        _partsService = partsService;
    }

    [HttpGet]
    public async Task<IActionResult> GetServices(long id, CancellationToken ct)
    {
        var result = await _partsService.GetServices(id, ct);
        return ToActionResult(result);
    }

    [HttpGet("~/api/parts-flow")]
    public async Task<IActionResult> GetPartFlow(CancellationToken ct)
    {
        var result = await _partsService.GetPartFlow(ct);
        return ToActionResult(result);
    }

    [HttpPost]
    public async Task<IActionResult> CreateService(long id, [FromBody] CreatePartsServiceRequest? request, CancellationToken ct)
    {
        if (request is null)
            return BadRequest(new { error = "Missing payload." });

        var result = await _partsService.CreateService(id, request, ct);
        return ToActionResult(result);
    }

    [HttpPut("{serviceId:long}")]
    public async Task<IActionResult> UpdateService(long id, long serviceId, [FromBody] UpdatePartsServiceRequest? request, CancellationToken ct)
    {
        if (request is null)
            return BadRequest(new { error = "Missing payload." });

        var result = await _partsService.UpdateService(id, serviceId, request, ct);
        return ToActionResult(result);
    }

    [HttpDelete("{serviceId:long}")]
    public async Task<IActionResult> DeleteService(long id, long serviceId, CancellationToken ct)
    {
        var result = await _partsService.DeleteService(id, serviceId, ct);
        return ToActionResult(result);
    }

    [HttpPost("{serviceId:long}/notes")]
    public async Task<IActionResult> CreateNote(long id, long serviceId, [FromBody] NoteRequest? request, CancellationToken ct)
    {
        if (request is null)
            return BadRequest(new { error = "Missing payload." });

        var result = await _partsService.CreateNote(id, serviceId, request, ct);
        return ToActionResult(result);
    }

    [HttpPut("~/api/jobs/{id:long}/parts-notes/{noteId:long}")]
    public async Task<IActionResult> UpdateNote(long id, long noteId, [FromBody] NoteRequest? request, CancellationToken ct)
    {
        if (request is null)
            return BadRequest(new { error = "Missing payload." });

        var result = await _partsService.UpdateNote(id, noteId, request, ct);
        return ToActionResult(result);
    }

    [HttpDelete("~/api/jobs/{id:long}/parts-notes/{noteId:long}")]
    public async Task<IActionResult> DeleteNote(long id, long noteId, CancellationToken ct)
    {
        var result = await _partsService.DeleteNote(id, noteId, ct);
        return ToActionResult(result);
    }

    private IActionResult ToActionResult(WofServiceResult result)
    {
        if (result.StatusCode == 200)
            return Ok(result.Payload);

        return StatusCode(result.StatusCode, new { error = result.Error });
    }
}
