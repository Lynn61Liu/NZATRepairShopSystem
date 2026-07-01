using Microsoft.AspNetCore.Mvc;
using Workshop.Api.Features.EStationMonitoring.Services;

namespace Workshop.Api.Features.EStationMonitoring.Controllers;

[ApiController]
[Route("api/estation/stations")]
public sealed class EStationStationsController : ControllerBase
{
    private readonly StationStatusService _stationStatusService;

    public EStationStationsController(StationStatusService stationStatusService)
    {
        _stationStatusService = stationStatusService;
    }

    [HttpGet]
    public async Task<IActionResult> GetStations(CancellationToken ct)
        => Ok(await _stationStatusService.GetStationsAsync(ct));

    [HttpGet("{stationId}")]
    public async Task<IActionResult> GetStation(string stationId, CancellationToken ct)
    {
        var row = await _stationStatusService.GetStationAsync(stationId, ct);
        return row is null ? NotFound(new { error = "Station not found." }) : Ok(row);
    }
}
