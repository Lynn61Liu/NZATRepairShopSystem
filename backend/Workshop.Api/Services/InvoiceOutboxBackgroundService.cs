using Npgsql;

namespace Workshop.Api.Services;

public sealed class InvoiceOutboxBackgroundService : BackgroundService
{
    private static readonly TimeSpan IdlePollDelay = TimeSpan.FromSeconds(1);
    private static readonly TimeSpan ErrorPollDelay = TimeSpan.FromSeconds(3);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<InvoiceOutboxBackgroundService> _logger;

    public InvoiceOutboxBackgroundService(
        IServiceScopeFactory scopeFactory,
        ILogger<InvoiceOutboxBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var processor = scope.ServiceProvider.GetRequiredService<InvoiceOutboxService>();
                var messages = await processor.ClaimPendingBatchAsync(5, stoppingToken);

                if (messages.Count == 0)
                {
                    await Task.Delay(IdlePollDelay, stoppingToken);
                    continue;
                }

                foreach (var message in messages)
                {
                    await processor.ProcessAsync(message, stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (PostgresException ex)
            {
                _logger.LogWarning(ex, "Invoice outbox processor hit a PostgreSQL error.");
                await Task.Delay(ErrorPollDelay, stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Invoice outbox processor loop failed.");
                await Task.Delay(ErrorPollDelay, stoppingToken);
            }
        }
    }
}
