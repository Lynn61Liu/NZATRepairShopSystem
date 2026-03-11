using Microsoft.AspNetCore.Mvc;
using Workshop.Api.Services;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/jobs/{id:long}/xero-draft-invoice")]
public class JobXeroInvoicesController : ControllerBase
{
    private readonly JobXeroDraftInvoiceService _jobXeroDraftInvoiceService;

    public JobXeroInvoicesController(JobXeroDraftInvoiceService jobXeroDraftInvoiceService)
    {
        _jobXeroDraftInvoiceService = jobXeroDraftInvoiceService;
    }

    [HttpPost]
    public async Task<IActionResult> CreateDraftInvoice(long id, CancellationToken ct)
    {
        var result = await _jobXeroDraftInvoiceService.CreateForJobAsync(id, ct);
        if (!result.Ok)
        {
            return StatusCode(result.StatusCode, new
            {
                error = result.Error,
                invoice = result.Details,
            });
        }

        return Ok(result.Details);
    }
}
