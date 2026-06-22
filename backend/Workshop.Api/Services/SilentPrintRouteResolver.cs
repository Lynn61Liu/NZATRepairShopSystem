namespace Workshop.Api.Services;

public sealed record SilentPrintRoute(string RouteKey, string PrinterFamily, string PrinterName, string TemplateKey);

public static class SilentPrintRouteResolver
{
    private static readonly IReadOnlyDictionary<string, SilentPrintRoute> Routes =
        new Dictionary<string, SilentPrintRoute>(StringComparer.OrdinalIgnoreCase)
        {
            ["job-mech"] = new SilentPrintRoute("job-mech", "hp", "HP", "mech"),
            ["job-wof"] = new SilentPrintRoute("job-wof", "hp", "HP", "mech"),
            ["job-pnp"] = new SilentPrintRoute("job-pnp", "hp", "HP", "pnp"),
            ["wof-record"] = new SilentPrintRoute("wof-record", "epson", "EPSON LQ-730KII", "wof-record"),
            ["small-tag"] = new SilentPrintRoute("small-tag", "brother", "Brother QL-810W", "small-tag"),
        };

    public static SilentPrintRoute Resolve(string routeKey)
    {
        var normalized = (routeKey ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized) || !Routes.TryGetValue(normalized, out var route))
            throw new InvalidOperationException($"Unknown silent print route '{routeKey}'.");

        return route;
    }
}
