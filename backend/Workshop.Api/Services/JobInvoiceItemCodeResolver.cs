using Workshop.Api.Models;

namespace Workshop.Api.Services;

public static class JobInvoiceItemCodeResolver
{
    private const string PersonalWofRootFallbackCode = "208-WOF";
    private const string PersonalMechRootFallbackCode = "666WORSHOP Labour Fee";
    private const string BusinessWofRootFallbackCode = "WOF-DEALERSHIP";
    private const string BusinessMechRootFallbackCode = "203-Services";
    private const string PaintRootFallbackCode = "206-PNP-L";

    public static string? Resolve(
        Customer customer,
        ServiceCatalogItem catalogItem,
        string? overrideCode)
    {
        var normalizedOverrideCode = overrideCode?.Trim();
        if (!string.IsNullOrWhiteSpace(normalizedOverrideCode))
            return normalizedOverrideCode;

        var defaultCode = string.Equals(customer.Type, "Personal", StringComparison.OrdinalIgnoreCase)
            ? catalogItem.PersonalLinkCode
            : catalogItem.DealershipLinkCode;

        var normalizedDefaultCode = defaultCode?.Trim();
        if (!string.IsNullOrWhiteSpace(normalizedDefaultCode))
            return normalizedDefaultCode;

        return ResolveRootFallbackCode(customer, catalogItem);
    }

    private static string? ResolveRootFallbackCode(Customer customer, ServiceCatalogItem catalogItem)
    {
        if (!string.Equals(catalogItem.Category, "root", StringComparison.OrdinalIgnoreCase))
            return null;

        var isPersonal = string.Equals(customer.Type, "Personal", StringComparison.OrdinalIgnoreCase);

        return catalogItem.ServiceType.Trim().ToLowerInvariant() switch
        {
            "wof" => isPersonal ? PersonalWofRootFallbackCode : BusinessWofRootFallbackCode,
            "mech" => isPersonal ? PersonalMechRootFallbackCode : BusinessMechRootFallbackCode,
            "paint" => PaintRootFallbackCode,
            _ => null,
        };
    }
}
