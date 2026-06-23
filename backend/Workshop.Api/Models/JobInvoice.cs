namespace Workshop.Api.Models;

public class JobInvoice
{
    public long Id { get; set; }
    public long JobId { get; set; }
    public string Provider { get; set; } = "xero";
    public string? ExternalInvoiceId { get; set; }
    public string? ExternalInvoiceNumber { get; set; }
    public string? ExternalStatus { get; set; }
    public string? Reference { get; set; }
    public string? ContactName { get; set; }
    public string? InvoiceNote { get; set; }
    public DateOnly? InvoiceDate { get; set; }
    public string LineAmountTypes { get; set; } = "Exclusive";
    public string? TenantId { get; set; }
    public string? RequestPayloadJson { get; set; }
    public string? ResponsePayloadJson { get; set; }
    public byte[]? PdfContent { get; set; }
    public byte[]? PdfPreviewContent { get; set; }
    public string? PdfFilePath { get; set; }
    public string? PdfPreviewPath { get; set; }
    public DateTime? PdfDownloadedAt { get; set; }
    public DateTime? PdfPreviewGeneratedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
