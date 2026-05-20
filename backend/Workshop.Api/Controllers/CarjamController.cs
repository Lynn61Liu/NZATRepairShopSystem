using System;
using CarjamImporter;
using Microsoft.AspNetCore.Mvc;

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
