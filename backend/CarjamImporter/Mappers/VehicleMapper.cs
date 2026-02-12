using System.Text.Json;
using CarjamImporter.Models;
using CarjamImporter.Parsers;
using HtmlAgilityPack;

namespace CarjamImporter.Mappers;

/// <summary>
/// Mapper for converting parsed data into VehicleEntity objects.
/// </summary>
public static class VehicleMapper
{
    public static VehicleEntity Map(
        string plateInput,
        HtmlDocument htmlDoc,
        JsonElement? vehicleRoot,
        JsonElement? odoRoot,
        JsonElement? jphRoot)
    {
        var plateFromData = WindowJsonParser.GetString(vehicleRoot, "plate")
            ?? HtmlDataKeyParser.GetDataKeyValue(htmlDoc, "plate");
        var plateFinal = string.IsNullOrWhiteSpace(plateFromData) ? plateInput : plateFromData!;

        string? make = WindowJsonParser.GetString(vehicleRoot, "make") ?? HtmlDataKeyParser.GetDataKeyValue(htmlDoc, "make");
        string? model = WindowJsonParser.GetString(vehicleRoot, "model")
            ?? HtmlDataKeyParser.GetDataKeyValue(htmlDoc, "model")
            ?? WindowJsonParser.GetString(jphRoot, "cars", 0, "model");

        int? year = WindowJsonParser.GetInt(vehicleRoot, "year_of_manufacture")
            ?? ValueParsers.ParseIntLoose(HtmlDataKeyParser.GetDataKeyValue(htmlDoc, "year_of_manufacture"));
        string? vin = WindowJsonParser.GetString(vehicleRoot, "vin") ?? HtmlDataKeyParser.GetDataKeyValue(htmlDoc, "vin");

        string? engine = WindowJsonParser.GetString(jphRoot, "cars", 0, "engine");

        DateTime? regoExpiry = ValueParsers.ParseDateNZStyle(HtmlDataKeyParser.GetDataKeyValue(htmlDoc, "licence_expiry"));
        DateTime? wofExpiry = ValueParsers.ParseDateNZStyle(HtmlDataKeyParser.GetDataKeyValue(htmlDoc, "expiry_date_of_last_successful_wof"));

        string? colour = HtmlDataKeyParser.GetDataKeyValue(htmlDoc, "main_colour");
        string? bodyStyle = HtmlDataKeyParser.GetDataKeyValue(htmlDoc, "body_style");
        string? engineNo = HtmlDataKeyParser.GetDataKeyValue(htmlDoc, "engine_number");
        string? chassis = WindowJsonParser.GetString(vehicleRoot, "chassis") ?? HtmlDataKeyParser.GetDataKeyValue(htmlDoc, "chassis");

        int? ccRating = ValueParsers.ParseCcToInt(HtmlDataKeyParser.GetDataKeyValue(htmlDoc, "cc_rating"));
        string? fuelType = HtmlDataKeyParser.GetDataKeyValue(htmlDoc, "fuel_type");
        int? seats = ValueParsers.ParseIntLoose(HtmlDataKeyParser.GetDataKeyValue(htmlDoc, "no_of_seats"));

        string? countryOfOrigin = HtmlDataKeyParser.GetDataKeyValue(htmlDoc, "country_of_origin");
        int? grossVehicleMass = ValueParsers.ParseKgToInt(HtmlDataKeyParser.GetDataKeyValue(htmlDoc, "gross_vehicle_mass"));

        string? refrigerant = HtmlDataKeyParser.GetDataKeyValue(htmlDoc, "synthetic_greenhouse_gas");
        decimal? fuelTankLitres = ValueParsers.ParseDecimalLoose(HtmlDataKeyParser.GetDataKeyValue(htmlDoc, "fuel_tank_capacity_litres"));
        decimal? fullCombinedRangeKm = ValueParsers.ParseDecimalLoose(HtmlDataKeyParser.GetDataKeyValue(htmlDoc, "full_combined_range_km"));

        int? odometer = WindowJsonParser.ExtractLatestOdometer(odoRoot);
        DateTime? nzFirstRegistration = ValueParsers.ParseDateNZStyle(HtmlDataKeyParser.GetDataKeyValue(htmlDoc, "date_of_first_registration_in_nz"));

        var rawJson = BuildRawJson(plateFinal, vehicleRoot, odoRoot, jphRoot);

        return new VehicleEntity
        {
            Plate = plateFinal,
            Make = make,
            Model = model,
            Year = year,
            Vin = vin,
            Engine = engine,
            RegoExpiry = regoExpiry,
            Colour = colour,
            BodyStyle = bodyStyle,
            EngineNo = engineNo,
            Chassis = chassis,
            CcRating = ccRating,
            FuelType = fuelType,
            Seats = seats,
            CountryOfOrigin = countryOfOrigin,
            GrossVehicleMass = grossVehicleMass,
            Refrigerant = refrigerant,
            FuelTankLitres = fuelTankLitres,
            FullCombinedRangeKm = fullCombinedRangeKm,
            WofExpiry = wofExpiry,
            Odometer = odometer,
            NzFirstRegistration = nzFirstRegistration,
            RawJson = rawJson
        };
    }

    private static string BuildRawJson(string plate, JsonElement? vehicle, JsonElement? odos, JsonElement? jph)
    {
        var obj = new RawVehicleJson
        {
            Plate = plate,
            IdhVehicle = CloneOrNull(vehicle),
            OdometerHistory = CloneOrNull(odos),
            JphSearch = CloneOrNull(jph)
        };

        return JsonSerializer.Serialize(obj, new JsonSerializerOptions { WriteIndented = false });
    }

    private static JsonElement? CloneOrNull(JsonElement? element)
    {
        if (element is null) return null;
        return element.Value.Clone();
    }
}
