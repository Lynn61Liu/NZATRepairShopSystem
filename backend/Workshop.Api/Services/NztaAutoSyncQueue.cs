using System.Threading.Channels;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;

namespace Workshop.Api.Services;

public sealed record NztaAutoSyncRequest(long JobId, long VehicleId, string Plate);

public sealed class NztaAutoSyncQueue
{
    private readonly Channel<NztaAutoSyncRequest> _channel = Channel.CreateUnbounded<NztaAutoSyncRequest>();

    public ValueTask EnqueueAsync(NztaAutoSyncRequest request, CancellationToken ct = default)
        => _channel.Writer.WriteAsync(request, ct);

    public IAsyncEnumerable<NztaAutoSyncRequest> ReadAllAsync(CancellationToken ct)
        => _channel.Reader.ReadAllAsync(ct);
}

public sealed class NztaAutoSyncBackgroundService : BackgroundService
{
    private readonly NztaAutoSyncQueue _queue;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<NztaAutoSyncBackgroundService> _logger;

    public NztaAutoSyncBackgroundService(
        NztaAutoSyncQueue queue,
        IServiceScopeFactory scopeFactory,
        ILogger<NztaAutoSyncBackgroundService> logger)
    {
        _queue = queue;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var request in _queue.ReadAllAsync(stoppingToken))
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var lookup = scope.ServiceProvider.GetRequiredService<NztaExpiryLookupService>();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var result = await lookup.LookupVehicleDetailsInteractiveAsync(request.Plate, stoppingToken);
                if (result.Success)
                {
                    var vehicle = await db.Vehicles.FirstOrDefaultAsync(x => x.Id == request.VehicleId, stoppingToken);
                    if (vehicle is not null)
                    {
                        vehicle.WofExpiry = result.WofExpiry;
                        vehicle.LicenceExpiry = result.LicenceExpiry;
                        vehicle.RucLicenceNumber = result.RucLicenceNumber;
                        vehicle.RucEndDistance = result.RucEndDistance;
                        vehicle.UpdatedAt = DateTime.UtcNow;
                        await db.SaveChangesAsync(stoppingToken);
                    }
                }
                else
                {
                    _logger.LogWarning("Automatic NZTA lookup failed for job {JobId}, vehicle {VehicleId}: {Error}", request.JobId, request.VehicleId, result.Error);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Automatic NZTA lookup failed for job {JobId}, vehicle {VehicleId}", request.JobId, request.VehicleId);
            }

            await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
        }
    }
}
