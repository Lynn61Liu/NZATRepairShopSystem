using Microsoft.AspNetCore.Mvc;
using Workshop.Api.DTOs;
using Workshop.Api.Services;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/newJob")]
public class NewJobController : ControllerBase
{
    private readonly NewJobCreationService _newJobCreationService;

    public NewJobController(NewJobCreationService newJobCreationService)
    {
        _newJobCreationService = newJobCreationService;
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] NewJobRequest req, CancellationToken ct)
    {
        try
        {
            var result = await _newJobCreationService.CreateAsync(req, ct);
            ApplyPerformanceHeaders(result);
            return Ok(ToResponse(result));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    internal static object ToResponse(NewJobCreationResult result) => new
    {
        jobId = result.JobId,
        customerId = result.CustomerId,
        vehicleId = result.VehicleId,
        wofCreated = result.WofCreated,
        invoiceQueued = result.InvoiceQueued,
        invoiceMode = result.InvoiceMode,
        invoiceCreated = false,
        invoiceLinked = false,
        invoiceAlreadyExists = false,
        invoiceError = (string?)null,
        performance = new
        {
            coreRequestMs = result.CoreRequestMs,
            totalResponseMs = result.TotalResponseMs,
            invoiceImmediateKickMs = result.InvoiceImmediateKickMs,
            poImmediateKickMs = result.PoImmediateKickMs,
            invoiceProcessedInline = result.InvoiceProcessedInline,
            poProcessedInline = result.PoProcessedInline,
        },
    };

    private void ApplyPerformanceHeaders(NewJobCreationResult result)
    {
        Response.Headers["X-NewJob-Core-Time"] = $"{result.CoreRequestMs:F0}ms";
        Response.Headers["X-NewJob-Total-Time"] = $"{result.TotalResponseMs:F0}ms";
        Response.Headers["X-NewJob-Invoice-Kick-Time"] = $"{result.InvoiceImmediateKickMs:F0}ms";
        Response.Headers["X-NewJob-Invoice-Processed-Inline"] = result.InvoiceProcessedInline;
        if (result.PoImmediateKickMs.HasValue)
        {
            Response.Headers["X-NewJob-Po-Kick-Time"] = $"{result.PoImmediateKickMs.Value:F0}ms";
            Response.Headers["X-NewJob-Po-Processed-Inline"] = result.PoProcessedInline ?? "n/a";
        }
    }
}
