using Microsoft.AspNetCore.Mvc;
using Workshop.Api.Services;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/silent-print/jobs")]
public sealed class SilentPrintJobsController : ControllerBase
{
    private readonly SilentPrintService _silentPrintService;

    public SilentPrintJobsController(SilentPrintService silentPrintService)
    {
        _silentPrintService = silentPrintService;
    }

    [HttpPost]
    public IActionResult Create([FromBody] SilentPrintJobRequest request)
    {
        if (!string.Equals(request.PrintMode, "silent", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { error = "printMode must be silent for silent print jobs." });
        if (string.IsNullOrWhiteSpace(request.RouteKey))
            return BadRequest(new { error = "Route key is required." });
        if (string.IsNullOrWhiteSpace(request.Html))
            return BadRequest(new { error = "HTML is required." });

        SilentPrintRoute route;
        try
        {
            route = SilentPrintRouteResolver.Resolve(request.RouteKey);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }

        var result = _silentPrintService.Dispatch(request);
        return Accepted(new
        {
            accepted = result.Accepted,
            jobId = result.JobId,
            routeKey = result.RouteKey,
            printerFamily = route.PrinterFamily,
            printerName = route.PrinterName,
        });
    }
}
