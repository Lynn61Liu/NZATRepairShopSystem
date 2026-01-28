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
    public async Task<IActionResult> Import([FromBody] CarjamImportRequest req, CancellationToken ct)

    {
        Console.WriteLine("-------API Import Vehicle by Plate:", req?.Plate);
        if (req == null || string.IsNullOrWhiteSpace(req.Plate))
            return BadRequest(new { success = false, error = "Plate is required." });

        var result = await _importService.ImportByPlateAsync(req.Plate, ct);
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
                odometer = v.Odometer
            }
        });
    }
}
