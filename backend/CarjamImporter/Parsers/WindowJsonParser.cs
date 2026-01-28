using System.Text.Json;
using System.Text.RegularExpressions;

namespace CarjamImporter.Parsers;

public sealed record WindowJsonDocuments(JsonDocument? VehicleDoc, JsonDocument? OdoDoc, JsonDocument? JphDoc);

public static class WindowJsonParser
{
    /// <summary>
    /// Parses the window.report and window.jph_search JSON documents from the given HTML content.
    /// </summary>
    public static WindowJsonDocuments ParseDocuments(string html)
    {
        var vehicleJson = ExtractWindowAssignmentJson(html, "window.report.idh.vehicle");
        var odoHistoryJson = ExtractWindowAssignmentJson(html, "window.report.idh.odometer_history");
        var jphJson = ExtractWindowAssignmentJson(html, "window.jph_search");

        var vehicleDoc = !string.IsNullOrWhiteSpace(vehicleJson) ? JsonDocument.Parse(vehicleJson) : null;
        var odoDoc = !string.IsNullOrWhiteSpace(odoHistoryJson) ? JsonDocument.Parse(odoHistoryJson) : null;
        var jphDoc = !string.IsNullOrWhiteSpace(jphJson) ? JsonDocument.Parse(jphJson) : null;

        return new WindowJsonDocuments(vehicleDoc, odoDoc, jphDoc);
    }

    public static string? ExtractWindowAssignmentJson(string html, string varPath)
    {
        var pattern = Regex.Escape(varPath) + @"\s*=\s*(\{.*?\}|\[.*?\])\s*;";
        var m = Regex.Match(html, pattern, RegexOptions.Singleline);
        return m.Success ? m.Groups[1].Value : null;
    }

    public static string? GetString(JsonElement? obj, string name)
    {
        if (obj is null) return null;
        if (obj.Value.ValueKind != JsonValueKind.Object) return null;
        if (!obj.Value.TryGetProperty(name, out var p)) return null;
        if (p.ValueKind == JsonValueKind.String) return p.GetString();
        if (p.ValueKind == JsonValueKind.Number) return p.ToString();
        return null;
    }

    public static int? GetInt(JsonElement? obj, string name)
    {
        if (obj is null) return null;
        if (obj.Value.ValueKind != JsonValueKind.Object) return null;
        if (!obj.Value.TryGetProperty(name, out var p)) return null;

        if (p.ValueKind == JsonValueKind.Number && p.TryGetInt32(out var n)) return n;
        if (p.ValueKind == JsonValueKind.String && int.TryParse(p.GetString(), out var s)) return s;
        return null;
    }

    public static string? GetString(JsonElement? root, string arrayName, int index, string prop)
    {
        if (root is null) return null;
        if (root.Value.ValueKind != JsonValueKind.Object) return null;
        if (!root.Value.TryGetProperty(arrayName, out var arr)) return null;
        if (arr.ValueKind != JsonValueKind.Array) return null;
        if (arr.GetArrayLength() <= index) return null;
        var item = arr[index];
        if (item.ValueKind != JsonValueKind.Object) return null;
        if (!item.TryGetProperty(prop, out var p)) return null;
        if (p.ValueKind == JsonValueKind.String) return p.GetString();
        return p.ToString();
    }

    public static int? ExtractLatestOdometer(JsonElement? odoRoot)
    {
        if (odoRoot is null) return null;
        if (odoRoot.Value.ValueKind != JsonValueKind.Array) return null;

        long bestDate = long.MinValue;
        string? bestReading = null;

        foreach (var item in odoRoot.Value.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object) continue;

            long date = 0;
            if (item.TryGetProperty("odometer_date", out var d))
            {
                if (d.ValueKind == JsonValueKind.Number && d.TryGetInt64(out var dn)) date = dn;
                else if (d.ValueKind == JsonValueKind.String && long.TryParse(d.GetString(), out var ds)) date = ds;
            }

            string? reading = null;
            if (item.TryGetProperty("odometer_reading", out var r))
            {
                reading = r.ValueKind == JsonValueKind.String ? r.GetString() : r.ToString();
            }

            if (date > bestDate && !string.IsNullOrWhiteSpace(reading))
            {
                bestDate = date;
                bestReading = reading;
            }
        }

        return ValueParsers.ParseIntLoose(bestReading);
    }
}
