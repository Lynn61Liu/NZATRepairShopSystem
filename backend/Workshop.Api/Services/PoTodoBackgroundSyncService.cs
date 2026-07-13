using Microsoft.Extensions.Hosting;

namespace Workshop.Api.Services;

public sealed class PoTodoBackgroundSyncService : BackgroundService
{
    private static readonly TimeSpan MinimumDelay = TimeSpan.FromSeconds(30);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<PoTodoBackgroundSyncService> _logger;
    private readonly TimeZoneInfo _nzTimeZone;

    public PoTodoBackgroundSyncService(
        IServiceScopeFactory scopeFactory,
        ILogger<PoTodoBackgroundSyncService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _nzTimeZone = ResolveNzTimeZone();
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var delay = GetDelayUntilNextRun(DateTimeOffset.UtcNow);
            if (delay > TimeSpan.Zero)
            {
                try
                {
                    await Task.Delay(delay, stoppingToken);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
            }

            await RunCycleAsync(stoppingToken);
        }
    }

    private async Task RunCycleAsync(CancellationToken ct)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var poTodoService = scope.ServiceProvider.GetRequiredService<PoTodoService>();
            var result = await poTodoService.SyncDashboardGmailAsync(ct);

            _logger.LogInformation(
                "PO TODO Gmail background sync completed. CheckedJobs={CheckedJobs}, SyncedMessages={SyncedMessages}, Warnings={Warnings}.",
                result.CheckedJobs,
                result.SyncedMessages,
                result.Warnings.Count);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "PO TODO Gmail background sync failed.");
        }
    }

    private TimeSpan GetDelayUntilNextRun(DateTimeOffset utcNow)
    {
        var now = TimeZoneInfo.ConvertTime(utcNow, _nzTimeZone);
        // var candidate = 
        var candidate = new DateTime(now.Year, now.Month, now.Day, now.Hour, 0, 0, DateTimeKind.Unspecified);
        if (now.Minute > 0 || now.Second > 0 || now.Millisecond > 0)
            candidate = candidate.AddHours(1);

        while (candidate.Hour < 9 || candidate.Hour > 18)
            candidate = candidate.AddHours(1);

        var candidateUtc = TimeZoneInfo.ConvertTimeToUtc(candidate, _nzTimeZone);
        var delay = candidateUtc - utcNow.UtcDateTime;
        return delay < MinimumDelay ? MinimumDelay : delay;
    }

    private static TimeZoneInfo ResolveNzTimeZone()
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById("Pacific/Auckland");
        }
        catch (TimeZoneNotFoundException)
        {
            return TimeZoneInfo.FindSystemTimeZoneById("New Zealand Standard Time");
        }
    }
}
