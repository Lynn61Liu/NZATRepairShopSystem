using Microsoft.AspNetCore.Mvc;
using Workshop.Api.Services;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/wof-records")]
public class WofSyncController : ControllerBase
{
    private readonly WofRecordsService _wofService;

    public WofSyncController(WofRecordsService wofService)
    {
        _wofService = wofService;
    }

    [HttpPost("sync")]
    public async Task<IActionResult> SyncAll(CancellationToken ct)
    {
        var result = await _wofService.SyncAllRecordsFromGoogleSheet(ct);
        if (result.StatusCode == 200)
            return Ok(result.Payload);

        return StatusCode(result.StatusCode, new { error = result.Error });
    }
}
