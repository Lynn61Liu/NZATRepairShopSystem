using Microsoft.AspNetCore.Mvc;
using Workshop.Api.Services;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/car-on-yard")]
public sealed class CarOnYardController : ControllerBase
{
    private readonly CarOnYardReportService _reportService;

    public CarOnYardController(CarOnYardReportService reportService)
    {
        _reportService = reportService;
    }

    [HttpGet("report-settings")]
    public async Task<IActionResult> GetReportSettings(CancellationToken ct)
        => Ok(await _reportService.GetSettingsAsync(ct));

    [HttpPut("report-settings")]
    public async Task<IActionResult> UpdateReportSettings([FromBody] CarOnYardReportSettingsUpdateRequest request, CancellationToken ct)
    {
        try
        {
            return Ok(await _reportService.UpdateSettingsAsync(request, ct));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }
}
