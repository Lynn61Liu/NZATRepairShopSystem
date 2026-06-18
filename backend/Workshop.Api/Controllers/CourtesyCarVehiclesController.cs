using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.DTOs;
using Workshop.Api.Models;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/courtesy-cars/vehicles")]
public sealed class CourtesyCarVehiclesController : ControllerBase
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly AppDbContext _db;

    public CourtesyCarVehiclesController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken ct)
    {
        Response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate";
        Response.Headers["Pragma"] = "no-cache";
        Response.Headers["Expires"] = "0";
        var vehicles = await _db.CourtesyCarVehicles.AsNoTracking()
            .OrderBy(x => x.Plate)
            .ToListAsync(ct);
        var agreementSummaries = await LoadCurrentAgreementSummariesAsync(vehicles.Select(x => x.Id).ToArray(), ct);
        var items = vehicles.Select(x => MapVehicle(x, agreementSummaries.GetValueOrDefault(x.Id))).ToList();

        return Ok(new { items });
    }

    [HttpGet("{vehicleId:long}")]
    public async Task<IActionResult> GetById(long vehicleId, CancellationToken ct)
    {
        Response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate";
        Response.Headers["Pragma"] = "no-cache";
        Response.Headers["Expires"] = "0";
        var vehicle = await _db.CourtesyCarVehicles.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == vehicleId, ct);

        if (vehicle is null)
            return NotFound(new { error = "Vehicle not found." });

        var currentAgreement = await LoadCurrentAgreementSummaryAsync(vehicleId, ct);
        return Ok(new { vehicle = MapVehicle(vehicle, currentAgreement) });
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CourtesyCarVehicleUpsertRequest request, CancellationToken ct)
    {
        var normalized = Normalize(request);
        var validationError = Validate(normalized);
        if (validationError is not null)
            return BadRequest(new { error = validationError });

        var plateExists = await _db.CourtesyCarVehicles.AnyAsync(x => x.Plate == normalized.Plate, ct);
        if (plateExists)
            return Conflict(new { error = "Plate already exists." });

        var now = DateTime.UtcNow;
        var vehicle = new CourtesyCarVehicle
        {
            Plate = normalized.Plate,
            Make = normalized.Make,
            Model = normalized.Model,
            Color = normalized.Color,
            Year = normalized.Year,
            Mileage = normalized.Mileage,
            FuelLevel = normalized.FuelLevel,
            AgreedVehicleValue = normalized.AgreedVehicleValue,
            Status = normalized.Status,
            Note = normalized.Note,
            WofExpiry = normalized.WofExpiry,
            RegoExpiry = normalized.RegoExpiry,
            LoanedAt = normalized.Status == "on_loan" ? normalized.LoanedAt ?? now : null,
            BorrowerName = normalized.Status == "on_loan" ? normalized.BorrowerName : null,
            BorrowerPhone = normalized.Status == "on_loan" ? normalized.BorrowerPhone : null,
            AttachmentsJson = SerializeAttachments(normalized.Attachments ?? []),
            ReturnedAt = null,
            CreatedAt = now,
            UpdatedAt = now,
        };

        if (normalized.Status != "on_loan")
        {
            vehicle.LoanedAt = null;
            vehicle.BorrowerName = null;
            vehicle.BorrowerPhone = null;
        }

        _db.CourtesyCarVehicles.Add(vehicle);
        await _db.SaveChangesAsync(ct);

        var currentAgreement = await LoadCurrentAgreementSummaryAsync(vehicle.Id, ct);
        return Ok(new { vehicle = MapVehicle(vehicle, currentAgreement) });
    }

    [HttpPut("{vehicleId:long}")]
    public async Task<IActionResult> Update(long vehicleId, [FromBody] CourtesyCarVehicleUpsertRequest request, CancellationToken ct)
    {
        var vehicle = await _db.CourtesyCarVehicles.FirstOrDefaultAsync(x => x.Id == vehicleId, ct);
        if (vehicle is null)
            return NotFound(new { error = "Vehicle not found." });

        var normalized = Normalize(request);
        var validationError = Validate(normalized);
        if (validationError is not null)
            return BadRequest(new { error = validationError });

        var plateExists = await _db.CourtesyCarVehicles.AnyAsync(x => x.Id != vehicleId && x.Plate == normalized.Plate, ct);
        if (plateExists)
            return Conflict(new { error = "Plate already exists." });

        var now = DateTime.UtcNow;
        var wasOnLoan = string.Equals(vehicle.Status, "on_loan", StringComparison.OrdinalIgnoreCase);
        var nextStatus = normalized.Status;

        vehicle.Plate = normalized.Plate;
        vehicle.Make = normalized.Make;
        vehicle.Model = normalized.Model;
        vehicle.Color = normalized.Color;
        vehicle.Year = normalized.Year;
        vehicle.Mileage = normalized.Mileage;
        vehicle.FuelLevel = normalized.FuelLevel;
        vehicle.AgreedVehicleValue = normalized.AgreedVehicleValue;
        vehicle.Status = nextStatus;
        vehicle.Note = normalized.Note;
        vehicle.WofExpiry = normalized.WofExpiry;
        vehicle.RegoExpiry = normalized.RegoExpiry;
        vehicle.AttachmentsJson = SerializeAttachments(normalized.Attachments ?? DeserializeAttachments(vehicle.AttachmentsJson));

        if (string.Equals(nextStatus, "on_loan", StringComparison.OrdinalIgnoreCase))
        {
            vehicle.LoanedAt = normalized.LoanedAt ?? vehicle.LoanedAt ?? now;
            vehicle.BorrowerName = NormalizeBlank(normalized.BorrowerName) ?? vehicle.BorrowerName;
            vehicle.BorrowerPhone = NormalizeBlank(normalized.BorrowerPhone) ?? vehicle.BorrowerPhone;
            vehicle.ReturnedAt = null;
        }
        else
        {
            vehicle.LoanedAt = null;
            vehicle.BorrowerName = null;
            vehicle.BorrowerPhone = null;
            if (wasOnLoan && string.Equals(nextStatus, "available", StringComparison.OrdinalIgnoreCase))
            {
                vehicle.ReturnedAt ??= now;
            }
        }

        if (string.Equals(nextStatus, "unavailable", StringComparison.OrdinalIgnoreCase) && string.IsNullOrWhiteSpace(vehicle.Note))
            return BadRequest(new { error = "Unavailable vehicles require a note." });

        vehicle.UpdatedAt = now;
        await _db.SaveChangesAsync(ct);

        var currentAgreement = await LoadCurrentAgreementSummaryAsync(vehicle.Id, ct);
        return Ok(new { vehicle = MapVehicle(vehicle, currentAgreement) });
    }

    [HttpPost("{vehicleId:long}/return")]
    public async Task<IActionResult> ReturnVehicle(long vehicleId, CancellationToken ct)
    {
        var vehicle = await _db.CourtesyCarVehicles.FirstOrDefaultAsync(x => x.Id == vehicleId, ct);
        if (vehicle is null)
            return NotFound(new { error = "Vehicle not found." });

        var now = DateTime.UtcNow;
        vehicle.Status = "available";
        vehicle.ReturnedAt = now;
        vehicle.LoanedAt = null;
        vehicle.BorrowerName = null;
        vehicle.BorrowerPhone = null;
        vehicle.UpdatedAt = now;

        await _db.SaveChangesAsync(ct);
        var currentAgreement = await LoadCurrentAgreementSummaryAsync(vehicle.Id, ct);
        return Ok(new { vehicle = MapVehicle(vehicle, currentAgreement) });
    }

    [HttpDelete("{vehicleId:long}")]
    public async Task<IActionResult> Delete(long vehicleId, CancellationToken ct)
    {
        var vehicle = await _db.CourtesyCarVehicles.FirstOrDefaultAsync(x => x.Id == vehicleId, ct);
        if (vehicle is null)
            return NotFound(new { error = "Vehicle not found." });

        var hasAgreements = await _db.CourtesyCarAgreements.AnyAsync(x => x.VehicleId == vehicleId, ct);
        if (hasAgreements)
            return Conflict(new { error = "Vehicle is linked to a courtesy car agreement." });

        _db.CourtesyCarVehicles.Remove(vehicle);
        await _db.SaveChangesAsync(ct);

        return Ok(new { deleted = true });
    }

    private static CourtesyCarVehicleRecordDto MapVehicle(CourtesyCarVehicle vehicle, CourtesyCarVehicleAgreementSummaryDto? currentAgreement) =>
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
            vehicle.LoanedAt,
            vehicle.BorrowerName,
            vehicle.BorrowerPhone,
            currentAgreement,
            vehicle.ReturnedAt,
            DeserializeAttachments(vehicle.AttachmentsJson),
            vehicle.CreatedAt,
            vehicle.UpdatedAt);

    private async Task<Dictionary<long, CourtesyCarVehicleAgreementSummaryDto>> LoadCurrentAgreementSummariesAsync(
        IReadOnlyCollection<long> vehicleIds,
        CancellationToken ct)
    {
        if (vehicleIds.Count == 0)
            return new Dictionary<long, CourtesyCarVehicleAgreementSummaryDto>();

        var summaries = await _db.CourtesyCarAgreements.AsNoTracking()
            .Where(x => vehicleIds.Contains(x.VehicleId))
            .Where(x => x.Status != "cancelled" && x.Status != "closed")
            .OrderByDescending(x => x.UpdatedAt)
            .ThenByDescending(x => x.Id)
            .Select(x => new
            {
                x.VehicleId,
                Summary = new CourtesyCarVehicleAgreementSummaryDto(
                    x.Id,
                    x.JobId,
                    x.Status,
                    x.CurrentStep,
                    x.JobVehiclePlate,
                    x.JobCustomerName,
                    x.JobCustomerPhone,
                    x.ContactName,
                    x.ContactPhone),
            })
            .ToListAsync(ct);

        return summaries
            .GroupBy(x => x.VehicleId)
            .ToDictionary(x => x.Key, x => x.First().Summary);
    }

    private async Task<CourtesyCarVehicleAgreementSummaryDto?> LoadCurrentAgreementSummaryAsync(long vehicleId, CancellationToken ct)
    {
        var summaries = await LoadCurrentAgreementSummariesAsync([vehicleId], ct);
        return summaries.GetValueOrDefault(vehicleId);
    }

    private static string? Validate(CourtesyCarVehicleUpsertRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Plate))
            return "Plate is required.";
        if (request.AgreedVehicleValue <= 0)
            return "Agreed vehicle value is required.";
        if (!IsAllowedStatus(request.Status))
            return "Invalid vehicle status.";
        if (string.Equals(request.Status, "unavailable", StringComparison.OrdinalIgnoreCase) && string.IsNullOrWhiteSpace(request.Note))
            return "Unavailable vehicles require a note.";
        return null;
    }

    private static bool IsAllowedStatus(string status)
        => string.Equals(status, "available", StringComparison.OrdinalIgnoreCase)
        || string.Equals(status, "on_loan", StringComparison.OrdinalIgnoreCase)
        || string.Equals(status, "unavailable", StringComparison.OrdinalIgnoreCase);

    private static string NormalizePlate(string plate)
        => new(plate.Trim().ToUpperInvariant().Where(char.IsLetterOrDigit).ToArray());

    private static string? NormalizeBlank(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static CourtesyCarVehicleUpsertRequest Normalize(CourtesyCarVehicleUpsertRequest request)
        => request with
        {
            Plate = NormalizePlate(request.Plate),
            Make = NormalizeBlank(request.Make),
            Model = NormalizeBlank(request.Model),
            Color = NormalizeBlank(request.Color),
            FuelLevel = NormalizeBlank(request.FuelLevel),
            Note = NormalizeBlank(request.Note),
            BorrowerName = NormalizeBlank(request.BorrowerName),
            BorrowerPhone = NormalizeBlank(request.BorrowerPhone),
        };

    private static List<CourtesyCarAttachmentDto> DeserializeAttachments(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return [];

        try
        {
            return JsonSerializer.Deserialize<List<CourtesyCarAttachmentDto>>(json, JsonOptions) ?? [];
        }
        catch
        {
            return [];
        }
    }

    private static string SerializeAttachments(IReadOnlyList<CourtesyCarAttachmentDto> attachments)
        => JsonSerializer.Serialize(attachments, JsonOptions);
}
