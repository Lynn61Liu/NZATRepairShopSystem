using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using Workshop.Api.Data;
using Workshop.Api.DTOs;
using Workshop.Api.Models;
using Workshop.Api.Services;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/vehicles")]
public class VehiclesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly CarjamScraper _scraper;

    public VehiclesController(AppDbContext db, CarjamScraper scraper)
    {
        _db = db;
        _scraper = scraper;
    }

    [HttpPost("import-by-plate")]
    public async Task<IActionResult> ImportByPlate([FromBody] ImportVehicleRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Plate))
            return BadRequest("Plate is required.");

        var plate = NormalizePlate(req.Plate);

        var jsonText = await _scraper.GetVehicleJsonByPlateAsync(plate, ct);
        var jsonDoc = JsonDocument.Parse(jsonText);

        // TODO: 下一步我们根据真实 JSON 结构，把字段准确解析出来
        // 先把 raw_json 存进去（你选的方案 2 的核心）
        var existing = await _db.Vehicles.FirstOrDefaultAsync(x => x.Plate == plate, ct);

        if (existing is null)
        {
            existing = new Vehicle
            {
                Plate = plate,
                RawJson = jsonDoc,
                UpdatedAt = DateTime.UtcNow
            };
            _db.Vehicles.Add(existing);
        }
        else
        {
            existing.RawJson = jsonDoc;
            existing.UpdatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            existing.Id,
            existing.Plate,
            existing.UpdatedAt
        });
    }

    [HttpGet("by-plate")]
    public async Task<IActionResult> GetByPlate([FromQuery] string plate, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(plate))
            return BadRequest(new { error = "Plate is required." });

        var normalized = NormalizePlate(plate);
        var vehicle = await _db.Vehicles
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Plate == normalized, ct);

        if (vehicle is null)
            return NotFound(new { error = "Vehicle not found." });

        return Ok(new
        {
            vehicle = new
            {
                vehicle.Plate,
                vehicle.Make,
                vehicle.Model,
                vehicle.Year,
                vehicle.Vin,
                vehicle.Odometer,
                vehicle.UpdatedAt
            }
        });
    }

    private static string NormalizePlate(string plate)
        => new string(plate.Trim().ToUpperInvariant().Where(char.IsLetterOrDigit).ToArray());
}
