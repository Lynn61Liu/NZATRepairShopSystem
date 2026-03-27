using Workshop.Api.DTOs;
using Workshop.Api.Models;

namespace Workshop.Api.Services;

public static class JobInvoicePartsLineItemBuilder
{
    public const string DefaultItemCode = "333Parts";

    public static List<XeroInvoiceLineItemInput> Build(
        IEnumerable<JobPartsService> partsServices,
        InventoryItem? inventoryItem,
        string itemCode = DefaultItemCode)
    {
        return partsServices
            .Where(x => !string.IsNullOrWhiteSpace(x.Description))
            .Select(x => BuildSingle(x.Description.Trim(), inventoryItem, itemCode))
            .ToList();
    }

    public static XeroInvoiceLineItemInput BuildSingle(
        string description,
        InventoryItem? inventoryItem,
        string itemCode = DefaultItemCode)
    {
        if (inventoryItem is not null)
        {
            return new XeroInvoiceLineItemInput
            {
                ItemCode = itemCode,
                Description = description,
                Quantity = 1m,
                UnitAmount = 0m,
                AccountCode = inventoryItem.SalesAccount ?? inventoryItem.PurchasesAccount,
                TaxType = NormalizeXeroTaxType(inventoryItem.SalesTaxRate ?? inventoryItem.PurchasesTaxRate),
            };
        }

        return new XeroInvoiceLineItemInput
        {
            ItemCode = itemCode,
            Description = description,
            Quantity = 1m,
            UnitAmount = 0m,
        };
    }

    private static string? NormalizeXeroTaxType(string? value)
    {
        var normalized = value?.Trim();
        if (string.IsNullOrWhiteSpace(normalized))
            return null;

        return normalized switch
        {
            "15% GST on Income" => "OUTPUT2",
            "15% GST on Expenses" => "INPUT2",
            "No GST" => "NONE",
            _ when normalized.Contains(' ') || normalized.Contains('%') => null,
            _ => normalized,
        };
    }
}
