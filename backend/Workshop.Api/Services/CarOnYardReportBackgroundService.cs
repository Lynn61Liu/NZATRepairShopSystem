using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Workshop.Api.Services;

public sealed class CarOnYardReportBackgroundService : BackgroundService
{
    private static readonly TimeSpan SettingsRefreshInterval = TimeSpan.FromMinutes(30);
    private const string DefaultTimeZoneId = "Pacific/Auckland";

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<CarOnYardReportBackgroundService> _logger;

    public CarOnYardReportBackgroundService(
        IServiceScopeFactory scopeFactory,
        ILogger<CarOnYardReportBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var delay = SettingsRefreshInterval;
            try
            {
                delay = await RunCycleAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Car On Yard report cycle failed.");
            }

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
        var reportService = scope.ServiceProvider.GetRequiredService<CarOnYardReportService>();
        var settings = await reportService.GetSettingsAsync(ct);
        if (!settings.Enabled)
            return SettingsRefreshInterval;

        var sendTimes = settings.SendTimes.Length > 0
            ? settings.SendTimes
            : CarOnYardReportService.NormalizeSendTimes("09:30,17:30");
        if (sendTimes.Length == 0)
            return SettingsRefreshInterval;

        var tz = ResolveTimeZone(settings.TimeZoneId);
        var nowNz = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);
        var dueTime = FindDueTime(sendTimes, nowNz.TimeOfDay);
        if (dueTime is not null)
        {
            var slotKey = $"{nowNz:yyyy-MM-dd}:{dueTime}";
            var result = await reportService.SendReportAsync(slotKey, ct);
            if (result.Sent)
            {
                _logger.LogInformation("Car On Yard report sent for slot {SlotKey}.", slotKey);
            }
            else if (!string.IsNullOrWhiteSpace(result.Message) && !result.Message.Contains("already sent", StringComparison.OrdinalIgnoreCase))
            {
                _logger.LogWarning("Car On Yard report not sent for slot {SlotKey}: {Message}", slotKey, result.Message);
            }
        }

        return CalculateNextDelay(sendTimes, nowNz);
    }

    private static string? FindDueTime(IEnumerable<string> sendTimes, TimeSpan currentTime)
        => sendTimes
            .Select(sendTime => TimeSpan.TryParse(sendTime, out var parsed) ? parsed : (TimeSpan?)null)
            .Where(sendTime => sendTime.HasValue && sendTime.Value <= currentTime)
            .OrderByDescending(sendTime => sendTime)
            .Select(sendTime => $"{(int)sendTime!.Value.TotalHours:00}:{sendTime.Value.Minutes:00}")
            .FirstOrDefault();

    private static TimeSpan CalculateNextDelay(IEnumerable<string> sendTimes, DateTime nowNz)
    {
        var nextScheduledAt = sendTimes
            .Select(sendTime => TimeSpan.TryParse(sendTime, out var parsed) ? parsed : (TimeSpan?)null)
            .Where(sendTime => sendTime.HasValue)
            .Select(sendTime =>
            {
                var candidate = nowNz.Date.Add(sendTime!.Value);
                return candidate <= nowNz ? candidate.AddDays(1) : candidate;
            })
            .OrderBy(candidate => candidate)
            .FirstOrDefault();

        if (nextScheduledAt == default)
            return SettingsRefreshInterval;

        var delay = nextScheduledAt - nowNz;
        if (delay <= TimeSpan.Zero)
            return TimeSpan.FromMinutes(1);

        return delay < SettingsRefreshInterval ? delay : SettingsRefreshInterval;
    }

    private static TimeZoneInfo ResolveTimeZone(string? timeZoneId)
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(string.IsNullOrWhiteSpace(timeZoneId) ? DefaultTimeZoneId : timeZoneId);
        }
        catch
        {
            return TimeZoneInfo.FindSystemTimeZoneById(DefaultTimeZoneId);
        }
    }
}
