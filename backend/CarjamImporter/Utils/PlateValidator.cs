using System.Text.RegularExpressions;

namespace CarjamImporter.Utils;

public static class PlateValidator
{
    public static string Normalize(string plate) => plate.Trim().ToUpperInvariant();

    public static bool IsValid(string plate) => Regex.IsMatch(plate, "^[A-Z0-9]{1,8}$");
}
