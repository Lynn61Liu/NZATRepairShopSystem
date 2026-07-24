using System.Text.RegularExpressions;

namespace CarjamImporter.Mappers;

internal static partial class VehicleModelComposer
{
    public static string? Combine(string? model, string? submodel)
    {
        var normalizedModel = Normalize(model);
        var normalizedSubmodel = Normalize(submodel);

        if (normalizedModel is null) return normalizedSubmodel;
        if (normalizedSubmodel is null) return normalizedModel;
        if (string.Equals(normalizedModel, normalizedSubmodel, StringComparison.OrdinalIgnoreCase))
            return normalizedModel;

        var modelKey = ComparisonKey(normalizedModel);
        if (string.Equals(modelKey, ComparisonKey(normalizedSubmodel), StringComparison.OrdinalIgnoreCase))
            return normalizedModel;

        var firstSpace = normalizedSubmodel.IndexOf(' ');
        var firstSubmodelPart = firstSpace < 0
            ? normalizedSubmodel
            : normalizedSubmodel[..firstSpace];
        var remainingSubmodel = firstSpace < 0
            ? null
            : normalizedSubmodel[(firstSpace + 1)..];

        var firstSubmodelKey = ComparisonKey(firstSubmodelPart);

        // Prefer CarJam's base-model spelling (for example CX-5 + CX5 TAKAMI).
        if (string.Equals(modelKey, firstSubmodelKey, StringComparison.OrdinalIgnoreCase))
            return AppendDetails(normalizedModel, remainingSubmodel);

        // CarJam sometimes repeats the base model in submodel (for example CLA + CLA250).
        if (StartsWithCompleteModel(normalizedSubmodel, normalizedModel))
            return normalizedSubmodel;
        if (StartsWithCompleteModel(normalizedModel, normalizedSubmodel))
            return normalizedModel;

        // Avoid values such as "CLA250 250 SPORT" if CarJam's model becomes more detailed.
        if (HasTrailingSubmodelPart(normalizedModel, modelKey, firstSubmodelKey))
        {
            return remainingSubmodel is null
                ? normalizedModel
                : $"{normalizedModel} {remainingSubmodel}";
        }

        return AppendDetails(normalizedModel, normalizedSubmodel);
    }

    private static bool HasTrailingSubmodelPart(
        string model,
        string modelKey,
        string firstSubmodelKey)
    {
        if (firstSubmodelKey.Length == 0) return false;

        var lastSeparator = model.Length - 1;
        while (lastSeparator >= 0 && char.IsLetterOrDigit(model[lastSeparator]))
            lastSeparator--;

        var lastModelPart = ComparisonKey(model[(lastSeparator + 1)..]);
        if (string.Equals(lastModelPart, firstSubmodelKey, StringComparison.OrdinalIgnoreCase))
            return true;

        if (!char.IsDigit(firstSubmodelKey[0]) ||
            !modelKey.EndsWith(firstSubmodelKey, StringComparison.OrdinalIgnoreCase))
            return false;

        var badgeStart = modelKey.Length - firstSubmodelKey.Length;
        return badgeStart > 0 && char.IsLetter(modelKey[badgeStart - 1]);
    }

    private static bool StartsWithCompleteModel(string candidate, string model)
    {
        if (candidate.StartsWith(model, StringComparison.OrdinalIgnoreCase))
        {
            if (candidate.Length == model.Length) return true;

            var next = candidate[model.Length];
            if (!char.IsLetterOrDigit(next) ||
                (char.IsLetter(model[^1]) && char.IsDigit(next)))
                return true;
        }

        return false;
    }

    private static string AppendDetails(string model, string? details)
    {
        if (string.IsNullOrWhiteSpace(details)) return model;

        var firstSpace = details.IndexOf(' ');
        var firstPart = firstSpace < 0 ? details : details[..firstSpace];
        var separator = ShouldCompactNumericBadge(ComparisonKey(model), firstPart) ? "" : " ";
        return $"{model}{separator}{details}";
    }

    private static bool ShouldCompactNumericBadge(string modelKey, string firstSubmodelPart)
        => modelKey.Length is >= 1 and <= 4
           && modelKey.All(char.IsLetter)
           && NumericBadgePattern().IsMatch(firstSubmodelPart);

    private static string ComparisonKey(string value)
        => new(value.Where(char.IsLetterOrDigit).Select(char.ToUpperInvariant).ToArray());

    private static string? Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        return WhitespacePattern().Replace(value.Trim(), " ");
    }

    [GeneratedRegex(@"^\d{2,4}[A-Za-z]{0,2}$", RegexOptions.CultureInvariant)]
    private static partial Regex NumericBadgePattern();

    [GeneratedRegex(@"\s+", RegexOptions.CultureInvariant)]
    private static partial Regex WhitespacePattern();
}
