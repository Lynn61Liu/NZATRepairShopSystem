using Microsoft.Extensions.Options;
using Workshop.Api.Options;

namespace Workshop.Api.Services;

public sealed class XeroInvoiceStatusBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly XeroPollingOptions _options;
    private readonly ILogger<XeroInvoiceStatusBackgroundService> _logger;

    public XeroInvoiceStatusBackgroundService(
        IServiceScopeFactory scopeFactory,
        IOptions<XeroPollingOptions> options,
        ILogger<XeroInvoiceStatusBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _options = options.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.Enabled)
        {
            _logger.LogInformation("Automatic Xero invoice status sync is disabled.");
            return;
        }

        var timeZone = ResolveTimeZone(_options.TimeZoneId);
        var syncTimes = (_options.SyncTimes ?? [])
            .Select(value => TimeOnly.TryParse(value, out var parsed) ? parsed : (TimeOnly?)null)
            .Where(value => value.HasValue)
            .Select(value => value!.Value)
            .Distinct()
            .OrderBy(value => value)
            .ToArray();

        if (syncTimes.Length == 0)
        {
            _logger.LogWarning("Automatic Xero invoice status sync has no valid schedule times.");
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            var nowUtc = DateTime.UtcNow;
            var nextUtc = GetNextRunUtc(nowUtc, timeZone, syncTimes);
            try
            {
                await Task.Delay(nextUtc - nowUtc, stoppingToken);
                using var scope = _scopeFactory.CreateScope();
                var service = scope.ServiceProvider.GetRequiredService<XeroInvoiceStatusSyncService>();
                var result = await service.SyncJobsAsync(null, stoppingToken);
                _logger.LogInformation(
                    "Automatic Xero invoice status sync completed: {Succeeded} succeeded, {Failed} failed.",
                    result.Succeeded,
                    result.Failed);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Automatic Xero invoice status sync failed.");
                await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
            }
        }
    }

    internal static DateTime GetNextRunUtc(DateTime nowUtc, TimeZoneInfo timeZone, IReadOnlyList<TimeOnly> syncTimes)
    {
        var localNow = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(nowUtc, DateTimeKind.Utc), timeZone);
        foreach (var syncTime in syncTimes)
        {
            var candidate = localNow.Date.Add(syncTime.ToTimeSpan());
            if (candidate > localNow)
                return TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(candidate, DateTimeKind.Unspecified), timeZone);
        }

        var tomorrow = localNow.Date.AddDays(1).Add(syncTimes[0].ToTimeSpan());
        return TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(tomorrow, DateTimeKind.Unspecified), timeZone);
    }

    private static TimeZoneInfo ResolveTimeZone(string? id)
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(string.IsNullOrWhiteSpace(id) ? "Pacific/Auckland" : id);
        }
        catch
        {
            return TimeZoneInfo.FindSystemTimeZoneById("Pacific/Auckland");
        }
    }
}
