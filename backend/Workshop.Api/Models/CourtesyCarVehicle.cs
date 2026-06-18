namespace Workshop.Api.Models;

public class CourtesyCarVehicle
{
    public long Id { get; set; }
    public string Plate { get; set; } = "";
    public string? Make { get; set; }
    public string? Model { get; set; }
    public string? Color { get; set; }
    public int? Year { get; set; }
    public int? Mileage { get; set; }
    public string? FuelLevel { get; set; }
    public decimal AgreedVehicleValue { get; set; }
    public string Status { get; set; } = "available";
    public string? Note { get; set; }
    public DateOnly? WofExpiry { get; set; }
    public DateOnly? RegoExpiry { get; set; }
    public DateTime? LoanedAt { get; set; }
    public string? BorrowerName { get; set; }
    public string? BorrowerPhone { get; set; }
    public string? AttachmentsJson { get; set; }
    public DateTime? ReturnedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
