using Microsoft.AspNetCore.Mvc;
using Workshop.Api.Features.JobLightBindings.DTOs;
using Workshop.Api.Features.JobLightBindings.Services;

namespace Workshop.Api.Features.JobLightBindings.Controllers;

[ApiController]
[Route("api/estation/light-bindings")]
public sealed class EStationLightBindingsController : ControllerBase
{
    private readonly JobLightBindingService _service;

    public EStationLightBindingsController(JobLightBindingService service)
    {
        _service = service;
    }

    [HttpGet]
    public async Task<ActionResult<List<DeviceLightBindingResponse>>> GetBindings(CancellationToken ct)
        => await _service.GetDeviceBindingsAsync(ct);

    [HttpPost("{bindingId:long}/light-on")]
    public async Task<ActionResult<JobLightBindingResponse>> LightOn(long bindingId, CancellationToken ct)
    {
        var result = await _service.LightOnAsync(bindingId, ct);
        if (!result.Success)
            return BadRequest(new { error = result.ErrorMessage, binding = result.Binding });

        return Ok(result.Binding);
    }

    [HttpPost("{bindingId:long}/light-off")]
    public async Task<ActionResult<JobLightBindingResponse>> LightOff(long bindingId, CancellationToken ct)
    {
        var result = await _service.LightOffAsync(bindingId, ct);
        if (!result.Success)
            return BadRequest(new { error = result.ErrorMessage, binding = result.Binding });

        return Ok(result.Binding);
    }
}
