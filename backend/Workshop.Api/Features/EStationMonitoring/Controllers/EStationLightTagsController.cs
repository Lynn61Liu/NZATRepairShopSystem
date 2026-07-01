using Microsoft.AspNetCore.Mvc;
using Workshop.Api.Features.EStationMonitoring.Services;

namespace Workshop.Api.Features.EStationMonitoring.Controllers;

[ApiController]
[Route("api/estation/light-tags")]
public sealed class EStationLightTagsController : ControllerBase
{
    private readonly LightTagStatusService _lightTagStatusService;

    public EStationLightTagsController(LightTagStatusService lightTagStatusService)
    {
        _lightTagStatusService = lightTagStatusService;
    }

    [HttpGet]
    public async Task<IActionResult> GetLightTags(
        [FromQuery] string? stationId,
        [FromQuery] int? group,
        [FromQuery] string? battery,
        CancellationToken ct)
        => Ok(await _lightTagStatusService.GetLightTagsAsync(stationId, group, battery, ct));

    [HttpGet("{tagId}")]
    public async Task<IActionResult> GetLightTag(string tagId, CancellationToken ct)
    {
        var row = await _lightTagStatusService.GetLightTagAsync(tagId, ct);
        return row is null ? NotFound(new { error = "Light tag not found." }) : Ok(row);
    }
}
