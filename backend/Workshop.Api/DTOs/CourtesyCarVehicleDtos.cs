namespace Workshop.Api.DTOs;

public sealed record CourtesyCarAttachmentDto(
    string Id,
    string Kind,
    string Name,
    string MimeType,
    long Size,
    string DataUrl,
    DateTime CreatedAt);

public sealed record CourtesyCarVehicleAgreementSummaryDto(
    long AgreementId,
    long JobId,
    string Status,
    string CurrentStep,
    string? JobVehiclePlate,
    string? JobCustomerName,
    string? JobCustomerPhone,
    string? ContactName,
    string? ContactPhone);

public sealed record CourtesyCarVehicleRecordDto(
    long Id,
    string Plate,
    string? Make,
    string? Model,
    string? Color,
    int? Year,
    int? Mileage,
    string? FuelLevel,
    decimal AgreedVehicleValue,
    string Status,
    string? Note,
    DateOnly? WofExpiry,
    DateOnly? RegoExpiry,
    DateTime? LoanedAt,
    string? BorrowerName,
    string? BorrowerPhone,
    CourtesyCarVehicleAgreementSummaryDto? CurrentAgreement,
    DateTime? ReturnedAt,
    IReadOnlyList<CourtesyCarAttachmentDto> Attachments,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public sealed record CourtesyCarVehicleUpsertRequest(
    string Plate,
    string? Make,
    string? Model,
    string? Color,
    int? Year,
    int? Mileage,
    string? FuelLevel,
    decimal AgreedVehicleValue,
    string Status,
    string? Note,
    DateOnly? WofExpiry,
    DateOnly? RegoExpiry,
    DateTime? LoanedAt,
    string? BorrowerName,
    string? BorrowerPhone,
    IReadOnlyList<CourtesyCarAttachmentDto>? Attachments);
