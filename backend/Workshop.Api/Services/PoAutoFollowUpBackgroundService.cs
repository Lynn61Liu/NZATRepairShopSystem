using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Workshop.Api.Services;

public sealed class PoAutoFollowUpBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<PoAutoFollowUpBackgroundService> _logger;

    public PoAutoFollowUpBackgroundService(
        IServiceScopeFactory scopeFactory,
        ILogger<PoAutoFollowUpBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            using var scope = _scopeFactory.CreateScope();
            var service = scope.ServiceProvider.GetRequiredService<PoAutoFollowUpService>();
            var delay = TimeSpan.FromSeconds(service.CheckIntervalSeconds);

            if (!service.Enabled)
            {
                await Task.Delay(delay, stoppingToken);
                continue;
            }

            try
            {
                await service.RunCycleAsync(stoppingToken);
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Automatic PO follow-up cycle failed.");
            }

            await Task.Delay(delay, stoppingToken);
        }
    }
}
