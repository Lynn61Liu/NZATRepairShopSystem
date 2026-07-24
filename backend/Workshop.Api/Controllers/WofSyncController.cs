using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Mvc;
using Workshop.Api.Data;
using Workshop.Api.Models;
using Workshop.Api.Services;
using Workshop.Api.Utils;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/wof-records")]
public class WofSyncController : ControllerBase
{
    private const string WofScheduleCacheKey = "jobs:wof-schedule:v1";
    private readonly AppDbContext _db;
    private readonly IAppCache _cache;
    private readonly WofRecordsService _wofService;

    public WofSyncController(AppDbContext db, IAppCache cache, WofRecordsService wofService)
    {
        _db = db;
        _cache = cache;
        _wofService = wofService;
    }

    [HttpPost("sync")]
    public async Task<IActionResult> SyncAll(CancellationToken ct)
    {
        var result = await _wofService.SyncAllRecordsFromGoogleSheet(ct);
        if (result.StatusCode == 200)
        {
            await _cache.RemoveAsync(WofScheduleCacheKey, ct);
            return Ok(result.Payload);
        }

        return StatusCode(result.StatusCode, new { error = result.Error });
    }

    [HttpGet("calendar")]
    public async Task<IActionResult> GetCalendarRecords(
        [FromQuery] DateOnly? from,
        [FromQuery] DateOnly? to,
        CancellationToken ct)
    {
        var todayNz = DateOnly.FromDateTime(DateTimeHelper.ConvertUtcToNz(DateTime.UtcNow));
        var fromDate = from ?? todayNz.AddDays(-1);
        var toDate = to ?? fromDate.AddDays(6);
        if (toDate < fromDate)
            return BadRequest(new { error = "The calendar end date must not be before the start date." });
        if (toDate.DayNumber - fromDate.DayNumber > 31)
            return BadRequest(new { error = "The calendar range cannot exceed 32 days." });

        var startUtc = NzDateStartUtc(fromDate);
        var endUtcExclusive = NzDateStartUtc(toDate.AddDays(1));
        var rows = await _db.WofCalendarRecords.AsNoTracking()
            .Where(record => record.OccurredAt >= startUtc && record.OccurredAt < endUtcExclusive)
            .OrderBy(record => record.OccurredAt)
            .ThenBy(record => record.Id)
            .ToListAsync(ct);
        var matchedJobIds = rows
            .Where(row => row.JobId.HasValue)
            .Select(row => row.JobId!.Value)
            .Distinct()
            .ToArray();
        var systemVehicles = new Dictionary<long, SystemVehicleCalendarInfo>();
        if (matchedJobIds.Length > 0)
        {
            var systemVehicleRows = await (
                    from job in _db.Jobs.AsNoTracking()
                    join vehicle in _db.Vehicles.AsNoTracking() on job.VehicleId equals vehicle.Id
                    where matchedJobIds.Contains(job.Id)
                    select new
                    {
                        job.Id,
                        vehicle.Year,
                        vehicle.Make,
                        vehicle.Model,
                    }
                )
                .ToListAsync(ct);
            systemVehicles = systemVehicleRows.ToDictionary(
                row => row.Id,
                row => new SystemVehicleCalendarInfo(row.Year, row.Make, row.Model));
        }

        var records = rows.Select(row =>
        {
            var systemVehicle = row.JobId.HasValue && systemVehicles.TryGetValue(row.JobId.Value, out var value)
                ? value
                : null;
            return new
            {
                id = row.Id.ToString(System.Globalization.CultureInfo.InvariantCulture),
                jobId = row.JobId?.ToString(System.Globalization.CultureInfo.InvariantCulture),
                occurredAt = DateTimeHelper.FormatUtc(row.OccurredAt),
                plate = row.Rego,
                makeModel = row.MakeModel ?? "",
                systemYear = systemVehicle?.Year,
                systemMake = (string?)systemVehicle?.Make,
                systemModel = (string?)systemVehicle?.Model,
                result = row.RecordState switch
                {
                    WofRecordState.Fail => "Fail",
                    WofRecordState.Recheck => "Recheck",
                    _ => "Pass",
                },
            };
        });

        return Ok(new { records });
    }

    private static DateTime NzDateStartUtc(DateOnly date)
    {
        TimeZoneInfo nzTimeZone;
        try
        {
            nzTimeZone = TimeZoneInfo.FindSystemTimeZoneById(DateTimeHelper.NzTimeZoneId);
        }
        catch
        {
            nzTimeZone = TimeZoneInfo.Utc;
        }

        var localMidnight = date.ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified);
        return TimeZoneInfo.ConvertTimeToUtc(localMidnight, nzTimeZone);
    }

    private sealed record SystemVehicleCalendarInfo(int? Year, string? Make, string? Model);
}
