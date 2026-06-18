using System.Text.Json;

namespace Workshop.Api.Models;

public class CourtesyCarAgreement
{
    public long Id { get; set; }
    public long JobId { get; set; }
    public Job? Job { get; set; }
    public long VehicleId { get; set; }
    public CourtesyCarVehicle? Vehicle { get; set; }
    public long? CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public string Status { get; set; } = "draft";
    public string CurrentStep { get; set; } = "contact";

    public string? JobVehiclePlate { get; set; }
    public string? JobCustomerName { get; set; }
    public string? JobCustomerPhone { get; set; }
    public string? JobCustomerEmail { get; set; }
    public string? JobCustomerAddress { get; set; }

    public string? ContactName { get; set; }
    public string? ContactPhone { get; set; }
    public string? ContactEmail { get; set; }
    public string? ContactAddress { get; set; }
    public string? DriverLicenseNumber { get; set; }
    public DateOnly? DriverLicenseExpiry { get; set; }
    public string? EmergencyContactName { get; set; }
    public string? EmergencyContactPhone { get; set; }
    public bool TermsConfirmed { get; set; }
    public string? SignatureName { get; set; }

    public string? VehiclePlate { get; set; }
    public string? VehicleMake { get; set; }
    public string? VehicleModel { get; set; }
    public string? VehicleColor { get; set; }
    public int? VehicleYear { get; set; }
    public int? VehicleMileage { get; set; }
    public string? VehicleFuelLevel { get; set; }
    public decimal AgreedVehicleValue { get; set; }
    public DateOnly? VehicleWofExpiry { get; set; }
    public DateOnly? VehicleRegoExpiry { get; set; }

    public string? AttachmentsJson { get; set; }
    public string? PdfFilePath { get; set; }
    public DateTime? PdfGeneratedAt { get; set; }
    public DateTime? EmailSentAt { get; set; }
    public string? EmailTo { get; set; }
    public string? EmailMessageId { get; set; }
    public DateTime? SubmittedAt { get; set; }
    public DateTime? ClosedAt { get; set; }
    public DateTime? CancelledAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public List<CourtesyCarAgreementEvent> Events { get; set; } = new();
}
