using Microsoft.AspNetCore.Mvc;
using Workshop.Api.Features.EStationMonitoring.Services;

namespace Workshop.Api.Features.EStationMonitoring.Controllers;

[ApiController]
[Route("api/estation/mqtt-logs")]
public sealed class EStationMqttLogsController : ControllerBase
{
    private readonly MqttMessageLogService _logService;

    public EStationMqttLogsController(MqttMessageLogService logService)
    {
        _logService = logService;
    }

    [HttpGet]
    public async Task<IActionResult> GetLogs(
        [FromQuery] string? stationId,
        [FromQuery] string? messageType,
        [FromQuery] string? processingStatus,
        [FromQuery] int limit,
        CancellationToken ct)
    {
        var safeLimit = limit <= 0 ? 100 : limit;
        return Ok(await _logService.GetLogsAsync(stationId, messageType, processingStatus, safeLimit, ct));
    }
}
