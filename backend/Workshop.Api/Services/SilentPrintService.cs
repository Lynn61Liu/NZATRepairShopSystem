namespace Workshop.Api.Services;

public sealed record SilentPrintJobRequest(
    string PrintMode,
    string RouteKey,
    string Html,
    string AssetBaseUrl,
    string? SourceSystem = null,
    string? SourceRef = null,
    string? DocumentName = null);

public sealed record SilentPrintJobResponse(
    bool Accepted,
    string JobId,
    string RouteKey,
    string PrinterFamily,
    string PrinterName);

public sealed class SilentPrintService
{
    private readonly ILogger<SilentPrintService> _logger;
    private readonly SilentPrintHtmlRenderer _htmlRenderer;
    private readonly SilentPrintCommandExecutor _commandExecutor;

    public SilentPrintService(
        ILogger<SilentPrintService> logger,
        SilentPrintHtmlRenderer htmlRenderer,
        SilentPrintCommandExecutor commandExecutor)
    {
        _logger = logger;
        _htmlRenderer = htmlRenderer;
        _commandExecutor = commandExecutor;
    }

    public SilentPrintJobResponse Dispatch(SilentPrintJobRequest request)
    {
        if (!string.Equals(request.PrintMode, "silent", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Silent print jobs require printMode=silent.");

        var jobId = Guid.NewGuid().ToString("N");
        _ = Task.Run(async () =>
        {
            try
            {
                await ExecuteAsync(jobId, request, CancellationToken.None);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(
                    ex,
                    "Silent print job {JobId} failed for route {RouteKey} (source: {SourceSystem}/{SourceRef})",
                    jobId,
                    request.RouteKey,
                    request.SourceSystem ?? "",
                    request.SourceRef ?? "");
            }
        });

        var route = SilentPrintRouteResolver.Resolve(request.RouteKey);
        return new SilentPrintJobResponse(true, jobId, route.RouteKey, route.PrinterFamily, route.PrinterName);
    }

    private async Task ExecuteAsync(string jobId, SilentPrintJobRequest request, CancellationToken ct)
    {
        var route = SilentPrintRouteResolver.Resolve(request.RouteKey);
        var pdfBytes = await _htmlRenderer.RenderPdfAsync(request.Html, request.AssetBaseUrl, route.TemplateKey, ct);
        await _commandExecutor.ExecuteAsync(route.PrinterName, pdfBytes, request.DocumentName, ct);

        _logger.LogInformation(
            "Silent print job {JobId} completed for route {RouteKey} -> {PrinterName} ({PrinterFamily})",
            jobId,
            route.RouteKey,
            route.PrinterName,
            route.PrinterFamily);
    }
}
