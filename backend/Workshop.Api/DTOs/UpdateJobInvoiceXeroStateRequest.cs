using System.ComponentModel.DataAnnotations;

namespace Workshop.Api.DTOs;

public sealed class UpdateJobInvoiceXeroStateRequest
{
    [Required]
    public string State { get; set; } = "";

    public string? EpostReferenceId { get; set; }
}
