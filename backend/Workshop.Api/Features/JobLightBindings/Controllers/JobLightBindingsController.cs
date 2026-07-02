using Microsoft.AspNetCore.Mvc;
using Workshop.Api.Features.JobLightBindings.DTOs;
using Workshop.Api.Features.JobLightBindings.Services;

namespace Workshop.Api.Features.JobLightBindings.Controllers;

[ApiController]
[Route("api/jobs/{jobId:long}/light-bindings")]
public sealed class JobLightBindingsController : ControllerBase
{
    private readonly JobLightBindingService _service;

    public JobLightBindingsController(JobLightBindingService service)
    {
        _service = service;
    }

    [HttpGet]
    public async Task<ActionResult<List<JobLightBindingResponse>>> GetJobBindings(long jobId, CancellationToken ct)
        => await _service.GetJobBindingsAsync(jobId, ct);

    [HttpPost]
    public async Task<ActionResult<JobLightBindingResponse>> CreateBinding(
        long jobId,
        [FromBody] CreateJobLightBindingRequest request,
        CancellationToken ct)
    {
        var result = await _service.CreateBindingAsync(jobId, request.TagId, request.OverrideExisting, ct);
        if (!result.Success)
        {
            if (result.Binding is not null)
                return StatusCode(StatusCodes.Status502BadGateway, new { error = result.ErrorMessage, binding = result.Binding });

            return BadRequest(new { error = result.ErrorMessage });
        }

        return Ok(result.Binding);
    }
}
