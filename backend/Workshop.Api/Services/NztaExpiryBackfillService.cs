using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;

namespace Workshop.Api.Services;

public sealed class NztaExpiryBackfillService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<NztaExpiryBackfillService> _logger;

    public NztaExpiryBackfillService(
        IServiceScopeFactory scopeFactory,
        ILogger<NztaExpiryBackfillService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public void Dispatch(long vehicleId, string plate)
    {
        if (vehicleId <= 0 || string.IsNullOrWhiteSpace(plate))
            return;

        _ = Task.Run(async () =>
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var nztaExpiryLookupService = scope.ServiceProvider.GetRequiredService<NztaExpiryLookupService>();

                var result = await nztaExpiryLookupService.LookupInspectionExpiryAsync(plate, CancellationToken.None);
                if (result.ExpiryDate is null ||
                    string.Equals(result.InspectionType, "COF", StringComparison.OrdinalIgnoreCase))
                {
                    _logger.LogInformation(
                        "NZTA async expiry backfill skipped update for vehicle {VehicleId} plate {Plate}: {Error}",
                        vehicleId,
                        plate,
                        result.Error ?? "no WOF expiry returned");
                    return;
                }

                var vehicle = await db.Vehicles.FirstOrDefaultAsync(x => x.Id == vehicleId);
                if (vehicle is null)
                    return;

                if (vehicle.WofExpiry == result.ExpiryDate)
                    return;

                vehicle.WofExpiry = result.ExpiryDate;
                vehicle.UpdatedAt = DateTime.UtcNow;
                await db.SaveChangesAsync();

                _logger.LogInformation(
                    "NZTA async expiry backfill updated vehicle {VehicleId} plate {Plate} to {ExpiryDate}",
                    vehicleId,
                    plate,
                    result.ExpiryDate);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "NZTA async expiry backfill failed for vehicle {VehicleId} plate {Plate}", vehicleId, plate);
            }
        });
    }
}
