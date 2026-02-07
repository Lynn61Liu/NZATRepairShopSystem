using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Models;

namespace Workshop.Api.Services;

public class PartsServicesService
{
    private readonly AppDbContext _db;

    public PartsServicesService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<WofServiceResult> GetServices(long jobId, CancellationToken ct)
    {
        var jobExists = await _db.Jobs.AsNoTracking().AnyAsync(x => x.Id == jobId, ct);
        if (!jobExists)
            return WofServiceResult.NotFound("Job not found.");

        var services = await _db.JobPartsServices.AsNoTracking()
            .Where(x => x.JobId == jobId)
            .OrderByDescending(x => x.UpdatedAt)
            .ThenByDescending(x => x.Id)
            .ToListAsync(ct);

        var serviceIds = services.Select(x => x.Id).ToList();
        var notes = serviceIds.Count == 0
            ? new List<JobPartsNote>()
            : await _db.JobPartsNotes.AsNoTracking()
                .Where(x => serviceIds.Contains(x.PartsServiceId))
                .OrderBy(x => x.CreatedAt)
                .ThenBy(x => x.Id)
                .ToListAsync(ct);

        var notesByService = notes.GroupBy(x => x.PartsServiceId)
            .ToDictionary(g => g.Key, g => g.ToList());

        var payload = services.Select(x => new
            {
                id = x.Id.ToString(CultureInfo.InvariantCulture),
                jobId = jobId.ToString(CultureInfo.InvariantCulture),
                description = x.Description,
                status = ToStatusValue(x.Status),
                createdAt = FormatDateTime(x.CreatedAt),
                updatedAt = FormatDateTime(x.UpdatedAt),
                notes = notesByService.TryGetValue(x.Id, out var list)
                    ? list.Select(n => new
                        {
                            id = n.Id.ToString(CultureInfo.InvariantCulture),
                            partsServiceId = x.Id.ToString(CultureInfo.InvariantCulture),
                            note = n.Note,
                            createdAt = FormatDateTime(n.CreatedAt),
                            updatedAt = FormatDateTime(n.UpdatedAt)
                        })
                        .Cast<object>()
                        .ToList()
                    : new List<object>()
            })
            .ToList();

        return WofServiceResult.Ok(payload);
    }

