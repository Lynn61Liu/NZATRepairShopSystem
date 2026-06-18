namespace Workshop.Api.DTOs;

public sealed record CreateCourtesyCarAgreementRequest(long VehicleId);

public sealed class UpdateCourtesyCarAgreementRequest
{
    public string? Status { get; set; }
    public string? CurrentStep { get; set; }
    public string? ContactName { get; set; }
    public string? ContactPhone { get; set; }
    public string? ContactEmail { get; set; }
    public string? ContactAddress { get; set; }
    public string? DriverLicenseNumber { get; set; }
    public DateOnly? DriverLicenseExpiry { get; set; }
    public string? EmergencyContactName { get; set; }
    public string? EmergencyContactPhone { get; set; }
    public bool? TermsConfirmed { get; set; }
    public string? SignatureName { get; set; }
}

