using System.Text.Json;
using System.Text.Json.Serialization;

namespace CarjamImporter.Models;
    /// <summary>
    /// Represents the raw JSON data extracted from the Carjam report.
    /// </summary>
public sealed class RawVehicleJson
{
    [JsonPropertyName("plate")]
    public string Plate { get; init; } = "";

    [JsonPropertyName("idh_vehicle")]
    public JsonElement? IdhVehicle { get; init; }

    [JsonPropertyName("odometer_history")]
    public JsonElement? OdometerHistory { get; init; }

    [JsonPropertyName("jph_search")]
    public JsonElement? JphSearch { get; init; }
}
