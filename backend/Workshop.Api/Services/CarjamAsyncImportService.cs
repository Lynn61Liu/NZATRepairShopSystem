using CarjamImporter;

namespace Workshop.Api.Services;

public sealed class CarjamAsyncImportService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<CarjamAsyncImportService> _logger;

    public CarjamAsyncImportService(
        IServiceScopeFactory scopeFactory,
        ILogger<CarjamAsyncImportService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public void Dispatch(string plate)
    {
        var normalized = NormalizePlate(plate);
        if (string.IsNullOrWhiteSpace(normalized))
            return;

        _ = Task.Run(async () =>
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var importService = scope.ServiceProvider.GetRequiredService<CarjamImportService>();
                var result = await importService.ImportByPlateAsync(normalized, CancellationToken.None);

                if (!result.Success)
                {
                    _logger.LogWarning(
                        "Customer self-service async CarJam import failed for plate {Plate}: {Error}",
                        normalized,
                        result.Error ?? "unknown error");
                    return;
                }

                _logger.LogInformation(
                    "Customer self-service async CarJam import completed for plate {Plate} (affectedRows: {AffectedRows})",
                    normalized,
                    result.AffectedRows);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Customer self-service async CarJam import crashed for plate {Plate}", normalized);
            }
        });
    }

    private static string NormalizePlate(string plate)
        => new(plate.Trim().ToUpperInvariant().Where(char.IsLetterOrDigit).ToArray());
}
