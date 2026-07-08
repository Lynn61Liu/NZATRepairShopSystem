using System.Text.RegularExpressions;

namespace Workshop.Api.Services;

public static class PoReferenceBuilder
{
    private static readonly Regex PendingTokenRegex = new(@"\bpending\b", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex WhitespaceRegex = new(@"\s+", RegexOptions.Compiled);

    public static string BuildReference(string? currentReference, string? poNumber)
    {
        var normalizedPo = Collapse(poNumber);
        if (string.IsNullOrWhiteSpace(normalizedPo))
            return Collapse(currentReference);

        var normalizedReference = Collapse(currentReference);
        if (string.IsNullOrWhiteSpace(normalizedReference))
            return normalizedPo;

        if (PendingTokenRegex.IsMatch(normalizedReference))
            return Collapse(PendingTokenRegex.Replace(normalizedReference, normalizedPo, 1));

        return Collapse($"{normalizedPo} {normalizedReference}");
    }

    private static string Collapse(string? value) =>
        string.IsNullOrWhiteSpace(value)
            ? ""
            : WhitespaceRegex.Replace(value.Trim(), " ");
}
