using System.Text.RegularExpressions;

namespace Workshop.Api.Services;

public static class PoReferenceBuilder
{
    private static readonly Regex PendingPrefixRegex = new(
        @"^(?:(?:po\s*#?\s*)?pending|\[po\])(?:\s+|$)",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex LabelledPoPrefixRegex = new(
        @"^po\s*#?\s*[a-z0-9]+(?:-[a-z0-9]+)*(?:\s*--+\s*|\s+|$)",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex PoLabelPrefixRegex = new(
        @"^po\s*#?(?:\s+|$)",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex ConfirmedPoPrefixRegex = new(
        @"^po\s*#?\s*(?<po>[a-z0-9]+(?:-[a-z0-9]+)*)(?=\s|--+|$)",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex WhitespaceRegex = new(@"\s+", RegexOptions.Compiled);

    public static string BuildReference(string? currentReference, string? poNumber)
    {
        var normalizedPo = Collapse(poNumber);
        if (string.IsNullOrWhiteSpace(normalizedPo))
            return Collapse(currentReference);

        var normalizedReference = Collapse(currentReference);
        if (string.IsNullOrWhiteSpace(normalizedReference))
            return $"PO# {normalizedPo}";

        var suffix = StripExistingPoPrefix(normalizedReference, normalizedPo);
        return Collapse($"PO# {normalizedPo} {suffix}");
    }

    public static string? ExtractPoNumber(string? reference)
    {
        var normalizedReference = Collapse(reference);
        if (string.IsNullOrWhiteSpace(normalizedReference))
            return null;

        var match = ConfirmedPoPrefixRegex.Match(normalizedReference);
        if (!match.Success)
            return null;

        var value = match.Groups["po"].Value;
        return string.Equals(value, "pending", StringComparison.OrdinalIgnoreCase) || !value.Any(char.IsDigit)
            ? null
            : value;
    }

    private static string StripExistingPoPrefix(string reference, string normalizedPo)
    {
        var suffix = reference;
        var allowBarePoPrefix = true;
        while (!string.IsNullOrWhiteSpace(suffix))
        {
            var next = ReplacePrefix(PendingPrefixRegex, suffix);
            if (!string.Equals(next, suffix, StringComparison.Ordinal))
            {
                suffix = next;
                allowBarePoPrefix = false;
                continue;
            }

            next = ReplacePrefix(LabelledPoPrefixRegex, suffix);
            if (!string.Equals(next, suffix, StringComparison.Ordinal))
            {
                suffix = next;
                allowBarePoPrefix = false;
                continue;
            }

            if (allowBarePoPrefix && TryStripExactPoPrefix(suffix, normalizedPo, out next))
            {
                suffix = next;
                allowBarePoPrefix = false;
                continue;
            }

            next = ReplacePrefix(PoLabelPrefixRegex, suffix);
            if (string.Equals(next, suffix, StringComparison.Ordinal))
                break;

            suffix = next;
            allowBarePoPrefix = false;
        }

        return suffix;
    }

    private static bool TryStripExactPoPrefix(string value, string normalizedPo, out string suffix)
    {
        if (string.Equals(value, normalizedPo, StringComparison.OrdinalIgnoreCase))
        {
            suffix = "";
            return true;
        }

        var prefix = $"{normalizedPo} ";
        if (value.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            suffix = value[prefix.Length..].TrimStart();
            return true;
        }

        suffix = value;
        return false;
    }

    private static string ReplacePrefix(Regex regex, string value) =>
        regex.Replace(value, "", 1).TrimStart();

    private static string Collapse(string? value) =>
        string.IsNullOrWhiteSpace(value)
            ? ""
            : WhitespaceRegex.Replace(value.Trim(), " ");
}
