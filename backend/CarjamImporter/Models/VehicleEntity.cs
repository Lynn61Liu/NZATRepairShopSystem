namespace CarjamImporter.Models;
/// <summary>
/// Represents a vehicle entity with various attributes.
/// </summary>
public sealed class VehicleEntity
{
    public string Plate { get; init; } = "";
    public string? Make { get; init; }
    public string? Model { get; init; }
    public int? Year { get; init; }
    public string? Vin { get; init; }
    public string? Engine { get; init; }
    public DateTime? RegoExpiry { get; init; }
    public string? Colour { get; init; }
    public string? BodyStyle { get; init; }
    public string? EngineNo { get; init; }
    public string? Chassis { get; init; }
    public int? CcRating { get; init; }
    public string? FuelType { get; init; }
    public int? Seats { get; init; }
    public string? CountryOfOrigin { get; init; }
    public int? GrossVehicleMass { get; init; }
    public string? Refrigerant { get; init; }
    public decimal? FuelTankLitres { get; init; }
    public decimal? FullCombinedRangeKm { get; init; }
    public DateTime? WofExpiry { get; init; }
    public int? Odometer { get; init; }
    public DateTime? NzFirstRegistration { get; init; }
    public string RawJson { get; init; } = "{}";
}
