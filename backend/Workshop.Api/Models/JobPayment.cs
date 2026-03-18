namespace Workshop.Api.Models;

public class JobPayment
{
    public long Id { get; set; }
    public long JobId { get; set; }
    public long JobInvoiceId { get; set; }
    public string Provider { get; set; } = "xero";
    public string? ExternalPaymentId { get; set; }
    public string? ExternalInvoiceId { get; set; }
    public string Method { get; set; } = "";
    public decimal Amount { get; set; }
    public DateOnly PaymentDate { get; set; }
    public string? Reference { get; set; }
    public string? AccountCode { get; set; }
    public string? AccountName { get; set; }
    public string? ExternalStatus { get; set; }
    public string? RequestPayloadJson { get; set; }
    public string? ResponsePayloadJson { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
