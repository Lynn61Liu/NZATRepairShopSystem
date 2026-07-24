using System;
using CarjamImporter;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Services;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/carjam")]
public class CarjamController : ControllerBase
{
    private const string JobsListVersionCacheKey = "jobs:list:version:v1";
    private const string PaintBoardCacheKey = "jobs:paint-board:v1";
    private const string WofScheduleCacheKey = "jobs:wof-schedule:v1";
    private static readonly TimeSpan JobsListVersionCacheDuration = TimeSpan.FromDays(30);

    private readonly CarjamImportService _importService;
    private readonly AppDbContext _db;
    private readonly IAppCache _cache;
    private readonly InvoiceOutboxService _invoiceOutboxService;

    public CarjamController(
        CarjamImportService importService,
        AppDbContext db,
        IAppCache cache,
        InvoiceOutboxService invoiceOutboxService)
    {
        _importService = importService;
        _db = db;
        _cache = cache;
        _invoiceOutboxService = invoiceOutboxService;
    }

    [HttpPost("import")]
    public async Task<IActionResult> Import(
        [FromQuery] string? plate,
        CancellationToken ct)
    {
        Console.WriteLine("-------API Import Vehicle by Plate:", plate);

        if (string.IsNullOrWhiteSpace(plate))
            return BadRequest(new { success = false, error = "Plate is required." });

        var result = await _importService.ImportByPlateAsync(plate, ct);

        if (!result.Success || result.Vehicle is null)
            return BadRequest(new { success = false, error = result.Error ?? "Import failed." });

        var v = result.Vehicle;
        using var followUpTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        var followUpCt = followUpTimeout.Token;
        var affectedJobIds = await (
                from job in _db.Jobs.AsNoTracking()
                join vehicle in _db.Vehicles.AsNoTracking() on job.VehicleId equals vehicle.Id
                where vehicle.Plate == v.Plate
                select job.Id
            )
            .ToListAsync(followUpCt);

        foreach (var jobId in affectedJobIds)
            await _invoiceOutboxService.EnqueueSyncVehicleReferenceAsync(jobId, followUpCt);

        var invalidations = affectedJobIds
            .Select(jobId => _cache.RemoveAsync($"job:detail:{jobId}:v1", ct))
            .Append(_cache.RemoveAsync(PaintBoardCacheKey, ct))
            .Append(_cache.RemoveAsync(WofScheduleCacheKey, ct));
        await Task.WhenAll(invalidations);
        await _cache.SetStringAsync(
            JobsListVersionCacheKey,
            Guid.NewGuid().ToString("N"),
            JobsListVersionCacheDuration,
            ct);

        return Ok(new
        {
            success = true,
            affectedRows = result.AffectedRows,
            vehicle = new
            {
                plate = v.Plate,
                make = v.Make,
                model = v.Model,
                year = v.Year,
                vin = v.Vin,
                fuelType = v.FuelType,
                nzFirstRegistration = v.NzFirstRegistration,
                odometer = v.Odometer
            }
        });
    }

}
