using System;
using CarjamImporter;
using Microsoft.AspNetCore.Mvc;
using Workshop.Api.DTOs;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/carjam")]
public class CarjamController : ControllerBase
{
    private readonly CarjamImportService _importService;

    public CarjamController(CarjamImportService importService)
    {
        _importService = importService;
    }

   [HttpPost("import")]
[HttpGet("import")]
public async Task<IActionResult> Import(
    [FromBody] CarjamImportRequest? req,
    [FromQuery] string? plate,
    CancellationToken ct)
{
    var finalPlate = req?.Plate ?? plate;

    Console.WriteLine("-------API Import Vehicle by Plate:", finalPlate);

    if (string.IsNullOrWhiteSpace(finalPlate))
        return BadRequest(new { success = false, error = "Plate is required." });

    var result = await _importService.ImportByPlateAsync(finalPlate, ct);

    if (!result.Success || result.Vehicle is null)
        return BadRequest(new { success = false, error = result.Error ?? "Import failed." });

    var v = result.Vehicle;
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
