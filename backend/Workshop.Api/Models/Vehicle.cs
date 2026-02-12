using System.Text.Json;

namespace Workshop.Api.Models;

public class Vehicle
{
    public long Id { get; set; }                       // BIGSERIAL
    public string Plate { get; set; } = default!;      // TEXT UNIQUE NOT NULL

    public string? Make { get; set; }
    public string? Model { get; set; }
    public int? Year { get; set; }
    public string? Vin { get; set; }
    public string? Engine { get; set; }
    public DateOnly? RegoExpiry { get; set; }
    public string? Colour { get; set; }
    public string? BodyStyle { get; set; }
    public string? EngineNo { get; set; }
    public string? Chassis { get; set; }
    public int? CcRating { get; set; }
    public string? FuelType { get; set; }
    public int? Seats { get; set; }
    public string? CountryOfOrigin { get; set; }
    public int? GrossVehicleMass { get; set; }
    public string? Refrigerant { get; set; }
    public decimal? FuelTankCapacityLitres { get; set; }
    public decimal? FullCombinedRangeKm { get; set; }
    public DateOnly? WofExpiry { get; set; }
    public int? Odometer { get; set; }
    public DateOnly? NzFirstRegistration { get; set; }

    public long? CustomerId { get; set; }

    public JsonDocument? RawJson { get; set; }         // ✅ 新增 raw_json
    public DateTime UpdatedAt { get; set; }            // timestamptz
}
