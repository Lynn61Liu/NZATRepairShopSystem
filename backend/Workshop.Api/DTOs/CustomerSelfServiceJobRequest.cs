namespace Workshop.Api.DTOs;

public sealed class CustomerSelfServiceJobRequest
{
    public string Plate { get; set; } = "";
    public bool HasWof { get; set; }
    public string Name { get; set; } = "";
    public string Phone { get; set; } = "";
    public string? Email { get; set; }
    public bool RequiresQuote { get; set; }
    public string? QuoteEmail { get; set; }
    public string? QuotePartsContent { get; set; }
    public long? ExistingCustomerId { get; set; }
    public bool CustomerEdited { get; set; }
    public string? Notes { get; set; }
    public string? Address { get; set; }
    public string? Street { get; set; }
    public string? Suburb { get; set; }
    public string? City { get; set; }
}
