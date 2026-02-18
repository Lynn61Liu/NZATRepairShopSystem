namespace Workshop.Api.Models;

public class Job
{
    public long Id { get; set; }
    public string Status { get; set; } = "";
    public bool IsUrgent { get; set; }
    public long? VehicleId { get; set; }
    public long? CustomerId { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
