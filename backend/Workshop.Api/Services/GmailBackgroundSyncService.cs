using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Workshop.Api.Services;

public sealed class GmailBackgroundSyncService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<GmailBackgroundSyncService> _logger;

    public GmailBackgroundSyncService(
        IServiceScopeFactory scopeFactory,
        ILogger<GmailBackgroundSyncService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var delay = await RunCycleAsync(stoppingToken);
            try
            {
                await Task.Delay(delay, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task<TimeSpan> RunCycleAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var syncService = scope.ServiceProvider.GetRequiredService<GmailThreadSyncService>();
        var delay = TimeSpan.FromSeconds(syncService.BackgroundPollIntervalSeconds);

        if (!syncService.BackgroundSyncEnabled)
            return delay;

        try
        {
            var poStateService = scope.ServiceProvider.GetRequiredService<JobPoStateService>();
            await poStateService.EnsureStatesForNeedsPoJobsAsync(ct);

            var targets = await syncService.GetActiveSyncTargetsAsync(ct);
            if (targets.Count == 0)
                return delay;

            foreach (var target in targets)
            {
                var result = await syncService.SyncThreadAsync(
                    target.CounterpartyEmail,
                    target.CorrelationId,
                    syncService.BackgroundThreadFetchLimit,
                    ct);

                if (!result.Ok && !string.IsNullOrWhiteSpace(result.Warning))
                {
                    _logger.LogWarning(
                        "Background Gmail sync warning for {CorrelationId}/{CounterpartyEmail}: {Warning}",
                        target.CorrelationId,
                        target.CounterpartyEmail,
                        result.Warning);
                }
            }
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Background Gmail sync cycle failed.");
        }

        return delay;
    }
}
