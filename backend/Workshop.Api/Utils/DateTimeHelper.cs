using System.Globalization;

namespace Workshop.Api.Utils;

public static class DateTimeHelper
{
    public const string ApiDateTimeFormat = "yyyy-MM-dd'T'HH:mm:ss.fff'Z'";
    public const string NzTimeZoneId = "Pacific/Auckland";

    private static readonly TimeZoneInfo NzTimeZone = ResolveNzTimeZone();

    public static DateTime NormalizeUtc(DateTime value)
    {
        var utc = value.Kind switch
        {
            DateTimeKind.Utc => value,
            DateTimeKind.Local => value.ToUniversalTime(),
            _ => DateTime.SpecifyKind(value, DateTimeKind.Utc)
        };

        return TruncateToMilliseconds(utc);
    }

    public static DateTime? NormalizeUtc(DateTime? value)
        => value.HasValue ? NormalizeUtc(value.Value) : null;

    public static string FormatUtc(DateTime value)
        => NormalizeUtc(value).ToString(ApiDateTimeFormat, CultureInfo.InvariantCulture);

    public static DateTime ConvertUtcToNz(DateTime value)
        => TimeZoneInfo.ConvertTimeFromUtc(NormalizeUtc(value), NzTimeZone);

    public static string FormatNz(DateTime value, string format = "yyyy-MM-dd HH:mm:ss")
        => ConvertUtcToNz(value).ToString(format, CultureInfo.InvariantCulture);

    public static string FormatNz(DateTime? value, string format = "yyyy-MM-dd HH:mm:ss", string emptyValue = "")
        => value.HasValue ? FormatNz(value.Value, format) : emptyValue;

    private static DateTime TruncateToMilliseconds(DateTime value)
    {
        var ticks = value.Ticks - (value.Ticks % TimeSpan.TicksPerMillisecond);
        return new DateTime(ticks, DateTimeKind.Utc);
    }

    private static TimeZoneInfo ResolveNzTimeZone()
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(NzTimeZoneId);
        }
        catch
        {
            return TimeZoneInfo.Utc;
        }
    }
}
