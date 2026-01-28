using System.Globalization;
using System.Text.RegularExpressions;

namespace CarjamImporter.Parsers;
/// <summary>
/// Utility class for parsing various value formats.
/// </summary>
public static class ValueParsers
{
    public static int? ParseIntLoose(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        var digits = Regex.Replace(s, @"[^\d\-]", "");
        return int.TryParse(digits, out var n) ? n : null;
    }

    public static int? ParseCcToInt(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        var m = Regex.Match(s, @"([\d,]+)\s*cc", RegexOptions.IgnoreCase);
        if (!m.Success) return ParseIntLoose(s);
        var raw = m.Groups[1].Value.Replace(",", "");
        return int.TryParse(raw, out var n) ? n : null;
    }

    public static int? ParseKgToInt(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        var m = Regex.Match(s, @"([\d,]+)\s*kg", RegexOptions.IgnoreCase);
        if (!m.Success) return ParseIntLoose(s);
        var raw = m.Groups[1].Value.Replace(",", "");
        return int.TryParse(raw, out var n) ? n : null;
    }

    public static decimal? ParseDecimalLoose(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        var m = Regex.Match(s, @"-?[\d]+(\.[\d]+)?");
        if (!m.Success) return null;
        return decimal.TryParse(m.Value, NumberStyles.Number, CultureInfo.InvariantCulture, out var d) ? d : null;
    }

    public static DateTime? ParseDateNZStyle(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;

        var formats = new[]
        {
            "dd-MMM-yyyy",
            "yyyy-MMM-dd",
            "yyyy-MM-dd",
            "yyyy-MM",
            "dd/MM/yyyy",
            "yyyy/MM/dd"
        };

        if (DateTime.TryParseExact(s.Trim(), formats, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var dt))
            return dt.Date;

        if (DateTime.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out dt))
            return dt.Date;

        return null;
    }
}
