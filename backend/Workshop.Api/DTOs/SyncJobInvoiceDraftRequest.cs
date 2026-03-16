using System.ComponentModel.DataAnnotations;

namespace Workshop.Api.DTOs;

public sealed class SyncJobInvoiceDraftRequest
{
    public string? Status { get; set; }
    public string LineAmountTypes { get; set; } = "Inclusive";
    public DateOnly? Date { get; set; }
    public string? Reference { get; set; }
    public string? ContactName { get; set; }

    [MinLength(1)]
    public List<XeroInvoiceLineItemInput> LineItems { get; set; } = new();
}
