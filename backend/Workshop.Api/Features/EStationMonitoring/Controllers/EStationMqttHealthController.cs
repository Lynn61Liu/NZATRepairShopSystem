using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Workshop.Api.Features.EStationMonitoring.DTOs;
using Workshop.Api.Features.EStationMonitoring.Options;

namespace Workshop.Api.Features.EStationMonitoring.Controllers;

[ApiController]
[Route("api/estation/mqtt-health")]
public sealed class EStationMqttHealthController : ControllerBase
{
    private readonly EStationMqttOptions _options;

    public EStationMqttHealthController(IOptions<EStationMqttOptions> options)
    {
        _options = options.Value;
    }

    [HttpGet]
    public IActionResult GetHealth()
        => Ok(new EStationMqttHealthResponse(
            _options.Enabled,
            _options.BrokerHost,
            _options.BrokerPort,
            _options.UseTls,
            !string.IsNullOrWhiteSpace(_options.Username),
            _options.ClientIdPrefix));
}
