using Microsoft.AspNetCore.Mvc;
using Workshop.Api.DTOs;
using Workshop.Api.Services;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/customer-self-service/jobs")]
public sealed class CustomerSelfServiceJobsController : ControllerBase
{
    private readonly NewJobCreationService _newJobCreationService;
    private readonly ServiceCatalogService _serviceCatalogService;

    public CustomerSelfServiceJobsController(
        NewJobCreationService newJobCreationService,
        ServiceCatalogService serviceCatalogService)
    {
        _newJobCreationService = newJobCreationService;
        _serviceCatalogService = serviceCatalogService;
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CustomerSelfServiceJobRequest req, CancellationToken ct)
    {
        var errors = CustomerSelfServiceJobMapper.Validate(req);
        if (errors.Count > 0)
            return BadRequest(new { error = errors[0], errors });

        try
        {
            await _serviceCatalogService.EnsureSeededAsync(ct);
            var serviceType = req.HasWof ? "wof" : "mech";
            var rootServiceCatalogItemId = await _newJobCreationService.ResolveActiveRootServiceIdAsync(serviceType, ct);
            var newJobRequest = CustomerSelfServiceJobMapper.MapToNewJobRequest(req, rootServiceCatalogItemId);
            var result = await _newJobCreationService.CreateAsync(newJobRequest, ct);

            return Ok(new
            {
                jobId = result.JobId,
                customerId = result.CustomerId,
                vehicleId = result.VehicleId,
                wofCreated = result.WofCreated,
                invoiceQueued = result.InvoiceQueued,
            });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }
}
