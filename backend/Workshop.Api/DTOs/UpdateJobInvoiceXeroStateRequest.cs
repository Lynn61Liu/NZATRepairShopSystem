using System.ComponentModel.DataAnnotations;

namespace Workshop.Api.DTOs;

public sealed class UpdateJobInvoiceXeroStateRequest
{
    [Required]
    public string State { get; set; } = "";

    public string? EpostReferenceId { get; set; }
    public string? Reference { get; set; }
    public decimal? Amount { get; set; }
    public DateOnly? PaymentDate { get; set; }
}
