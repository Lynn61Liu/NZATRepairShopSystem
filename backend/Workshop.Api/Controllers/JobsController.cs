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

        var hasWofRecord = await _db.WofServices.AsNoTracking().AnyAsync(x => x.JobId == id, ct);

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

        var wofId = await _db.WofServices.AsNoTracking()
            .Where(x => x.JobId == id)
            .Select(x => x.Id)
            .FirstOrDefaultAsync(ct);

        if (wofId != 0)
        {
            await _db.WofResults.Where(x => x.WofId == wofId).ExecuteDeleteAsync(ct);
            await _db.WofCheckItems.Where(x => x.WofId == wofId).ExecuteDeleteAsync(ct);
            await _db.WofServices.Where(x => x.Id == wofId).ExecuteDeleteAsync(ct);
        }

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

    public record UpdateJobTagsRequest(long[] TagIds);

    [HttpPut("{id:long}/tags")]
    public async Task<IActionResult> UpdateJobTags(long id, [FromBody] UpdateJobTagsRequest req, CancellationToken ct)
    {
        var jobExists = await _db.Jobs.AsNoTracking().AnyAsync(x => x.Id == id, ct);
        if (!jobExists)
            return NotFound(new { error = "Job not found." });

        var tagIds = req?.TagIds?.Distinct().ToArray() ?? Array.Empty<long>();
        if (tagIds.Length > 0)
        {
            var existingIds = await _db.Tags.AsNoTracking()
                .Where(x => tagIds.Contains(x.Id))
                .Select(x => x.Id)
                .ToListAsync(ct);
            if (existingIds.Count != tagIds.Length)
                return BadRequest(new { error = "One or more tags are invalid." });
        }

        await _db.JobTags.Where(x => x.JobId == id).ExecuteDeleteAsync(ct);

        if (tagIds.Length > 0)
        {
            var items = tagIds.Select(tagId => new JobTag
            {
                JobId = id,
                TagId = tagId,
                CreatedAt = DateTime.UtcNow
            });
            _db.JobTags.AddRange(items);
            await _db.SaveChangesAsync(ct);
        }

        var tagNames = await _db.Tags.AsNoTracking()
            .Where(x => tagIds.Contains(x.Id))
            .Select(x => x.Name)
            .ToArrayAsync(ct);

        return Ok(new { tags = tagNames });
    }

    [HttpGet("{id:long}/wof-server")]
    public async Task<IActionResult> GetWofRecords(long id, CancellationToken ct)
    {
        var jobExists = await _db.Jobs.AsNoTracking().AnyAsync(x => x.Id == id, ct);
        if (!jobExists)
            return NotFound(new { error = "Job not found." });

        var wof = await _db.WofServices.AsNoTracking()
            .Where(x => x.JobId == id)
            .OrderByDescending(x => x.CreatedAt)
            .Select(x => new { x.Id })
            .FirstOrDefaultAsync(ct);

        if (wof is null)
        {
            return Ok(new
            {
                hasWofServer = false,
                wofId = (string?)null,
                checkItems = Array.Empty<object>(),
                results = Array.Empty<object>()
            });
        }

        var checkItems = await _db.WofCheckItems.AsNoTracking()
            .Where(x => x.WofId == wof.Id)
            .OrderByDescending(x => x.UpdatedAt)
            .Select(x => new
            {
                id = x.Id.ToString(CultureInfo.InvariantCulture),
                wofId = x.WofId.ToString(CultureInfo.InvariantCulture),
                odo = x.Odo,
                authCode = x.AuthCode,
                checkSheet = x.CheckSheet,
                csNo = x.CsNo,
                wofLabel = x.WofLabel,
                labelNo = x.LabelNo,
                source = x.Source,
                sourceRow = x.SourceRow,
                updatedAt = FormatDateTime(x.UpdatedAt)
            })
            .ToListAsync(ct);

        var results = await (
                from r in _db.WofResults.AsNoTracking()
                join fr in _db.WofFailReasons.AsNoTracking() on r.FailReasonId equals fr.Id into frGroup
                from fr in frGroup.DefaultIfEmpty()
                where r.WofId == wof.Id
                orderby r.CreatedAt descending
                select new
                {
                    id = r.Id.ToString(CultureInfo.InvariantCulture),
                    wofId = r.WofId.ToString(CultureInfo.InvariantCulture),
                    date = r.CreatedAt.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                    result = r.Result,
                    recheckExpiryDate = FormatDate(r.RecheckExpiryDate),
                    failReasonId = r.FailReasonId,
                    failReason = fr != null ? fr.Label : null,
                    note = r.Note ?? ""
                }
            )
            .ToListAsync(ct);

        return Ok(new
        {
            hasWofServer = true,
            wofId = wof.Id.ToString(CultureInfo.InvariantCulture),
            checkItems,
            results
        });
    }

    [HttpPost("{id:long}/wof-server")]
    public async Task<IActionResult> CreateWofRecord(long id, CancellationToken ct)
    {
        var jobExists = await _db.Jobs.AsNoTracking().AnyAsync(x => x.Id == id, ct);
        if (!jobExists)
            return NotFound(new { error = "Job not found." });

        var existing = await _db.WofServices.AsNoTracking()
            .Where(x => x.JobId == id)
            .OrderByDescending(x => x.CreatedAt)
            .Select(x => new { x.Id })
            .FirstOrDefaultAsync(ct);

        if (existing is null)
        {
            var record = new WofService
            {
                JobId = id,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            _db.WofServices.Add(record);
            await _db.SaveChangesAsync(ct);
            existing = new { Id = record.Id };
        }

        var checkItems = await _db.WofCheckItems.AsNoTracking()
            .Where(x => x.WofId == existing.Id)
            .OrderByDescending(x => x.UpdatedAt)
            .Select(x => new
            {
                id = x.Id.ToString(CultureInfo.InvariantCulture),
                wofId = x.WofId.ToString(CultureInfo.InvariantCulture),
                odo = x.Odo,
                authCode = x.AuthCode,
                checkSheet = x.CheckSheet,
                csNo = x.CsNo,
                wofLabel = x.WofLabel,
                labelNo = x.LabelNo,
                source = x.Source,
                sourceRow = x.SourceRow,
                updatedAt = FormatDateTime(x.UpdatedAt)
            })
            .ToListAsync(ct);

        var results = await (
                from r in _db.WofResults.AsNoTracking()
                join fr in _db.WofFailReasons.AsNoTracking() on r.FailReasonId equals fr.Id into frGroup
                from fr in frGroup.DefaultIfEmpty()
                where r.WofId == existing.Id
                orderby r.CreatedAt descending
                select new
                {
                    id = r.Id.ToString(CultureInfo.InvariantCulture),
                    wofId = r.WofId.ToString(CultureInfo.InvariantCulture),
                    date = r.CreatedAt.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                    result = r.Result,
                    recheckExpiryDate = FormatDate(r.RecheckExpiryDate),
                    failReasonId = r.FailReasonId,
                    failReason = fr != null ? fr.Label : null,
                    note = r.Note ?? ""
                }
            )
            .ToListAsync(ct);

        return Ok(new
        {
            hasWofServer = true,
            wofId = existing.Id.ToString(CultureInfo.InvariantCulture),
            checkItems,
            results
        });
    }

    [HttpDelete("{id:long}/wof-server")]
    public async Task<IActionResult> DeleteWofServer(long id, CancellationToken ct)
    {
        var wofId = await _db.WofServices.AsNoTracking()
            .Where(x => x.JobId == id)
            .Select(x => x.Id)
            .FirstOrDefaultAsync(ct);

        if (wofId == 0)
            return NotFound(new { error = "WOF record not found." });

        await _db.WofResults.Where(x => x.WofId == wofId).ExecuteDeleteAsync(ct);
        await _db.WofCheckItems.Where(x => x.WofId == wofId).ExecuteDeleteAsync(ct);
        await _db.WofServices.Where(x => x.Id == wofId).ExecuteDeleteAsync(ct);

        return Ok(new { success = true });
    }

    public record CreateWofResultRequest(string Result, string? RecheckExpiryDate, long? FailReasonId, string? Note);

    [HttpPost("{id:long}/wof-results")]
    public async Task<IActionResult> CreateWofResult(long id, [FromBody] CreateWofResultRequest req, CancellationToken ct)
    {
        if (req is null || string.IsNullOrWhiteSpace(req.Result))
            return BadRequest(new { error = "Result is required." });

        var resultValue = req.Result.Trim();
        if (!string.Equals(resultValue, "Pass", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(resultValue, "Fail", StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new { error = "Result must be Pass or Fail." });
        }

        DateOnly? recheckDate = null;
        if (!string.IsNullOrWhiteSpace(req.RecheckExpiryDate))
        {
            if (!DateOnly.TryParse(req.RecheckExpiryDate, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
                return BadRequest(new { error = "Invalid recheck expiry date." });
            recheckDate = parsed;
        }

        var jobExists = await _db.Jobs.AsNoTracking().AnyAsync(x => x.Id == id, ct);
        if (!jobExists)
            return NotFound(new { error = "Job not found." });

        var wof = await _db.WofServices
            .FirstOrDefaultAsync(x => x.JobId == id, ct);

        if (wof is null)
        {
            wof = new WofService
            {
                JobId = id,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            _db.WofServices.Add(wof);
            await _db.SaveChangesAsync(ct);
        }

        var failReasonId = req.FailReasonId;
        if (string.Equals(resultValue, "Pass", StringComparison.OrdinalIgnoreCase))
        {
            failReasonId = null;
            recheckDate = null;
        }

        var record = new WofResult
        {
            WofId = wof.Id,
            Result = resultValue,
            RecheckExpiryDate = recheckDate,
            FailReasonId = failReasonId,
            Note = req.Note ?? "",
            CreatedAt = DateTime.UtcNow
        };

        _db.WofResults.Add(record);
        await _db.SaveChangesAsync(ct);

        string? failReason = null;
        if (failReasonId.HasValue)
        {
            failReason = await _db.WofFailReasons.AsNoTracking()
                .Where(x => x.Id == failReasonId.Value)
                .Select(x => x.Label)
                .FirstOrDefaultAsync(ct);
        }

        return Ok(new
        {
            hasWofServer = true,
            record = new
            {
                id = record.Id.ToString(CultureInfo.InvariantCulture),
                wofId = record.WofId.ToString(CultureInfo.InvariantCulture),
                date = record.CreatedAt.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                result = record.Result,
                recheckExpiryDate = FormatDate(record.RecheckExpiryDate),
                failReasonId = record.FailReasonId,
                failReason,
                note = record.Note ?? ""
            }
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
