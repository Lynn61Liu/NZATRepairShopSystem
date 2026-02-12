using CarjamImporter.Infrastructure;
using CarjamImporter.Models;
using Npgsql;

namespace CarjamImporter.Persistence;
/// <summary>
/// Repository for managing VehicleEntity persistence.
/// </summary>
public sealed class VehicleRepository
{
    private readonly DbConnectionFactory _connectionFactory;

    public VehicleRepository(DbConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    public int Upsert(VehicleEntity vehicle)
    {
        using var conn = _connectionFactory.Create();
        conn.Open();

        var sql = @"
INSERT INTO vehicles
(
  plate, make, model, year, vin, engine, rego_expiry, colour, body_style, engine_no, chassis,
  cc_rating, fuel_type, seats, country_of_origin, gross_vehicle_mass, refrigerant,
  fuel_tank_capacity_litres, full_combined_range_km, wof_expiry, odometer, nz_first_registration,
  raw_json, updated_at
)
VALUES
(
  @plate, @make, @model, @year, @vin, @engine, @rego_expiry, @colour, @body_style, @engine_no, @chassis,
  @cc_rating, @fuel_type, @seats, @country_of_origin, @gross_vehicle_mass, @refrigerant,
  @fuel_tank_capacity_litres, @full_combined_range_km, @wof_expiry, @odometer, @nz_first_registration,
  @raw_json::jsonb, now()
)
ON CONFLICT (plate)
DO UPDATE SET
  make = EXCLUDED.make,
  model = EXCLUDED.model,
  year = EXCLUDED.year,
  vin = EXCLUDED.vin,
  engine = EXCLUDED.engine,
  rego_expiry = EXCLUDED.rego_expiry,
  colour = EXCLUDED.colour,
  body_style = EXCLUDED.body_style,
  engine_no = EXCLUDED.engine_no,
  chassis = EXCLUDED.chassis,
  cc_rating = EXCLUDED.cc_rating,
  fuel_type = EXCLUDED.fuel_type,
  seats = EXCLUDED.seats,
  country_of_origin = EXCLUDED.country_of_origin,
  gross_vehicle_mass = EXCLUDED.gross_vehicle_mass,
  refrigerant = EXCLUDED.refrigerant,
  fuel_tank_capacity_litres = EXCLUDED.fuel_tank_capacity_litres,
  full_combined_range_km = EXCLUDED.full_combined_range_km,
  wof_expiry = EXCLUDED.wof_expiry,
  odometer = EXCLUDED.odometer,
  nz_first_registration = EXCLUDED.nz_first_registration,
  raw_json = EXCLUDED.raw_json,
  updated_at = now();
";

        using var cmd = new NpgsqlCommand(sql, conn);

        cmd.Parameters.AddWithValue("plate", vehicle.Plate);
        cmd.Parameters.AddWithValue("make", (object?)vehicle.Make ?? DBNull.Value);
        cmd.Parameters.AddWithValue("model", (object?)vehicle.Model ?? DBNull.Value);
        cmd.Parameters.AddWithValue("year", (object?)vehicle.Year ?? DBNull.Value);
        cmd.Parameters.AddWithValue("vin", (object?)vehicle.Vin ?? DBNull.Value);
        cmd.Parameters.AddWithValue("engine", (object?)vehicle.Engine ?? DBNull.Value);
        cmd.Parameters.AddWithValue("engine_no", (object?)vehicle.EngineNo ?? DBNull.Value);
        cmd.Parameters.AddWithValue("rego_expiry", (object?)vehicle.RegoExpiry ?? DBNull.Value);
        cmd.Parameters.AddWithValue("colour", (object?)vehicle.Colour ?? DBNull.Value);
        cmd.Parameters.AddWithValue("body_style", (object?)vehicle.BodyStyle ?? DBNull.Value);
        cmd.Parameters.AddWithValue("chassis", (object?)vehicle.Chassis ?? DBNull.Value);
        cmd.Parameters.AddWithValue("cc_rating", (object?)vehicle.CcRating ?? DBNull.Value);
        cmd.Parameters.AddWithValue("fuel_type", (object?)vehicle.FuelType ?? DBNull.Value);
        cmd.Parameters.AddWithValue("seats", (object?)vehicle.Seats ?? DBNull.Value);
        cmd.Parameters.AddWithValue("country_of_origin", (object?)vehicle.CountryOfOrigin ?? DBNull.Value);
        cmd.Parameters.AddWithValue("gross_vehicle_mass", (object?)vehicle.GrossVehicleMass ?? DBNull.Value);
        cmd.Parameters.AddWithValue("refrigerant", (object?)vehicle.Refrigerant ?? DBNull.Value);
        cmd.Parameters.AddWithValue("fuel_tank_capacity_litres", (object?)vehicle.FuelTankLitres ?? DBNull.Value);
        cmd.Parameters.AddWithValue("full_combined_range_km", (object?)vehicle.FullCombinedRangeKm ?? DBNull.Value);
        cmd.Parameters.AddWithValue("wof_expiry", (object?)vehicle.WofExpiry ?? DBNull.Value);
        cmd.Parameters.AddWithValue("odometer", (object?)vehicle.Odometer ?? DBNull.Value);
        cmd.Parameters.AddWithValue("nz_first_registration", (object?)vehicle.NzFirstRegistration ?? DBNull.Value);
        cmd.Parameters.AddWithValue("raw_json", vehicle.RawJson);

        return cmd.ExecuteNonQuery();
    }
}
