using Microsoft.AspNetCore.Mvc;
using Workshop.Api.Services;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/jobs/{id:long}")]
public class WofRecordsController : ControllerBase
{
    private readonly WofRecordsService _wofService;

    public WofRecordsController(WofRecordsService wofService)
    {
        _wofService = wofService;
    }

    [HttpGet("wof-server")]
    public async Task<IActionResult> GetWofRecords(long id, CancellationToken ct)
    {
        var result = await _wofService.GetWofRecords(id, ct);
        return ToActionResult(result);
    }

    [HttpPost("wof-records/import")]
    public async Task<IActionResult> ImportWofRecords(long id, CancellationToken ct)
    {
        var result = await _wofService.ImportWofRecords(id, ct);
        return ToActionResult(result);
    }

    [HttpPut("wof-records/{recordId:long}")]
    public async Task<IActionResult> UpdateWofRecord(long id, long recordId, [FromBody] WofRecordUpdateRequest? request, CancellationToken ct)
    {
        if (request is null)
            return BadRequest(new { error = "Missing payload." });

        var result = await _wofService.UpdateWofRecord(id, recordId, request, ct);
        return ToActionResult(result);
    }

    [HttpPost("wof-server")]
    public async Task<IActionResult> CreateWofRecord(long id, CancellationToken ct)
    {
        var result = await _wofService.ImportWofRecords(id, ct);
        return ToActionResult(result);
    }

    [HttpDelete("wof-server")]
    public async Task<IActionResult> DeleteWofServer(long id, CancellationToken ct)
    {
        var result = await _wofService.DeleteWofServer(id, ct);
        return ToActionResult(result);
    }

    public record CreateWofResultRequest(string Result, string? RecheckExpiryDate, long? FailReasonId, string? Note);

    [HttpPost("wof-results")]
    public async Task<IActionResult> CreateWofResult(long id, [FromBody] CreateWofResultRequest req, CancellationToken ct)
    {
        var result = await _wofService.CreateWofResult(id, req?.Result, req?.RecheckExpiryDate, req?.FailReasonId, req?.Note, ct);
        return ToActionResult(result);
    }

    private IActionResult ToActionResult(WofServiceResult result)
    {
        if (result.StatusCode == 200)
            return Ok(result.Payload);

        return StatusCode(result.StatusCode, new { error = result.Error });
    }
}
