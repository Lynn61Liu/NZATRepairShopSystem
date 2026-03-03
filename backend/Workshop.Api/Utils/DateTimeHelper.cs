using System.Globalization;

namespace Workshop.Api.Utils;

public static class DateTimeHelper
{
    public const string ApiDateTimeFormat = "yyyy-MM-dd'T'HH:mm:ss.fff'Z'";

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

    private static DateTime TruncateToMilliseconds(DateTime value)
    {
        var ticks = value.Ticks - (value.Ticks % TimeSpan.TicksPerMillisecond);
        return new DateTime(ticks, DateTimeKind.Utc);
    }
}
