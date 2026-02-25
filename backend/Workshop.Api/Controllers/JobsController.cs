using System.Globalization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Models;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/jobs")]
public class JobsController : ControllerBase
{
    private readonly AppDbContext _db;

    public JobsController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken ct)
    {
        var rows = await (
                from j in _db.Jobs.AsNoTracking()
                join v in _db.Vehicles.AsNoTracking() on j.VehicleId equals v.Id
                join c in _db.Customers.AsNoTracking() on j.CustomerId equals c.Id
                orderby j.CreatedAt descending
                select new
                {
                    j.Id,
                    j.Status,
                    j.IsUrgent,
                    j.CreatedAt,
                    Vehicle = v,
                    Customer = c
                }
            )
            .ToListAsync(ct);

        var items = rows.Select(r => new
        {
            id = r.Id.ToString(CultureInfo.InvariantCulture),
            vehicleStatus = MapStatus(r.Status),
            urgent = r.IsUrgent,
            selectedTags = r.IsUrgent ? new[] { "Urgent" } : Array.Empty<string>(),
            plate = r.Vehicle.Plate,
            vehicleModel = BuildVehicleModel(r.Vehicle.Make, r.Vehicle.Model, r.Vehicle.Year),
            wofPct = (int?)null,
            mechPct = (int?)null,
            paintPct = (int?)null,
            customerName = r.Customer.Name,
            customerCode = r.Customer.BusinessCode,
            customerPhone = r.Customer.Phone ?? "",
            createdAt = r.CreatedAt.ToString("yyyy/MM/dd HH:mm", CultureInfo.InvariantCulture)
        });

        return Ok(items);
    }

    [HttpGet("tags")]
    public async Task<IActionResult> GetTags([FromQuery] string? ids, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(ids))
            return Ok(Array.Empty<object>());

        var jobIds = ids.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(id => long.TryParse(id, out var parsed) ? parsed : (long?)null)
            .Where(id => id.HasValue)
            .Select(id => id!.Value)
            .Distinct()
            .ToArray();

        if (jobIds.Length == 0)
            return Ok(Array.Empty<object>());

        var rows = await (
                from jt in _db.JobTags.AsNoTracking()
                join t in _db.Tags.AsNoTracking() on jt.TagId equals t.Id
                where jobIds.Contains(jt.JobId) && t.IsActive
                select new { jt.JobId, t.Name }
            )
            .ToListAsync(ct);

        var grouped = rows
            .GroupBy(x => x.JobId)
            .Select(g => new
            {
                jobId = g.Key.ToString(CultureInfo.InvariantCulture),
                tags = g.Select(x => x.Name).Distinct().ToArray()
            })
            .ToList();

        return Ok(grouped);
    }

    [HttpGet("{id:long}")]
    public async Task<IActionResult> GetById(long id, CancellationToken ct)
    {
        var row = await (
                from j in _db.Jobs.AsNoTracking()
                join v in _db.Vehicles.AsNoTracking() on j.VehicleId equals v.Id
                join c in _db.Customers.AsNoTracking() on j.CustomerId equals c.Id
                where j.Id == id
                select new
                {
                    Job = j,
                    Vehicle = v,
                    Customer = c
                }
            )
            .FirstOrDefaultAsync(ct);

        if (row is null)
            return NotFound(new { error = "Job not found." });

        var hasWofRecord = await _db.JobWofRecords.AsNoTracking().AnyAsync(x => x.JobId == id, ct);

        var tagNames = await (
                from jt in _db.JobTags.AsNoTracking()
                join t in _db.Tags.AsNoTracking() on jt.TagId equals t.Id
                where jt.JobId == id && t.IsActive
                select t.Name
            )
            .Distinct()
            .ToListAsync(ct);

        var job = new
        {
            id = row.Job.Id.ToString(CultureInfo.InvariantCulture),
            status = MapDetailStatus(row.Job.Status),
            isUrgent = row.Job.IsUrgent,
            tags = tagNames.ToArray(),
            notes = row.Job.Notes,
            createdAt = row.Job.CreatedAt.ToString("yyyy/MM/dd HH:mm", CultureInfo.InvariantCulture),
            vehicle = new
            {
                plate = row.Vehicle.Plate,
                make = row.Vehicle.Make,
                model = row.Vehicle.Model,
                year = row.Vehicle.Year,
                vin = row.Vehicle.Vin,
                engine = row.Vehicle.Engine,
                regoExpiry = FormatDate(row.Vehicle.RegoExpiry),
                colour = row.Vehicle.Colour,
                bodyStyle = row.Vehicle.BodyStyle,
                engineNo = row.Vehicle.EngineNo,
                chassis = row.Vehicle.Chassis,
                ccRating = row.Vehicle.CcRating,
                fuelType = row.Vehicle.FuelType,
                seats = row.Vehicle.Seats,
                countryOfOrigin = row.Vehicle.CountryOfOrigin,
                grossVehicleMass = row.Vehicle.GrossVehicleMass,
                refrigerant = row.Vehicle.Refrigerant,
                fuelTankCapacityLitres = row.Vehicle.FuelTankCapacityLitres,
                fullCombinedRangeKm = row.Vehicle.FullCombinedRangeKm,
                wofExpiry = FormatDate(row.Vehicle.WofExpiry),
                odometer = row.Vehicle.Odometer,
                nzFirstRegistration = FormatDate(row.Vehicle.NzFirstRegistration),
                customerId = row.Vehicle.CustomerId,
                updatedAt = FormatDateTime(row.Vehicle.UpdatedAt),
                // rawJson = row.Vehicle.RawJson
            },
            customer = new
            {
                type = row.Customer.Type,
                name = row.Customer.Name,
                phone = row.Customer.Phone,
                email = row.Customer.Email,
                address = row.Customer.Address,
                businessCode = row.Customer.BusinessCode,
                accountTerms = "",
                discount = "",
                notes = row.Customer.Notes
            }
        };

        return Ok(new { job, hasWofRecord });
    }

    public record CreatePaintServiceRequest(string? Status, int? Panels);
    public record UpdatePaintStageRequest(int? StageIndex);
    public record UpdatePaintPanelsRequest(int? Panels);

    [HttpGet("paint-board")]
    public async Task<IActionResult> GetPaintBoard(CancellationToken ct)
    {
        var rows = await (
                from p in _db.JobPaintServices.AsNoTracking()
                join j in _db.Jobs.AsNoTracking() on p.JobId equals j.Id
                join v in _db.Vehicles.AsNoTracking() on j.VehicleId equals v.Id
                where !EF.Functions.ILike(j.Status, "archived")
                orderby j.CreatedAt descending
                select new
                {
                    j.Id,
                    j.CreatedAt,
                    j.Notes,
                    v.Plate,
                    v.Make,
                    v.Model,
                    v.Year,
                    p.Status,
                    p.CurrentStage,
                    p.Panels,
                    p.UpdatedAt
                }
            )
            .ToListAsync(ct);

        var jobs = rows.Select(r => new
        {
            id = r.Id.ToString(CultureInfo.InvariantCulture),
            createdAt = FormatDateTime(r.CreatedAt),
            plate = r.Plate,
            year = r.Year,
            make = r.Make,
            model = r.Model,
            status = r.Status,
            currentStage = r.CurrentStage,
            panels = r.Panels,
            notes = r.Notes ?? "",
            updatedAt = FormatDateTime(r.UpdatedAt)
        });

        return Ok(new { jobs });
    }

    [HttpGet("{id:long}/paint-service")]
    public async Task<IActionResult> GetPaintService(long id, CancellationToken ct)
    {
        var service = await _db.JobPaintServices.AsNoTracking().FirstOrDefaultAsync(x => x.JobId == id, ct);
        if (service is null)
        {
            return Ok(new { exists = false });
        }

        return Ok(new
        {
            exists = true,
            service = new
            {
                id = service.Id,
                jobId = service.JobId,
                status = service.Status,
                currentStage = service.CurrentStage,
                panels = service.Panels,
                createdAt = service.CreatedAt.ToString("yyyy/MM/dd HH:mm", CultureInfo.InvariantCulture),
                updatedAt = service.UpdatedAt.ToString("yyyy/MM/dd HH:mm", CultureInfo.InvariantCulture),
            }
        });
    }

    [HttpPost("{id:long}/paint-service")]
    public async Task<IActionResult> CreatePaintService(long id, [FromBody] CreatePaintServiceRequest? req, CancellationToken ct)
    {
        var job = await _db.Jobs.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (job is null)
            return NotFound(new { error = "Job not found." });

        var existing = await _db.JobPaintServices.FirstOrDefaultAsync(x => x.JobId == id, ct);
        if (existing is not null)
        {
            var nextStatus = string.IsNullOrWhiteSpace(req?.Status) ? existing.Status : req!.Status!.Trim();
            var nextPanels = req?.Panels is > 0 ? req!.Panels!.Value : existing.Panels;
            var changed = false;

            if (!string.Equals(existing.Status, nextStatus, StringComparison.Ordinal))
            {
                existing.Status = nextStatus;
                if (string.Equals(nextStatus, "not_started", StringComparison.Ordinal))
                {
                    existing.CurrentStage = -1;
                }
                changed = true;
            }

            if (existing.Panels != nextPanels)
            {
                existing.Panels = nextPanels;
                changed = true;
            }

            if (changed)
            {
                existing.UpdatedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync(ct);
            }

            return Ok(new
            {
                id = existing.Id,
                jobId = existing.JobId,
                status = existing.Status,
                currentStage = existing.CurrentStage,
                panels = existing.Panels
            });
        }

        var status = string.IsNullOrWhiteSpace(req?.Status) ? "pending" : req!.Status!.Trim();
        var panels = req?.Panels is > 0 ? req!.Panels!.Value : 1;
        var service = new JobPaintService
        {
            JobId = id,
            Status = status,
            CurrentStage = -1,
            Panels = panels,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _db.JobPaintServices.Add(service);
        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            id = service.Id,
            jobId = service.JobId,
            status = service.Status,
            currentStage = service.CurrentStage,
            panels = service.Panels
        });
    }

    [HttpPut("{id:long}/paint-service/stage")]
    public async Task<IActionResult> UpdatePaintStage(long id, [FromBody] UpdatePaintStageRequest req, CancellationToken ct)
    {
        if (req?.StageIndex is null)
            return BadRequest(new { error = "StageIndex is required." });

        var service = await _db.JobPaintServices.FirstOrDefaultAsync(x => x.JobId == id, ct);
        if (service is null)
            return NotFound(new { error = "Paint service not found." });

        var stageIndex = req.StageIndex.Value;
        var normalized = NormalizePaintStage(stageIndex);
        service.Status = normalized.Status;
        service.CurrentStage = normalized.CurrentStage;
        service.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return Ok(new { success = true, status = service.Status, currentStage = service.CurrentStage });
    }

    [HttpPut("{id:long}/paint-service/panels")]
    public async Task<IActionResult> UpdatePaintPanels(long id, [FromBody] UpdatePaintPanelsRequest req, CancellationToken ct)
    {
        if (req?.Panels is null || req.Panels.Value <= 0)
            return BadRequest(new { error = "Panels is required." });

        var service = await _db.JobPaintServices.FirstOrDefaultAsync(x => x.JobId == id, ct);
        if (service is null)
            return NotFound(new { error = "Paint service not found." });

        service.Panels = req.Panels.Value;
        service.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return Ok(new { success = true, panels = service.Panels });
    }

    [HttpDelete("{id:long}/paint-service")]
    public async Task<IActionResult> DeletePaintService(long id, CancellationToken ct)
    {
        var deleted = await _db.JobPaintServices.Where(x => x.JobId == id).ExecuteDeleteAsync(ct);
        if (deleted == 0)
            return NotFound(new { error = "Paint service not found." });

        return Ok(new { success = true });
    }

    private static (string Status, int CurrentStage) NormalizePaintStage(int stageIndex)
    {
        const int lastStageIndex = 4;
        if (stageIndex <= -1)
            return ("not_started", -1);
        if (stageIndex >= lastStageIndex + 1)
            return ("done", lastStageIndex);
        return ("in_progress", stageIndex);
    }

    public record UpdateVehicleRequest(int? Year, string? Make, string? FuelType, string? Vin, string? NzFirstRegistration);

    [HttpPut("{id:long}/vehicle")]
    public async Task<IActionResult> UpdateVehicle(long id, [FromBody] UpdateVehicleRequest req, CancellationToken ct)
    {
        var job = await _db.Jobs.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (job is null)
            return NotFound(new { error = "Job not found." });

        if (!job.VehicleId.HasValue)
            return NotFound(new { error = "Vehicle not found." });

        var vehicle = await _db.Vehicles.FirstOrDefaultAsync(x => x.Id == job.VehicleId.Value, ct);
        if (vehicle is null)
            return NotFound(new { error = "Vehicle not found." });

        DateOnly? nzFirstRegistration = null;
        if (!string.IsNullOrWhiteSpace(req.NzFirstRegistration))
        {
            if (!DateOnly.TryParse(req.NzFirstRegistration, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed) &&
                !DateOnly.TryParse(req.NzFirstRegistration, CultureInfo.CurrentCulture, DateTimeStyles.None, out parsed))
                return BadRequest(new { error = "Invalid NzFirstRegistration." });
            nzFirstRegistration = parsed;
        }

        vehicle.Year = req.Year;
        vehicle.Make = string.IsNullOrWhiteSpace(req.Make) ? null : req.Make.Trim();
        vehicle.FuelType = string.IsNullOrWhiteSpace(req.FuelType) ? null : req.FuelType.Trim();
        vehicle.Vin = string.IsNullOrWhiteSpace(req.Vin) ? null : req.Vin.Trim();
        vehicle.NzFirstRegistration = nzFirstRegistration;
        vehicle.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            success = true,
            vehicle = new
            {
                plate = vehicle.Plate,
                make = vehicle.Make,
                model = vehicle.Model,
                year = vehicle.Year,
                vin = vehicle.Vin,
                fuelType = vehicle.FuelType,
                nzFirstRegistration = FormatDate(vehicle.NzFirstRegistration),
                updatedAt = FormatDateTime(vehicle.UpdatedAt),
            }
        });
    }

    public record UpdateJobNotesRequest(string? Notes);

    [HttpPut("{id:long}/notes")]
    public async Task<IActionResult> UpdateNotes(long id, [FromBody] UpdateJobNotesRequest req, CancellationToken ct)
    {
        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (job is null)
            return NotFound(new { error = "Job not found." });

        job.Notes = req.Notes?.Trim();
        job.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return Ok(new { success = true, notes = job.Notes });
    }

    [HttpDelete("{id:long}")]
    public async Task<IActionResult> DeleteJob(long id, CancellationToken ct)
    {
        var job = await _db.Jobs.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (job is null)
            return NotFound(new { error = "Job not found." });

        await using var tx = await _db.Database.BeginTransactionAsync(ct);

        await _db.JobWofRecords.Where(x => x.JobId == id).ExecuteDeleteAsync(ct);

        var deletedJobs = await _db.Jobs.Where(x => x.Id == id).ExecuteDeleteAsync(ct);
        if (deletedJobs == 0)
            return NotFound(new { error = "Job not found." });

        var vehicleDeleted = false;
        var customerDeleted = false;

        if (job.VehicleId.HasValue)
        {
            var otherJobs = await _db.Jobs.AsNoTracking()
                .AnyAsync(x => x.VehicleId == job.VehicleId.Value, ct);
            if (!otherJobs)
            {
                var deletedVehicles = await _db.Vehicles
                    .Where(x => x.Id == job.VehicleId.Value)
                    .ExecuteDeleteAsync(ct);
                vehicleDeleted = deletedVehicles > 0;
            }
        }

        if (job.CustomerId.HasValue)
        {
            var otherJobs = await _db.Jobs.AsNoTracking()
                .AnyAsync(x => x.CustomerId == job.CustomerId.Value, ct);
            if (!otherJobs)
            {
                var deletedCustomers = await _db.Customers
                    .Where(x => x.Id == job.CustomerId.Value)
                    .ExecuteDeleteAsync(ct);
                customerDeleted = deletedCustomers > 0;
            }
        }

        await tx.CommitAsync(ct);

        return Ok(new { success = true, vehicleDeleted, customerDeleted });
    }

    public record UpdateJobTagsRequest(long[]? TagIds, string[]? TagNames);

    public record UpdateJobStatusRequest(string? Status);
    public record UpdateJobCreatedAtRequest(string? Date);

    [HttpPut("{id:long}/tags")]
    public async Task<IActionResult> UpdateJobTags(long id, [FromBody] UpdateJobTagsRequest req, CancellationToken ct)
    {
        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (job is null)
            return NotFound(new { error = "Job not found." });

        var tagIds = req?.TagIds?.Distinct().ToArray() ?? Array.Empty<long>();
        var tagNames = req?.TagNames?
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Select(name => name.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray() ?? Array.Empty<string>();

        var tagNamesLower = tagNames.Select(name => name.ToLowerInvariant()).ToArray();

        if (tagNames.Length > 0)
        {
            var existingByName = await _db.Tags.AsNoTracking()
                .Where(x => tagNamesLower.Contains(x.Name.ToLower()))
                .Select(x => x.Name)
                .ToListAsync(ct);
            var existingSet = new HashSet<string>(
                existingByName.Select(name => name.ToLowerInvariant()),
                StringComparer.OrdinalIgnoreCase
            );
            var missingNames = tagNames.Where(name => !existingSet.Contains(name.ToLowerInvariant())).ToArray();
            if (missingNames.Length > 0)
            {
                var now = DateTime.UtcNow;
                var newTags = missingNames.Select(name => new Tag
                {
                    Name = name,
                    IsActive = true,
                    CreatedAt = now,
                    UpdatedAt = now
                });
                _db.Tags.AddRange(newTags);
                await _db.SaveChangesAsync(ct);
            }
        }

        if (tagIds.Length > 0)
        {
            var existingIds = await _db.Tags.AsNoTracking()
                .Where(x => tagIds.Contains(x.Id))
                .Select(x => x.Id)
                .ToListAsync(ct);
            if (existingIds.Count != tagIds.Length)
                return BadRequest(new { error = "One or more tags are invalid." });
        }

        var nameTagIds = Array.Empty<long>();
        if (tagNames.Length > 0)
        {
            nameTagIds = await _db.Tags.AsNoTracking()
                .Where(x => tagNamesLower.Contains(x.Name.ToLower()))
                .Select(x => x.Id)
                .ToArrayAsync(ct);
        }

        var finalTagIds = tagIds.Concat(nameTagIds).Distinct().ToArray();

        await _db.JobTags.Where(x => x.JobId == id).ExecuteDeleteAsync(ct);

        if (finalTagIds.Length > 0)
        {
            var items = finalTagIds.Select(tagId => new JobTag
            {
                JobId = id,
                TagId = tagId,
                CreatedAt = DateTime.UtcNow
            });
            _db.JobTags.AddRange(items);
        }

        var tagNameList = await _db.Tags.AsNoTracking()
            .Where(x => finalTagIds.Contains(x.Id))
            .Select(x => x.Name)
            .ToArrayAsync(ct);

        job.IsUrgent = tagNameList.Any(name => string.Equals(name, "Urgent", StringComparison.OrdinalIgnoreCase));
        job.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);

        return Ok(new { tags = tagNameList });
    }

    [HttpPut("{id:long}/status")]
    public async Task<IActionResult> UpdateStatus(long id, [FromBody] UpdateJobStatusRequest req, CancellationToken ct)
    {
        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (job is null)
            return NotFound(new { error = "Job not found." });

        var status = req?.Status?.Trim();
        if (string.IsNullOrWhiteSpace(status))
            return BadRequest(new { error = "Status is required." });

        if (!string.Equals(status, "Archived", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { error = "Status must be Archived." });

        job.Status = "Archived";
        job.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return Ok(new { status = job.Status });
    }

    [HttpPut("{id:long}/created-at")]
    public async Task<IActionResult> UpdateCreatedAt(long id, [FromBody] UpdateJobCreatedAtRequest req, CancellationToken ct)
    {
        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (job is null)
            return NotFound(new { error = "Job not found." });

        var dateInput = req?.Date?.Trim();
        if (string.IsNullOrWhiteSpace(dateInput))
            return BadRequest(new { error = "Date is required." });

        if (!DateTime.TryParseExact(dateInput, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
            return BadRequest(new { error = "Date must be yyyy-MM-dd." });

        var time = job.CreatedAt.TimeOfDay;
        var kind = job.CreatedAt.Kind == DateTimeKind.Unspecified ? DateTimeKind.Utc : job.CreatedAt.Kind;
        job.CreatedAt = DateTime.SpecifyKind(date.Date + time, kind);
        job.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            createdAt = job.CreatedAt.ToString("yyyy/MM/dd HH:mm", CultureInfo.InvariantCulture)
        });
    }

    private static string MapStatus(string? status)
    {
        var value = status?.Trim() ?? "";
        if (value.Equals("InProgress", StringComparison.OrdinalIgnoreCase))
            return "In Progress";
        if (value.Equals("Delivered", StringComparison.OrdinalIgnoreCase))
            return "Ready";
        if (value.Equals("Completed", StringComparison.OrdinalIgnoreCase))
            return "Completed";
        if (value.Equals("Archived", StringComparison.OrdinalIgnoreCase))
            return "Archived";
        if (value.Equals("Cancelled", StringComparison.OrdinalIgnoreCase))
            return "Cancelled";
        if (value.Equals("In Progress", StringComparison.OrdinalIgnoreCase))
            return "In Progress";
        return value;
    }

    private static string MapDetailStatus(string? status)
    {
        var value = status?.Trim() ?? "";
        if (value.Equals("InProgress", StringComparison.OrdinalIgnoreCase))
            return "In Shop";
        if (value.Equals("Delivered", StringComparison.OrdinalIgnoreCase))
            return "Ready";
        if (value.Equals("Completed", StringComparison.OrdinalIgnoreCase))
            return "Completed";
        if (value.Equals("Archived", StringComparison.OrdinalIgnoreCase))
            return "Archived";
        if (value.Equals("Cancelled", StringComparison.OrdinalIgnoreCase))
            return "Cancelled";
        if (value.Equals("In Shop", StringComparison.OrdinalIgnoreCase))
            return "In Shop";
        return value;
    }

    private static string BuildVehicleModel(string? make, string? model, int? year)
    {
        var parts = new List<string>(3);
        if (!string.IsNullOrWhiteSpace(make))
            parts.Add(make.Trim());
        if (!string.IsNullOrWhiteSpace(model))
            parts.Add(model.Trim());
        if (year.HasValue)
            parts.Add(year.Value.ToString(CultureInfo.InvariantCulture));

        return parts.Count > 0 ? string.Join(" ", parts) : "Unknown";
    }

    private static string FormatDate(DateOnly? date)
        => date.HasValue ? date.Value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) : "";

    private static string FormatDateTime(DateTime dateTime)
        => dateTime.ToString("O", CultureInfo.InvariantCulture);
}
