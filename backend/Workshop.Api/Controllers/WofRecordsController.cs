using System.Globalization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Services;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/jobs/{id:long}")]
public class WofRecordsController : ControllerBase
{
    private const string JobsListVersionCacheKey = "jobs:list:version:v1";
    private static readonly TimeSpan JobsListVersionCacheDuration = TimeSpan.FromDays(30);
    private static readonly TimeSpan WofRecordsCacheDuration = TimeSpan.FromMinutes(2);
    private const string PaintBoardCacheKey = "jobs:paint-board:v1";
    private const string WofScheduleCacheKey = "jobs:wof-schedule:v1";

    private readonly IAppCache _cache;
    private readonly AppDbContext _db;
    private readonly WofRecordsService _wofService;
    private readonly WofPrintService _wofPrintService;

    public WofRecordsController(
        IAppCache cache,
        AppDbContext db,
        WofRecordsService wofService,
        WofPrintService wofPrintService)
    {
        _cache = cache;
        _db = db;
        _wofService = wofService;
        _wofPrintService = wofPrintService;
    }

    [HttpGet("wof-server")]
    public async Task<IActionResult> GetWofRecords(long id, CancellationToken ct)
    {
        var payload = await _cache.GetOrCreateJsonAsync(
            GetWofRecordsCacheKey(id),
            WofRecordsCacheDuration,
            async token =>
            {
                var result = await _wofService.GetWofRecords(id, token);
                if (result.StatusCode != 200)
                    return null;

                return System.Text.Json.JsonSerializer.Serialize(result.Payload);
            },
            ct
        );

        if (payload is null)
            return NotFound(new { error = "Job not found." });

        return Content(payload, "application/json");
    }

    [HttpPost("wof-records/import")]
    public async Task<IActionResult> ImportWofRecords(long id, CancellationToken ct)
    {
        var result = await _wofService.ImportWofRecords(id, ct);
        await InvalidateWofCachesAsync(id, result, ct);
        return ToActionResult(result);
    }

    [HttpPost("wof-records")]
    public async Task<IActionResult> CreateWofRecord(long id, [FromBody] WofRecordUpdateRequest? request, CancellationToken ct)
    {
        if (request is null)
            return BadRequest(new { error = "Missing payload." });

        var result = await _wofService.CreateWofRecord(id, request, ct);
        await InvalidateWofCachesAsync(id, result, ct);
        return ToActionResult(result);
    }

    [HttpPut("wof-records/{recordId:long}")]
    public async Task<IActionResult> UpdateWofRecord(long id, long recordId, [FromBody] WofRecordUpdateRequest? request, CancellationToken ct)
    {
        if (request is null)
            return BadRequest(new { error = "Missing payload." });

        var result = await _wofService.UpdateWofRecord(id, recordId, request, ct);
        await InvalidateWofCachesAsync(id, result, ct);
        return ToActionResult(result);
    }

    [HttpDelete("wof-records/{recordId:long}")]
    public async Task<IActionResult> DeleteWofRecord(long id, long recordId, CancellationToken ct)
    {
        var result = await _wofService.DeleteWofRecord(id, recordId, ct);
        await InvalidateWofCachesAsync(id, result, ct);
        return ToActionResult(result);
    }

    [HttpGet("wof-records/{recordId:long}/print")]
    public async Task<IActionResult> PrintWofRecord(long id, long recordId, CancellationToken ct)
    {
        var result = await _wofPrintService.BuildPrintPdf(id, recordId, ct);
        if (result.StatusCode == 200 && result.PdfBytes is not null)
        {
            Response.Headers.ContentDisposition = $"inline; filename=\"{result.FileName ?? "wof.pdf"}\"";
            return File(result.PdfBytes, "application/pdf");
        }

        return StatusCode(result.StatusCode, new { error = result.Error });
    }

