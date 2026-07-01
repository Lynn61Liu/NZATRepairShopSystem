using System.Text.RegularExpressions;

namespace Workshop.Api.Features.EStationMonitoring.Services;

public static partial class EStationIdentifierValidator
{
    public static bool IsValidStationId(string? value)
        => !string.IsNullOrWhiteSpace(value) && StationIdRegex().IsMatch(value.Trim());

    public static bool IsValidTagId(string? value)
        => !string.IsNullOrWhiteSpace(value) && TagIdRegex().IsMatch(value.Trim());

    [GeneratedRegex("^90A9F[0-9A-F]{7}$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex StationIdRegex();

    [GeneratedRegex("^AD1[0-9A-F]{9}$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex TagIdRegex();
}
