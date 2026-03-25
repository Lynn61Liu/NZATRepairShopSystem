using Microsoft.Extensions.Options;
using Workshop.Api.Options;

namespace Workshop.Api.Services;

public sealed class BusinessHoursService
{
    private readonly PoFollowUpOptions _options;

    public BusinessHoursService(IOptions<PoFollowUpOptions> options)
    {
        _options = options.Value;
    }

    public DateTime CalculateNextFollowUpDueAtUtc(DateTime fromUtc)
    {
        if (_options.EffectiveFollowUpDelayMinutesOverride.HasValue)
            return DateTime.SpecifyKind(fromUtc, DateTimeKind.Utc).AddMinutes(_options.EffectiveFollowUpDelayMinutesOverride.Value);

        var zone = ResolveTimeZone();
        var local = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(fromUtc, DateTimeKind.Utc), zone);
        var remainingHours = _options.EffectiveFollowUpDelayWorkingHours;

        var cursor = AlignToWorkingWindow(local);
        while (remainingHours > 0)
        {
            if (!IsWorkingDay(cursor.Date))
            {
                cursor = StartOfNextWorkingDay(cursor.Date);
                continue;
            }

            var endOfDay = cursor.Date.AddHours(_options.WorkingDayEndHour);
            var availableHours = Math.Max(0, (endOfDay - cursor).TotalHours);
            if (availableHours <= 0)
            {
                cursor = StartOfNextWorkingDay(cursor.Date);
                continue;
            }

            if (availableHours >= remainingHours)
            {
                cursor = cursor.AddHours(remainingHours);
                remainingHours = 0;
            }
            else
            {
                remainingHours -= (int)Math.Ceiling(availableHours);
                cursor = StartOfNextWorkingDay(cursor.Date);
            }
        }

        return TimeZoneInfo.ConvertTimeToUtc(cursor, zone);
    }

    private DateTime AlignToWorkingWindow(DateTime local)
    {
        if (!IsWorkingDay(local.Date))
            return StartOfNextWorkingDay(local.Date);

        var dayStart = local.Date.AddHours(_options.WorkingDayStartHour);
        var dayEnd = local.Date.AddHours(_options.WorkingDayEndHour);

        if (local < dayStart)
            return dayStart;

        if (local >= dayEnd)
            return StartOfNextWorkingDay(local.Date);

        return local;
    }

    private DateTime StartOfNextWorkingDay(DateTime currentDate)
    {
        var next = currentDate.AddDays(1);
        while (!IsWorkingDay(next))
            next = next.AddDays(1);

        return next.Date.AddHours(_options.WorkingDayStartHour);
    }

    private static bool IsWorkingDay(DateTime date) =>
        date.DayOfWeek != DayOfWeek.Saturday && date.DayOfWeek != DayOfWeek.Sunday;

    private TimeZoneInfo ResolveTimeZone()
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(_options.TimeZoneId);
        }
        catch
        {
            return TimeZoneInfo.Utc;
        }
    }
}