    [HttpGet("~/api/wof-records/{recordId:long}/form")]
    public async Task<IActionResult> GetWofFormData(long recordId, CancellationToken ct)
    {
        var row = await (
                from record in _db.JobWofRecords.AsNoTracking()
                join job in _db.Jobs.AsNoTracking() on record.JobId equals job.Id
                join vehicle in _db.Vehicles.AsNoTracking() on job.VehicleId equals vehicle.Id
                join customer in _db.Customers.AsNoTracking() on job.CustomerId equals customer.Id
                where record.Id == recordId
                select new
                {
                    Job = job,
                    Vehicle = vehicle,
                    Customer = customer,
                    Record = record,
                }
            )
            .FirstOrDefaultAsync(ct);

        if (row is null)
            return NotFound(new { error = "WOF record not found." });

        return Ok(new
        {
            job = new
            {
                id = row.Job.Id.ToString(CultureInfo.InvariantCulture),
                invoiceReference = row.Job.InvoiceReference,
                poNumber = row.Job.PoNumber,
            },
            customer = new
            {
                id = row.Customer.Id.ToString(CultureInfo.InvariantCulture),
                type = row.Customer.Type,
                name = row.Customer.Name,
                phone = row.Customer.Phone,
                email = row.Customer.Email,
                address = row.Customer.Address,
                businessCode = row.Customer.BusinessCode,
                notes = row.Customer.Notes,
            },
            vehicle = new
            {
                plate = row.Vehicle.Plate,
                make = row.Vehicle.Make,
                model = row.Vehicle.Model,
                year = row.Vehicle.Year,
                vin = row.Vehicle.Vin,
                chassis = row.Vehicle.Chassis,
                fuelType = row.Vehicle.FuelType,
                regoExpiry = FormatDate(row.Vehicle.RegoExpiry),
                licenceExpiry = FormatDate(row.Vehicle.LicenceExpiry),
                wofExpiry = FormatDate(row.Vehicle.WofExpiry),
                odometer = row.Vehicle.Odometer,
                nzFirstRegistration = FormatDate(row.Vehicle.NzFirstRegistration),
            },
            wof = new
            {
                id = row.Record.Id.ToString(CultureInfo.InvariantCulture),
                jobId = row.Record.JobId.ToString(CultureInfo.InvariantCulture),
                occurredAt = FormatDateTime(row.Record.OccurredAt),
                rego = row.Record.Rego,
                makeModel = row.Record.MakeModel,
                odo = row.Record.Odo,
                recordState = row.Record.RecordState.ToString(),
                isNewWof = row.Record.IsNewWof,
                newWofDate = FormatDate(row.Record.NewWofDate),
                authCode = row.Record.AuthCode,
                checkSheet = row.Record.CheckSheet,
                csNo = row.Record.CsNo,
                wofLabel = row.Record.WofLabel,
                labelNo = row.Record.LabelNo,
                failReasons = row.Record.FailReasons,
                previousExpiryDate = FormatDate(row.Record.PreviousExpiryDate),
                organisationName = row.Record.OrganisationName,
                note = row.Record.Note,
                wofUiState = row.Record.WofUiState.ToString(),
                importedAt = FormatDateTime(row.Record.ImportedAt),
                updatedAt = FormatDateTime(row.Record.UpdatedAt),
            },
        });
    }

    [HttpPost("wof-server")]
    public async Task<IActionResult> CreateWofRecord(long id, CancellationToken ct)
    {
        var result = await _wofService.CreateWofService(id, ct);
        await InvalidateWofCachesAsync(id, result, ct);
        return ToActionResult(result);
    }

    [HttpDelete("wof-server")]
    public async Task<IActionResult> DeleteWofServer(long id, CancellationToken ct)
    {
        var result = await _wofService.DeleteWofServer(id, ct);
        await InvalidateWofCachesAsync(id, result, ct);
        return ToActionResult(result);
    }

    public record UpdateWofStatusRequest(string? Status);

    [HttpPut("wof-status")]
    public async Task<IActionResult> UpdateWofStatus(long id, [FromBody] UpdateWofStatusRequest? request, CancellationToken ct)
    {
        var result = await _wofService.UpdateWofStatus(id, request?.Status, ct);
        await InvalidateWofCachesAsync(id, result, ct);
        return ToActionResult(result);
    }

    public record CreateWofResultRequest(string Result, string? RecheckExpiryDate, long? FailReasonId, string? Note);

    [HttpPost("wof-results")]
    public async Task<IActionResult> CreateWofResult(long id, [FromBody] CreateWofResultRequest req, CancellationToken ct)
    {
        var result = await _wofService.CreateWofResult(id, req?.Result, req?.RecheckExpiryDate, req?.FailReasonId, req?.Note, ct);
        await InvalidateWofCachesAsync(id, result, ct);
        return ToActionResult(result);
    }

    private async Task InvalidateWofCachesAsync(long jobId, WofServiceResult result, CancellationToken ct)
    {
        if (result.StatusCode != 200)
            return;

        await _cache.RemoveAsync(GetWofRecordsCacheKey(jobId), ct);
        await _cache.RemoveAsync(GetJobDetailCacheKey(jobId), ct);
        await _cache.RemoveAsync(PaintBoardCacheKey, ct);
        await _cache.RemoveAsync(WofScheduleCacheKey, ct);
        await TouchJobsListVersionAsync(ct);
    }

    private Task TouchJobsListVersionAsync(CancellationToken ct)
        => _cache.SetStringAsync(
            JobsListVersionCacheKey,
            DateTime.UtcNow.Ticks.ToString(CultureInfo.InvariantCulture),
            JobsListVersionCacheDuration,
            ct);

    private static string GetWofRecordsCacheKey(long jobId)
        => $"job:wof-server:{jobId}:v1";

    private static string GetJobDetailCacheKey(long jobId)
        => $"job:detail:{jobId}:v1";

    private static string? FormatDate(DateOnly? value)
        => value?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static string FormatDateTime(DateTime value)
        => value.ToString("yyyy-MM-ddTHH:mm:ssK", CultureInfo.InvariantCulture);

    private IActionResult ToActionResult(WofServiceResult result)
    {
        if (result.StatusCode == 200)
            return Ok(result.Payload);

        return StatusCode(result.StatusCode, new { error = result.Error });
    }
}
