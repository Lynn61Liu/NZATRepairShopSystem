namespace Workshop.Api.Models;

public class Job
{
    public long Id { get; set; }
    public string Status { get; set; } = "";
    public bool IsUrgent { get; set; }
    public bool NeedsPo { get; set; }
    public bool UseServiceCatalogMapping { get; set; }
    public string? PoNumber { get; set; }
    public string? InvoiceReference { get; set; }
    public long? VehicleId { get; set; }
    public Vehicle? Vehicle { get; set; }
    public long? CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
