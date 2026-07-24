using CarjamImporter;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;

namespace Workshop.Api.Services;

public sealed class CarjamAsyncImportService
{
    private const string JobsListVersionCacheKey = "jobs:list:version:v1";
    private const string PaintBoardCacheKey = "jobs:paint-board:v1";
    private const string WofScheduleCacheKey = "jobs:wof-schedule:v1";
    private static readonly TimeSpan JobsListVersionCacheDuration = TimeSpan.FromDays(30);
    private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, byte> ActiveImports = new();

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
        if (!ActiveImports.TryAdd(normalized, 0))
            return;

        _ = Task.Run(async () =>
        {
            try
            {
                CarjamImportResult? result = null;
                for (var attempt = 1; attempt <= 2; attempt++)
                {
                    using var scope = _scopeFactory.CreateScope();
                    var importService = scope.ServiceProvider.GetRequiredService<CarjamImportService>();
                    result = await importService.ImportByPlateAsync(normalized, CancellationToken.None);
                    if (result.Success)
                    {
                        var hasCompleteReferenceData = result.Vehicle is not null &&
                                                       result.Vehicle.Year.HasValue &&
                                                       result.Vehicle.Year.Value > 0 &&
                                                       !string.IsNullOrWhiteSpace(result.Vehicle.Make) &&
                                                       !string.IsNullOrWhiteSpace(result.Vehicle.Model);
                        if (!hasCompleteReferenceData)
                        {
                            _logger.LogWarning(
                                "Background CarJam import attempt {Attempt} returned incomplete year/make/model for plate {Plate}",
                                attempt,
                                normalized);
                            if (attempt < 2)
                            {
                                await Task.Delay(TimeSpan.FromSeconds(3));
                                continue;
                            }
                        }

                        for (var postProcessAttempt = 1; postProcessAttempt <= 2; postProcessAttempt++)
                        {
                            try
                            {
                                using var postProcessScope = _scopeFactory.CreateScope();
                                await InvalidateVehicleCachesAsync(postProcessScope.ServiceProvider, normalized);
                                break;
                            }
                            catch (Exception ex) when (postProcessAttempt < 2)
                            {
                                _logger.LogWarning(
                                    ex,
                                    "Background CarJam post-processing attempt {Attempt} failed for plate {Plate}",
                                    postProcessAttempt,
                                    normalized);
                                await Task.Delay(TimeSpan.FromSeconds(3));
                            }
                        }
                        break;
                    }

                    _logger.LogWarning(
                        "Background CarJam import attempt {Attempt} failed for plate {Plate}: {Error}",
                        attempt,
                        normalized,
                        result.Error ?? "unknown error");
                    if (attempt < 2)
                        await Task.Delay(TimeSpan.FromSeconds(3));
                }

                if (result?.Success == true)
                {
                    _logger.LogInformation(
                        "Background CarJam import completed for plate {Plate} (affectedRows: {AffectedRows})",
                        normalized,
                        result.AffectedRows);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Background CarJam import crashed for plate {Plate}", normalized);
            }
            finally
            {
                ActiveImports.TryRemove(normalized, out _);
            }
        });
    }

    private static async Task InvalidateVehicleCachesAsync(IServiceProvider services, string plate)
    {
        var db = services.GetRequiredService<AppDbContext>();
        var cache = services.GetRequiredService<IAppCache>();
        var affectedJobIds = await (
                from job in db.Jobs.AsNoTracking()
                join vehicle in db.Vehicles.AsNoTracking() on job.VehicleId equals vehicle.Id
                where vehicle.Plate == plate
                select job.Id)
            .ToListAsync();

        var invoiceOutboxService = services.GetRequiredService<InvoiceOutboxService>();
        foreach (var jobId in affectedJobIds)
            await invoiceOutboxService.EnqueueSyncVehicleReferenceAsync(jobId, CancellationToken.None);

        var invalidations = affectedJobIds
            .Select(jobId => cache.RemoveAsync($"job:detail:{jobId}:v1", CancellationToken.None))
            .Append(cache.RemoveAsync(PaintBoardCacheKey, CancellationToken.None))
            .Append(cache.RemoveAsync(WofScheduleCacheKey, CancellationToken.None));
        await Task.WhenAll(invalidations);
        await cache.SetStringAsync(
            JobsListVersionCacheKey,
            Guid.NewGuid().ToString("N"),
            JobsListVersionCacheDuration,
            CancellationToken.None);
    }

    private static string NormalizePlate(string plate)
        => new(plate.Trim().ToUpperInvariant().Where(char.IsLetterOrDigit).ToArray());
}
