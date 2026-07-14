using Microsoft.AspNetCore.Mvc;
using Workshop.Api.Services;

namespace Workshop.Api.Controllers;

[ApiController]
public sealed class MechWorkflowController : ControllerBase
{
    private readonly MechWorkflowService _service;

    public MechWorkflowController(MechWorkflowService service)
    {
        _service = service;
    }

    public record UpdateMechWorkflowRequest(string? Status, bool Direct = false);
    public record UpdateMechBoardSettingsRequest(string? SortOrder);

    [HttpGet("api/mech-board")]
    public async Task<IActionResult> GetBoard(CancellationToken ct) =>
        ToActionResult(await _service.GetBoardAsync(ct));

    [HttpGet("api/mech-board/settings")]
    public async Task<IActionResult> GetBoardSettings(CancellationToken ct) =>
        ToActionResult(await _service.GetBoardSettingsAsync(ct));

    [HttpPut("api/mech-board/settings")]
    public async Task<IActionResult> UpdateBoardSettings([FromBody] UpdateMechBoardSettingsRequest? request, CancellationToken ct) =>
        ToActionResult(await _service.UpdateBoardSettingsAsync(request?.SortOrder, ct));

    [HttpGet("api/jobs/{id:long}/mech-workflow")]
    public async Task<IActionResult> GetWorkflow(long id, CancellationToken ct) =>
        ToActionResult(await _service.GetWorkflowAsync(id, ct));

    [HttpPut("api/jobs/{id:long}/mech-workflow")]
    public async Task<IActionResult> UpdateWorkflow(long id, [FromBody] UpdateMechWorkflowRequest? request, CancellationToken ct) =>
        ToActionResult(await _service.UpdateWorkflowAsync(id, request?.Status, ct, request?.Direct == true));

    private IActionResult ToActionResult(WofServiceResult result) => result.StatusCode == 200
        ? Ok(result.Payload)
        : StatusCode(result.StatusCode, new { error = result.Error });
}
