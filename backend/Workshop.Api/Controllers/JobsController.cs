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
