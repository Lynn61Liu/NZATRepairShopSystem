using System.Globalization;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using QuestPDF.Fluent;
using Workshop.Api.Data;
using Workshop.Api.DTOs;
using Workshop.Api.Models;
using Workshop.Api.Printing;

namespace Workshop.Api.Services;

public sealed class CourtesyCarAgreementService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly AppDbContext _db;
    private readonly CourtesyCarAgreementStorageService _storage;
    private readonly GmailAccountService _gmailAccountService;
    private readonly GmailMessageSenderService _gmailMessageSenderService;

    public CourtesyCarAgreementService(
        AppDbContext db,
        CourtesyCarAgreementStorageService storage,
        GmailAccountService gmailAccountService,
        GmailMessageSenderService gmailMessageSenderService)
    {
        _db = db;
        _storage = storage;
        _gmailAccountService = gmailAccountService;
        _gmailMessageSenderService = gmailMessageSenderService;
    }

    public async Task<List<CourtesyCarVehicleDto>> GetAvailableVehiclesAsync(CancellationToken ct)
    {
        var vehicles = await _db.CourtesyCarVehicles.AsNoTracking()
            .Where(x => x.Status == "available")
            .OrderBy(x => x.Plate)
            .ToListAsync(ct);

        return vehicles.Select(MapVehicleDto).ToList();
    }

    public async Task<List<CourtesyCarAgreementListItemDto>> ListActiveAgreementsAsync(CancellationToken ct)
    {
        var agreements = await _db.CourtesyCarAgreements.AsNoTracking()
            .Where(x => x.Status == "draft" || x.Status == "in_progress" || x.Status == "inprogress" || x.Status == "active")
            .OrderByDescending(x => x.UpdatedAt)
            .ThenByDescending(x => x.Id)
            .ToListAsync(ct);

        return agreements.Select(MapListItemDto).ToList();
    }

    public async Task<List<CourtesyCarAgreementListItemDto>> ListAgreementHistoryAsync(CancellationToken ct)
    {
        var agreements = await _db.CourtesyCarAgreements.AsNoTracking()
            .OrderByDescending(x => x.UpdatedAt)
            .ThenByDescending(x => x.Id)
            .ToListAsync(ct);

        return agreements.Select(MapListItemDto).ToList();
    }

    public async Task<CourtesyCarAgreementMutationResult<bool>> DeleteAgreementAsync(long agreementId, CancellationToken ct)
    {
        var agreement = await LoadAgreementForUpdateAsync(agreementId, ct);
        if (agreement is null)
            return CourtesyCarAgreementMutationResult<bool>.Fail(404, "Agreement not found.");

        // Remove the stored files first so a successful API response always means
        // the on-disk attachments and generated PDF are gone too.
        _storage.DeleteAgreementDirectory(agreementId);

        var now = DateTime.UtcNow;
        var vehicle = agreement.VehicleId.HasValue
            ? await _db.CourtesyCarVehicles.FirstOrDefaultAsync(x => x.Id == agreement.VehicleId.Value, ct)
            : null;
        if (vehicle is not null)
        {
            vehicle.Status = "available";
            vehicle.ReturnedAt = now;
            vehicle.LoanedAt = null;
            vehicle.BorrowerName = null;
            vehicle.BorrowerPhone = null;
            vehicle.UpdatedAt = now;
        }

        var events = await _db.CourtesyCarAgreementEvents
            .Where(x => x.CourtesyCarAgreementId == agreementId)
            .ToListAsync(ct);
        if (events.Count > 0)
            _db.CourtesyCarAgreementEvents.RemoveRange(events);

        _db.CourtesyCarAgreements.Remove(agreement);
        await _db.SaveChangesAsync(ct);

        return CourtesyCarAgreementMutationResult<bool>.Ok(true);
    }

    public async Task<CourtesyCarAgreementMutationResult<CourtesyCarAgreementDetailDto>> ReturnAgreementAsync(long agreementId, CancellationToken ct)
    {
        var agreement = await LoadAgreementForUpdateAsync(agreementId, ct);
        if (agreement is null)
            return CourtesyCarAgreementMutationResult<CourtesyCarAgreementDetailDto>.Fail(404, "Agreement not found.");

        var currentStatus = NormalizeStoredStatus(agreement.Status);
        if (!string.Equals(currentStatus, "submitted", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(currentStatus, "active", StringComparison.OrdinalIgnoreCase))
        {
            return CourtesyCarAgreementMutationResult<CourtesyCarAgreementDetailDto>.Fail(409, "Only active or submitted agreements can be returned.");
        }

        if (!agreement.VehicleId.HasValue)
            return CourtesyCarAgreementMutationResult<CourtesyCarAgreementDetailDto>.Fail(404, "Courtesy car not found.");

        var vehicle = await _db.CourtesyCarVehicles.FirstOrDefaultAsync(x => x.Id == agreement.VehicleId.Value, ct);
        if (vehicle is null)
            return CourtesyCarAgreementMutationResult<CourtesyCarAgreementDetailDto>.Fail(404, "Courtesy car not found.");

        var now = DateTime.UtcNow;
        agreement.Status = "closed";
        agreement.CurrentStep = "closed";
        agreement.ClosedAt ??= now;
        agreement.UpdatedAt = now;

        vehicle.Status = "available";
        vehicle.ReturnedAt = now;
        vehicle.LoanedAt = null;
        vehicle.BorrowerName = null;
        vehicle.BorrowerPhone = null;
        vehicle.UpdatedAt = now;

        AddEvent(agreement, "agreement.returned", "admin", "system", new
        {
            beforeStatus = currentStatus,
            afterStatus = agreement.Status,
            vehicleId = vehicle.Id,
            vehiclePlate = vehicle.Plate,
        }, now);

        await _db.SaveChangesAsync(ct);
        return CourtesyCarAgreementMutationResult<CourtesyCarAgreementDetailDto>.Ok(await MapDetailAsync(agreement, ct));
    }

    public async Task<CourtesyCarAgreementDetailDto?> GetAgreementAsync(long agreementId, CancellationToken ct)
    {
        var agreement = await LoadAgreementAsync(agreementId, ct);
        return agreement is null ? null : await MapDetailAsync(agreement, ct);
    }

    public async Task<CourtesyCarAgreementMutationResult<CourtesyCarAgreementDetailDto>> CreateDraftAsync(long jobId, long vehicleId, CancellationToken ct)
    {
        var job = await _db.Jobs.AsNoTracking()
            .Include(x => x.Customer)
            .Include(x => x.Vehicle)
            .FirstOrDefaultAsync(x => x.Id == jobId, ct);
        if (job is null)
            return CourtesyCarAgreementMutationResult<CourtesyCarAgreementDetailDto>.Fail(404, "Job not found.");
        if (job.Customer is null)
            return CourtesyCarAgreementMutationResult<CourtesyCarAgreementDetailDto>.Fail(400, "Job customer is required to create a courtesy car agreement.");

        var vehicle = await _db.CourtesyCarVehicles.FirstOrDefaultAsync(x => x.Id == vehicleId, ct);
        if (vehicle is null)
            return CourtesyCarAgreementMutationResult<CourtesyCarAgreementDetailDto>.Fail(404, "Courtesy car not found.");
        if (!string.Equals(vehicle.Status, "available", StringComparison.OrdinalIgnoreCase))
            return CourtesyCarAgreementMutationResult<CourtesyCarAgreementDetailDto>.Fail(409, "Courtesy car is not available.");

        var now = DateTime.UtcNow;
        var agreement = new CourtesyCarAgreement
        {
            JobId = job.Id,
            VehicleId = vehicle.Id,
            CustomerId = job.CustomerId,
            Status = "draft",
            CurrentStep = "contact",
            JobVehiclePlate = job.Vehicle?.Plate,
            JobCustomerName = job.Customer.Name,
            JobCustomerPhone = job.Customer.Phone,
            JobCustomerEmail = job.Customer.Email,
            JobCustomerAddress = job.Customer.Address,
            VehiclePlate = vehicle.Plate,
            VehicleMake = vehicle.Make,
            VehicleModel = vehicle.Model,
            VehicleColor = vehicle.Color,
            VehicleYear = vehicle.Year,
            VehicleMileage = vehicle.Mileage,
            VehicleFuelLevel = vehicle.FuelLevel,
            AgreedVehicleValue = vehicle.AgreedVehicleValue,
            VehicleWofExpiry = vehicle.WofExpiry,
            VehicleRegoExpiry = vehicle.RegoExpiry,
            CreatedAt = now,
            UpdatedAt = now,
        };

        vehicle.Status = "on_loan";
        vehicle.LoanedAt = now;
        vehicle.BorrowerName = job.Customer.Name;
        vehicle.BorrowerPhone = job.Customer.Phone;
        vehicle.ReturnedAt = null;
        vehicle.UpdatedAt = now;

        _db.CourtesyCarAgreements.Add(agreement);
        _db.CourtesyCarAgreementEvents.Add(new CourtesyCarAgreementEvent
        {
            CourtesyCarAgreement = agreement,
            EventType = "draft.created",
            ActorType = "admin",
            ActorName = "system",
            PayloadJson = JsonSerializer.Serialize(new
            {
                jobId = job.Id,
                vehicleId = vehicle.Id,
                vehiclePlate = vehicle.Plate,
            }, JsonOptions),
            CreatedAt = now,
        });

        await _db.SaveChangesAsync(ct);
        return CourtesyCarAgreementMutationResult<CourtesyCarAgreementDetailDto>.Ok(await MapDetailAsync(agreement, ct));
    }

    public async Task<CourtesyCarAgreementMutationResult<CourtesyCarAgreementDetailDto>> UpdateAgreementAsync(
        long agreementId,
        UpdateCourtesyCarAgreementRequest request,
        CancellationToken ct)
    {
        var agreement = await LoadAgreementForUpdateAsync(agreementId, ct);
        if (agreement is null)
            return CourtesyCarAgreementMutationResult<CourtesyCarAgreementDetailDto>.Fail(404, "Agreement not found.");

        var now = DateTime.UtcNow;
        var beforeStatus = NormalizeStoredStatus(agreement.Status) ?? agreement.Status;
        var beforeStep = agreement.CurrentStep;

        var statusExplicit = !string.IsNullOrWhiteSpace(request.Status);
        if (statusExplicit)
        {
            var normalizedStatus = NormalizeStatus(request.Status);
            if (normalizedStatus is null)
                return CourtesyCarAgreementMutationResult<CourtesyCarAgreementDetailDto>.Fail(400, "Invalid agreement status.");

            agreement.Status = normalizedStatus;
            if (string.Equals(normalizedStatus, "cancelled", StringComparison.OrdinalIgnoreCase))
            {
                agreement.CancelledAt ??= now;
                if (agreement.VehicleId.HasValue)
                {
                    var vehicle = await _db.CourtesyCarVehicles.FirstOrDefaultAsync(x => x.Id == agreement.VehicleId.Value, ct);
                    if (vehicle is not null)
                    {
                        vehicle.Status = "available";
                        vehicle.ReturnedAt = now;
                        vehicle.LoanedAt = null;
                        vehicle.BorrowerName = null;
                        vehicle.BorrowerPhone = null;
                        vehicle.UpdatedAt = now;
                    }
                }
            }
            else if (string.Equals(normalizedStatus, "inprogress", StringComparison.OrdinalIgnoreCase) &&
                     string.Equals(beforeStatus, "draft", StringComparison.OrdinalIgnoreCase))
            {
                agreement.UpdatedAt = now;
            }
        }

        if (!string.IsNullOrWhiteSpace(request.CurrentStep))
            agreement.CurrentStep = NormalizeStep(request.CurrentStep) ?? agreement.CurrentStep;

        agreement.ContactName = NormalizeBlank(request.ContactName) ?? agreement.ContactName;
        agreement.ContactPhone = NormalizeBlank(request.ContactPhone) ?? agreement.ContactPhone;
        agreement.ContactEmail = NormalizeBlank(request.ContactEmail) ?? agreement.ContactEmail;
        agreement.ContactAddress = NormalizeBlank(request.ContactAddress) ?? agreement.ContactAddress;
        agreement.DriverLicenseNumber = NormalizeBlank(request.DriverLicenseNumber) ?? agreement.DriverLicenseNumber;
        agreement.DriverLicenseExpiry = request.DriverLicenseExpiry ?? agreement.DriverLicenseExpiry;
        agreement.EmergencyContactName = NormalizeBlank(request.EmergencyContactName) ?? agreement.EmergencyContactName;
        agreement.EmergencyContactPhone = NormalizeBlank(request.EmergencyContactPhone) ?? agreement.EmergencyContactPhone;
        if (request.TermsConfirmed.HasValue)
            agreement.TermsConfirmed = request.TermsConfirmed.Value;
        agreement.SignatureName = NormalizeBlank(request.SignatureName) ?? agreement.SignatureName;

        if (!statusExplicit &&
            string.Equals(beforeStatus, "draft", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(NormalizeStoredStatus(agreement.Status), "cancelled", StringComparison.OrdinalIgnoreCase))
        {
            agreement.Status = "inprogress";
        }

        agreement.UpdatedAt = now;
        AddEvent(agreement, "agreement.updated", "customer", agreement.ContactName ?? agreement.JobCustomerName, new
        {
            beforeStatus,
            afterStatus = agreement.Status,
            beforeStep,
            afterStep = agreement.CurrentStep,
        }, now);

        await _db.SaveChangesAsync(ct);
        return CourtesyCarAgreementMutationResult<CourtesyCarAgreementDetailDto>.Ok(await MapDetailAsync(agreement, ct));
    }

    public async Task<CourtesyCarAgreementMutationResult<CourtesyCarAgreementAttachmentDto>> UploadAttachmentAsync(
        long agreementId,
        string kind,
        IFormFile file,
        CancellationToken ct)
    {
        var agreement = await LoadAgreementForUpdateAsync(agreementId, ct);
        if (agreement is null)
            return CourtesyCarAgreementMutationResult<CourtesyCarAgreementAttachmentDto>.Fail(404, "Agreement not found.");
        if (file.Length <= 0)
            return CourtesyCarAgreementMutationResult<CourtesyCarAgreementAttachmentDto>.Fail(400, "Attachment file is empty.");

        var attachment = await _storage.SaveAttachmentAsync(agreementId, kind, file, ct);
        var attachments = LoadAttachments(agreement);
        attachments.Add(attachment);
        agreement.AttachmentsJson = JsonSerializer.Serialize(attachments, JsonOptions);
        agreement.CurrentStep = agreement.CurrentStep == "contact" ? "license" : agreement.CurrentStep;
        if (string.Equals(NormalizeStoredStatus(agreement.Status), "draft", StringComparison.OrdinalIgnoreCase))
            agreement.Status = "inprogress";
        agreement.UpdatedAt = DateTime.UtcNow;

        AddEvent(agreement, "attachment.uploaded", "customer", agreement.ContactName ?? agreement.JobCustomerName, new
        {
            attachment.Id,
            attachment.Kind,
            attachment.Name,
            attachment.MimeType,
            attachment.Size,
        }, agreement.UpdatedAt);

        await _db.SaveChangesAsync(ct);
        return CourtesyCarAgreementMutationResult<CourtesyCarAgreementAttachmentDto>.Ok(MapAttachmentDto(agreement.Id, attachment));
    }

    public async Task<CourtesyCarAgreementMutationResult<CourtesyCarAgreementDetailDto>> SubmitAsync(long agreementId, CancellationToken ct)
    {
        var agreement = await LoadAgreementForUpdateAsync(agreementId, ct);
        if (agreement is null)
            return CourtesyCarAgreementMutationResult<CourtesyCarAgreementDetailDto>.Fail(404, "Agreement not found.");

        var currentStatus = NormalizeStoredStatus(agreement.Status);
        if (string.Equals(currentStatus, "submitted", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(currentStatus, "closed", StringComparison.OrdinalIgnoreCase))
        {
            return CourtesyCarAgreementMutationResult<CourtesyCarAgreementDetailDto>.Fail(409, "Agreement has already been submitted.");
        }

        var validationError = ValidateForSubmit(agreement);
        if (!string.IsNullOrWhiteSpace(validationError))
            return CourtesyCarAgreementMutationResult<CourtesyCarAgreementDetailDto>.Fail(400, validationError);

        var now = DateTime.UtcNow;
        agreement.SignatureName = FirstNonBlank(agreement.SignatureName, agreement.ContactName, agreement.JobCustomerName);
        agreement.Status = "active";
        agreement.CurrentStep = "review";
        agreement.UpdatedAt = now;

        var detail = await MapDetailAsync(agreement, ct);
        var emailResult = await GenerateAndSendAgreementEmailAsync(agreement, detail, ct);
        if (!emailResult.Success)
            return CourtesyCarAgreementMutationResult<CourtesyCarAgreementDetailDto>.Fail(emailResult.StatusCode, emailResult.Error ?? "Failed to send agreement email.");

        await _db.SaveChangesAsync(ct);
        return CourtesyCarAgreementMutationResult<CourtesyCarAgreementDetailDto>.Ok(await MapDetailAsync(agreement, ct));
    }

    public async Task<CourtesyCarAgreementPreviewValidationDto?> ValidatePreviewAsync(long agreementId, CancellationToken ct)
    {
        var agreement = await LoadAgreementAsync(agreementId, ct);
        if (agreement is null)
            return null;

        var validationError = ValidateForSubmit(agreement);
        return new CourtesyCarAgreementPreviewValidationDto(
            agreement.Id,
            string.IsNullOrWhiteSpace(validationError),
            validationError);
    }

    public async Task<CourtesyCarAgreementDownloadResult?> DownloadAttachmentAsync(long agreementId, string attachmentId, CancellationToken ct)
    {
        var agreement = await LoadAgreementAsync(agreementId, ct);
        if (agreement is null)
            return null;

        var attachment = LoadAttachments(agreement).FirstOrDefault(x => string.Equals(x.Id, attachmentId, StringComparison.Ordinal));
        if (attachment is null)
            return null;

        var bytes = await _storage.ReadBytesAsync(attachment, ct);
        if (bytes is null)
            return null;

        return new CourtesyCarAgreementDownloadResult(bytes, attachment.MimeType, attachment.Name);
    }

    public async Task<byte[]?> DownloadPdfAsync(long agreementId, CancellationToken ct)
    {
        var agreement = await LoadAgreementAsync(agreementId, ct);
        if (agreement is null || string.IsNullOrWhiteSpace(agreement.PdfFilePath) || !File.Exists(agreement.PdfFilePath))
            return null;

        return await File.ReadAllBytesAsync(agreement.PdfFilePath, ct);
    }

    private async Task<CourtesyCarAgreement?> LoadAgreementAsync(long agreementId, CancellationToken ct) =>
        await _db.CourtesyCarAgreements.AsNoTracking()
            .Include(x => x.Events)
            .FirstOrDefaultAsync(x => x.Id == agreementId, ct);

    private async Task<CourtesyCarAgreement?> LoadAgreementForUpdateAsync(long agreementId, CancellationToken ct) =>
        await _db.CourtesyCarAgreements.FirstOrDefaultAsync(x => x.Id == agreementId, ct);

    private async Task<CourtesyCarAgreementDetailDto> MapDetailAsync(CourtesyCarAgreement agreement, CancellationToken ct)
    {
        var attachments = LoadAttachments(agreement)
            .Select(x => MapAttachmentDto(agreement.Id, x))
            .ToList();

        var events = await _db.CourtesyCarAgreementEvents.AsNoTracking()
            .Where(x => x.CourtesyCarAgreementId == agreement.Id)
            .OrderBy(x => x.CreatedAt)
            .ThenBy(x => x.Id)
            .Select(x => new CourtesyCarAgreementEventDto(x.Id, x.EventType, x.ActorType, x.ActorName, x.PayloadJson, x.CreatedAt))
            .ToListAsync(ct);

        return new CourtesyCarAgreementDetailDto(
            agreement.Id,
            agreement.JobId,
            agreement.VehicleId,
            agreement.CustomerId,
            NormalizeStoredStatus(agreement.Status) ?? agreement.Status,
            agreement.CurrentStep,
            agreement.JobVehiclePlate,
            agreement.JobCustomerName,
            agreement.JobCustomerPhone,
            agreement.JobCustomerEmail,
            agreement.JobCustomerAddress,
            agreement.ContactName,
            agreement.ContactPhone,
            agreement.ContactEmail,
            agreement.ContactAddress,
            agreement.DriverLicenseNumber,
            agreement.DriverLicenseExpiry,
            agreement.EmergencyContactName,
            agreement.EmergencyContactPhone,
            agreement.TermsConfirmed,
            agreement.SignatureName,
            agreement.VehiclePlate,
            agreement.VehicleMake,
            agreement.VehicleModel,
            agreement.VehicleColor,
            agreement.VehicleYear,
            agreement.VehicleMileage,
            agreement.VehicleFuelLevel,
            agreement.AgreedVehicleValue,
            agreement.VehicleWofExpiry,
            agreement.VehicleRegoExpiry,
            attachments,
            events,
            string.IsNullOrWhiteSpace(agreement.PdfFilePath) ? null : $"/api/courtesy-cars/drafts/{agreement.Id}/pdf",
            agreement.PdfGeneratedAt,
            agreement.EmailSentAt,
            agreement.EmailTo,
            agreement.EmailMessageId,
            agreement.SubmittedAt,
            agreement.ClosedAt,
            agreement.CancelledAt,
            agreement.CreatedAt,
            agreement.UpdatedAt);
    }

    private static CourtesyCarVehicleDto MapVehicleDto(CourtesyCarVehicle vehicle) =>
        new(
            vehicle.Id,
            vehicle.Plate,
            vehicle.Make,
            vehicle.Model,
            vehicle.Color,
            vehicle.Year,
            vehicle.Mileage,
            vehicle.FuelLevel,
            vehicle.AgreedVehicleValue,
            vehicle.Status,
            vehicle.Note,
            vehicle.WofExpiry,
            vehicle.RegoExpiry,
            vehicle.ReturnedAt,
            vehicle.CreatedAt,
            vehicle.UpdatedAt);

    private static CourtesyCarAgreementListItemDto MapListItemDto(CourtesyCarAgreement agreement) =>
        new(
            agreement.Id,
            agreement.JobId,
            agreement.JobVehiclePlate,
            agreement.JobCustomerName,
            agreement.JobCustomerPhone,
            agreement.JobCustomerEmail,
            agreement.JobCustomerAddress,
            agreement.VehicleId,
            agreement.VehiclePlate,
            agreement.VehicleMake,
            agreement.VehicleModel,
            NormalizeStoredStatus(agreement.Status) ?? agreement.Status,
            agreement.CurrentStep,
            agreement.SubmittedAt,
            agreement.ClosedAt,
            agreement.CancelledAt,
            agreement.EmailSentAt,
            agreement.CreatedAt,
            agreement.UpdatedAt);

    private static CourtesyCarAgreementAttachmentDto MapAttachmentDto(long agreementId, CourtesyCarAgreementAttachment attachment) =>
        new(
            attachment.Id,
            attachment.Kind,
            attachment.Name,
            attachment.MimeType,
            attachment.Size,
            $"/api/courtesy-cars/drafts/{agreementId}/attachments/{attachment.Id}",
            attachment.CreatedAt);

    private async Task<CourtesyCarAgreementPrintModel> BuildPrintModelAsync(
        CourtesyCarAgreement agreement,
        CourtesyCarAgreementDetailDto detail,
        CancellationToken ct)
    {
        var attachments = new List<CourtesyCarAgreementPrintAttachment>();
        foreach (var attachment in LoadAttachments(agreement))
        {
            var bytes = await _storage.ReadBytesAsync(attachment, ct);
            attachments.Add(new CourtesyCarAgreementPrintAttachment(
                attachment.Kind,
                attachment.Name,
                attachment.MimeType,
                bytes));
        }

        return new CourtesyCarAgreementPrintModel(
            agreement.Id,
            agreement.JobId,
            detail.JobVehiclePlate,
            detail.JobCustomerName,
            detail.JobCustomerPhone,
            detail.JobCustomerEmail,
            detail.JobCustomerAddress,
            detail.Status,
            detail.CurrentStep,
            detail.ContactName,
            detail.ContactPhone,
            detail.ContactEmail,
            detail.ContactAddress,
            detail.DriverLicenseNumber,
            detail.DriverLicenseExpiry,
            detail.EmergencyContactName,
            detail.EmergencyContactPhone,
            detail.TermsConfirmed,
            detail.SignatureName,
            detail.VehiclePlate,
            detail.VehicleMake,
            detail.VehicleModel,
            detail.VehicleColor,
            detail.VehicleYear,
            detail.VehicleMileage,
            detail.VehicleFuelLevel,
            detail.AgreedVehicleValue,
            detail.VehicleWofExpiry,
            detail.VehicleRegoExpiry,
            attachments,
            detail.CreatedAt,
            detail.UpdatedAt,
            detail.SubmittedAt,
            detail.ClosedAt,
            detail.CancelledAt);
    }

    private static string BuildEmailBody(CourtesyCarAgreementDetailDto detail)
    {
        return $"""
Courtesy car agreement for {detail.JobVehiclePlate ?? "job"}

Customer: {detail.ContactName ?? detail.JobCustomerName ?? ""}
Courtesy car: {detail.VehiclePlate ?? ""}
Status: {detail.Status}

The attached PDF contains the completed agreement.
""";
    }

    private static List<CourtesyCarAgreementAttachment> LoadAttachments(CourtesyCarAgreement agreement)
    {
        if (string.IsNullOrWhiteSpace(agreement.AttachmentsJson))
            return [];

        try
        {
            return JsonSerializer.Deserialize<List<CourtesyCarAgreementAttachment>>(agreement.AttachmentsJson, JsonOptions) ?? [];
        }
        catch
        {
            return [];
        }
    }

    private static void AddEvent(
        CourtesyCarAgreement agreement,
        string eventType,
        string actorType,
        string? actorName,
        object? payload,
        DateTime createdAt)
    {
        agreement.Events ??= new List<CourtesyCarAgreementEvent>();
        agreement.Events.Add(new CourtesyCarAgreementEvent
        {
            CourtesyCarAgreement = agreement,
            EventType = eventType,
            ActorType = actorType,
            ActorName = actorName,
            PayloadJson = payload is null ? null : JsonSerializer.Serialize(payload, JsonOptions),
            CreatedAt = createdAt,
        });
    }

    private static string? ValidateForSubmit(CourtesyCarAgreement agreement)
    {
        if (string.IsNullOrWhiteSpace(agreement.ContactName))
            return "Contact name is required.";
        if (string.IsNullOrWhiteSpace(agreement.ContactPhone))
            return "Contact phone is required.";
        if (string.IsNullOrWhiteSpace(agreement.ContactEmail) && string.IsNullOrWhiteSpace(agreement.JobCustomerEmail))
            return "Contact email is required.";
        if (string.IsNullOrWhiteSpace(agreement.ContactAddress))
            return "Contact address is required.";
        if (string.IsNullOrWhiteSpace(agreement.EmergencyContactName))
            return "Emergency contact name is required.";
        if (string.IsNullOrWhiteSpace(agreement.EmergencyContactPhone))
            return "Emergency contact phone is required.";
        if (!agreement.TermsConfirmed)
            return "Terms must be confirmed.";

        var attachments = LoadAttachments(agreement);
        if (!attachments.Any(x => string.Equals(x.Kind, "license_front", StringComparison.OrdinalIgnoreCase)))
            return "Driver license front photo is required.";
        if (!attachments.Any(x => string.Equals(x.Kind, "license_back", StringComparison.OrdinalIgnoreCase)))
            return "Driver license back photo is required.";
        if (!attachments.Any(x => string.Equals(x.Kind, "signature", StringComparison.OrdinalIgnoreCase)))
            return "Signature image is required.";

        return null;
    }

    private static string? NormalizeBlank(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }

    private static string? FirstNonBlank(params string?[] values)
    {
        foreach (var value in values)
        {
            var normalized = NormalizeBlank(value);
            if (normalized is not null)
                return normalized;
        }

        return null;
    }

    private static string? NormalizeStatus(string? status)
    {
        return NormalizeStoredStatus(status) switch
        {
            "draft" => "draft",
            "inprogress" => "inprogress",
            "active" => "active",
            "submitted" => "submitted",
            "closed" => "closed",
            "cancelled" => "cancelled",
            _ => null,
        };
    }

    private static string? NormalizeStoredStatus(string? status)
    {
        var trimmed = status?.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
            return null;

        return trimmed.ToLowerInvariant() switch
        {
            "draft" => "draft",
            "in_progress" => "inprogress",
            "inprogress" => "inprogress",
            "active" => "active",
            "submitted" => "submitted",
            "closed" => "closed",
            "cancelled" => "cancelled",
            _ => trimmed.ToLowerInvariant(),
        };
    }

    private static string? NormalizeStep(string? step)
    {
        var trimmed = step?.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
            return null;

        return trimmed.ToLowerInvariant() switch
        {
            "contact" => "contact",
            "vehicle" => "vehicle",
            "license" => "license",
            "terms" => "terms",
            "signature" => "signature",
            "review" => "review",
            "submitted" => "submitted",
            "closed" => "closed",
            _ => null,
        };
    }

    private async Task<CourtesyCarAgreementMutationResult<bool>> GenerateAndSendAgreementEmailAsync(
        CourtesyCarAgreement agreement,
        CourtesyCarAgreementDetailDto detail,
        CancellationToken ct)
    {


        var now = DateTime.UtcNow;
        byte[]? pdfBytes = null;
        string? pdfPath = null;

        if (!string.IsNullOrWhiteSpace(agreement.PdfFilePath) && File.Exists(agreement.PdfFilePath))
        {
            pdfPath = agreement.PdfFilePath;
            pdfBytes = await File.ReadAllBytesAsync(agreement.PdfFilePath, ct);
        }
        else
        {
            var printModel = await BuildPrintModelAsync(agreement, detail, ct);
            pdfBytes = new CourtesyCarAgreementDocument(printModel).GeneratePdf();
            pdfPath = await _storage.SavePdfAsync(agreement.Id, pdfBytes, $"courtesy-car-agreement-{agreement.Id}.pdf", ct);
            agreement.PdfFilePath = pdfPath;
            agreement.PdfGeneratedAt = now;
            AddEvent(agreement, "pdf.generated", "system", "system", new { agreement.PdfFilePath }, now);
        }

        agreement.PdfGeneratedAt ??= now;

        var recipient = FirstNonBlank(agreement.ContactEmail, agreement.JobCustomerEmail);
        if (string.IsNullOrWhiteSpace(recipient))
        {
            agreement.Status = "active";
            agreement.CurrentStep = "review";
            agreement.UpdatedAt = now;
            AddEvent(agreement, "email.failed", "system", "system", new
            {
                status = agreement.Status,
                error = "Customer email is required to send the PDF.",
            }, now);
            await _db.SaveChangesAsync(ct);
            return CourtesyCarAgreementMutationResult<bool>.Fail(400, "Customer email is required to send the PDF.");
        }

        var gmailAccount = await _gmailAccountService.GetEffectiveAccountAsync(ct);
        if (gmailAccount is null)
        {
            agreement.Status = "active";
            agreement.CurrentStep = "review";
            agreement.UpdatedAt = now;
            AddEvent(agreement, "email.failed", "system", "system", new
            {
                status = agreement.Status,
                error = "No Gmail account is configured for sending the PDF.",
            }, now);
            await _db.SaveChangesAsync(ct);
            return CourtesyCarAgreementMutationResult<bool>.Fail(500, "No Gmail account is configured for sending the PDF.");
        }

        var sendResult = await _gmailMessageSenderService.SendAsync(
            new GmailMessageSendRequest(
                recipient.Trim(),
                $"Courtesy car agreement - {agreement.VehiclePlate ?? agreement.JobVehiclePlate ?? agreement.Id.ToString(CultureInfo.InvariantCulture)}",
                BuildEmailBody(detail),
                null,
                null,
                null,
                null,
                gmailAccount.Id,
                false,
                null,
                true,
                [new GmailMessageAttachment(Path.GetFileName(pdfPath ?? $"courtesy-car-agreement-{agreement.Id}.pdf"), "application/pdf", pdfBytes ?? [])]),
            ct);

        if (!sendResult.Ok)
        {
            agreement.Status = "active";
            agreement.CurrentStep = "review";
            agreement.UpdatedAt = DateTime.UtcNow;
            AddEvent(agreement, "email.failed", "system", gmailAccount.Email, new
            {
                sendResult.StatusCode,
                sendResult.Error,
                status = agreement.Status,
            }, agreement.UpdatedAt);
            await _db.SaveChangesAsync(ct);
            return CourtesyCarAgreementMutationResult<bool>.Fail(sendResult.StatusCode, sendResult.Error ?? "Failed to send agreement email.");
        }

        agreement.EmailSentAt = sendResult.SentAtUtc;
        agreement.EmailTo = recipient.Trim();
        agreement.EmailMessageId = sendResult.MessageId;
        agreement.Status = "submitted";
        agreement.SubmittedAt ??= sendResult.SentAtUtc;
        agreement.CurrentStep = "review";
        agreement.UpdatedAt = sendResult.SentAtUtc ?? DateTime.UtcNow;
        AddEvent(agreement, "email.sent", "system", sendResult.GmailAccountEmail, new
        {
            sendResult.MessageId,
            sendResult.ThreadId,
            recipient = agreement.EmailTo,
            status = agreement.Status,
        }, agreement.UpdatedAt);

        return CourtesyCarAgreementMutationResult<bool>.Ok(true);
    }
}

public sealed record CourtesyCarAgreementMutationResult<T>(bool Success, int StatusCode, string? Error, T? Data)
{
    public static CourtesyCarAgreementMutationResult<T> Ok(T data) => new(true, 200, null, data);
    public static CourtesyCarAgreementMutationResult<T> Fail(int statusCode, string error) => new(false, statusCode, error, default);
}

public sealed record CourtesyCarAgreementDownloadResult(byte[] Bytes, string MimeType, string FileName);