    public async Task<WofServiceResult> CreateService(long jobId, CreatePartsServiceRequest request, CancellationToken ct)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.Description))
            return WofServiceResult.BadRequest("Description is required.");

        var jobExists = await _db.Jobs.AsNoTracking().AnyAsync(x => x.Id == jobId, ct);
        if (!jobExists)
            return WofServiceResult.NotFound("Job not found.");

        var status = ParseStatus(request.Status) ?? PartsServiceStatus.PendingOrder;
        var now = DateTime.UtcNow;

        var service = new JobPartsService
        {
            JobId = jobId,
            Description = request.Description.Trim(),
            Status = status,
            CreatedAt = now,
            UpdatedAt = now
        };

        _db.JobPartsServices.Add(service);
        await _db.SaveChangesAsync(ct);

        return WofServiceResult.Ok(new
        {
            id = service.Id.ToString(CultureInfo.InvariantCulture),
            status = ToStatusValue(service.Status)
        });
    }

    public async Task<WofServiceResult> UpdateService(long jobId, long serviceId, UpdatePartsServiceRequest request, CancellationToken ct)
    {
        if (request is null)
            return WofServiceResult.BadRequest("Missing payload.");

        var service = await _db.JobPartsServices
            .FirstOrDefaultAsync(x => x.Id == serviceId && x.JobId == jobId, ct);
        if (service is null)
            return WofServiceResult.NotFound("Parts service not found.");

        if (string.IsNullOrWhiteSpace(request.Description) && string.IsNullOrWhiteSpace(request.Status))
            return WofServiceResult.BadRequest("Description or status is required.");

        if (!string.IsNullOrWhiteSpace(request.Description))
            service.Description = request.Description.Trim();

        if (!string.IsNullOrWhiteSpace(request.Status))
        {
            var status = ParseStatus(request.Status);
            if (status is null)
                return WofServiceResult.BadRequest("Invalid status.");
            service.Status = status.Value;
        }

        service.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return WofServiceResult.Ok(new { success = true });
    }

    public async Task<WofServiceResult> DeleteService(long jobId, long serviceId, CancellationToken ct)
    {
        var deleted = await _db.JobPartsServices
            .Where(x => x.Id == serviceId && x.JobId == jobId)
            .ExecuteDeleteAsync(ct);

        if (deleted == 0)
            return WofServiceResult.NotFound("Parts service not found.");

        return WofServiceResult.Ok(new { success = true });
    }

    public async Task<WofServiceResult> CreateNote(long jobId, long serviceId, NoteRequest request, CancellationToken ct)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.Note))
            return WofServiceResult.BadRequest("Note is required.");

        var serviceExists = await _db.JobPartsServices.AsNoTracking()
            .AnyAsync(x => x.Id == serviceId && x.JobId == jobId, ct);
        if (!serviceExists)
            return WofServiceResult.NotFound("Parts service not found.");

        var now = DateTime.UtcNow;
        var note = new JobPartsNote
        {
            PartsServiceId = serviceId,
            Note = request.Note.Trim(),
            CreatedAt = now,
            UpdatedAt = now
        };
        _db.JobPartsNotes.Add(note);
        await _db.SaveChangesAsync(ct);

        return WofServiceResult.Ok(new { id = note.Id.ToString(CultureInfo.InvariantCulture) });
    }

    public async Task<WofServiceResult> UpdateNote(long jobId, long noteId, NoteRequest request, CancellationToken ct)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.Note))
            return WofServiceResult.BadRequest("Note is required.");

        var note = await _db.JobPartsNotes.FirstOrDefaultAsync(x => x.Id == noteId, ct);
        if (note is null)
            return WofServiceResult.NotFound("Note not found.");

        var serviceExists = await _db.JobPartsServices.AsNoTracking()
            .AnyAsync(x => x.Id == note.PartsServiceId && x.JobId == jobId, ct);
        if (!serviceExists)
            return WofServiceResult.NotFound("Parts service not found.");

        note.Note = request.Note.Trim();
        note.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return WofServiceResult.Ok(new { success = true });
    }

    public async Task<WofServiceResult> DeleteNote(long jobId, long noteId, CancellationToken ct)
    {
        var note = await _db.JobPartsNotes.AsNoTracking().FirstOrDefaultAsync(x => x.Id == noteId, ct);
        if (note is null)
            return WofServiceResult.NotFound("Note not found.");

        var serviceExists = await _db.JobPartsServices.AsNoTracking()
            .AnyAsync(x => x.Id == note.PartsServiceId && x.JobId == jobId, ct);
        if (!serviceExists)
            return WofServiceResult.NotFound("Parts service not found.");

        var deleted = await _db.JobPartsNotes
            .Where(x => x.Id == noteId)
            .ExecuteDeleteAsync(ct);

        if (deleted == 0)
            return WofServiceResult.NotFound("Note not found.");

        return WofServiceResult.Ok(new { success = true });
    }

    public async Task<WofServiceResult> GetPartFlow(CancellationToken ct)
    {
        var services = await _db.JobPartsServices.AsNoTracking()
            .OrderByDescending(x => x.UpdatedAt)
            .ThenByDescending(x => x.Id)
            .ToListAsync(ct);

        if (services.Count == 0)
            return WofServiceResult.Ok(new List<object>());

        var serviceIds = services.Select(x => x.Id).ToList();
        var notes = await _db.JobPartsNotes.AsNoTracking()
            .Where(x => serviceIds.Contains(x.PartsServiceId))
            .OrderBy(x => x.CreatedAt)
            .ThenBy(x => x.Id)
            .ToListAsync(ct);

        var notesByService = notes
            .GroupBy(x => x.PartsServiceId)
            .ToDictionary(g => g.Key, g => g.ToList());

        var jobIds = services.Select(x => x.JobId).Distinct().ToList();
        var jobInfo = await (
            from j in _db.Jobs.AsNoTracking()
            join v in _db.Vehicles.AsNoTracking() on j.VehicleId equals v.Id into vj
            from v in vj.DefaultIfEmpty()
            join c in _db.Customers.AsNoTracking() on j.CustomerId equals c.Id into cj
            from c in cj.DefaultIfEmpty()
            where jobIds.Contains(j.Id)
            select new { j.Id, Vehicle = v, Customer = c }
        ).ToListAsync(ct);

        var jobMap = jobInfo.ToDictionary(x => x.Id, x => x);

        var payload = services.Select(service =>
        {
            jobMap.TryGetValue(service.JobId, out var info);
            var vehicle = info?.Vehicle;
            var customer = info?.Customer;

            var parts = ParseParts(service.Description);
            var notesPayload = notesByService.TryGetValue(service.Id, out var list)
                ? list.Select(n => new
                    {
                        id = n.Id.ToString(CultureInfo.InvariantCulture),
                        text = n.Note,
                        timestamp = FormatDateTime(n.CreatedAt)
                    })
                    .Cast<object>()
                    .ToList()
                : new List<object>();

            return new
            {
                id = service.Id.ToString(CultureInfo.InvariantCulture),
                jobId = service.JobId.ToString(CultureInfo.InvariantCulture),
                carInfo = BuildCarInfo(vehicle),
                parts,
                status = ToStatusValue(service.Status),
                notes = notesPayload,
                createdAt = FormatDateTime(service.CreatedAt),
                details = new
                {
                    owner = customer?.Name ?? "",
                    phone = customer?.Phone ?? "",
                    vin = vehicle?.Vin ?? "",
                    mileage = vehicle?.Odometer?.ToString(CultureInfo.InvariantCulture) ?? "",
                    issue = service.Description ?? ""
                }
            };
        }).ToList();

        return WofServiceResult.Ok(payload);
    }

    private static PartsServiceStatus? ParseStatus(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var v = value.Trim().ToLowerInvariant();
        return v switch
        {
            "pending_order" or "pending" or "quote_pending" or "待下单" => PartsServiceStatus.PendingOrder,
            "needs_pt" or "need_pt" or "pt" or "需要发pt" => PartsServiceStatus.NeedsPt,
            "parts_trader" or "partstrader" => PartsServiceStatus.PartsTrader,
            "pickup_or_transit" or "in_transit" or "transit" or "received" or "repair_done" or "待取/在途" or "待取" => PartsServiceStatus.PickupOrTransit,
            _ => null
        };
    }

    private static string ToStatusValue(PartsServiceStatus status) => status switch
    {
        PartsServiceStatus.NeedsPt => "needs_pt",
        PartsServiceStatus.PartsTrader => "parts_trader",
        PartsServiceStatus.PickupOrTransit => "pickup_or_transit",
        _ => "pending_order"
    };

    private static string FormatDateTime(DateTime dateTime)
        => dateTime.ToString("O", CultureInfo.InvariantCulture);

    private static string BuildCarInfo(Vehicle? vehicle)
    {
        if (vehicle is null)
            return "Unknown";

        var makeModel = string.Join(" ", new[] { vehicle.Make, vehicle.Model }.Where(x => !string.IsNullOrWhiteSpace(x)));
        if (!string.IsNullOrWhiteSpace(vehicle.Plate))
        {
            return string.IsNullOrWhiteSpace(makeModel)
                ? vehicle.Plate
                : $"{makeModel} - {vehicle.Plate}";
        }

        return string.IsNullOrWhiteSpace(makeModel) ? "Unknown" : makeModel;
    }

    private static List<string> ParseParts(string? description)
    {
        if (string.IsNullOrWhiteSpace(description))
            return new List<string>();

        var split = description.Split(new[] { ',', '，', ';', '；', '\n', '\r', '/', '、' }, StringSplitOptions.RemoveEmptyEntries);
        var parts = split
            .Select(x => x.Trim())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .ToList();

        if (parts.Count == 0)
            parts.Add(description.Trim());

        return parts;
    }
}

public record CreatePartsServiceRequest(string Description, string? Status);
public record UpdatePartsServiceRequest(string? Description, string? Status);
public record NoteRequest(string Note);
