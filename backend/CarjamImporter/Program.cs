using CarjamImporter.Infrastructure;
using CarjamImporter.Persistence;
using CarjamImporter.Playwright;
using CarjamImporter.Utils;

namespace CarjamImporter;

public class Program
{
    public static async Task<int> Main(string[] args)
    {
        var plateInput = args.Length > 0 ? args[0] : "";
        if (string.IsNullOrWhiteSpace(plateInput))
        {
            Console.Error.WriteLine("Usage: dotnet run -- <PLATE>  (e.g. dotnet run -- MHD855)");
            return 1;
        }

        var appConfig = AppConfig.Load(Directory.GetCurrentDirectory());
        var connStr = appConfig.GetConnectionString("Carjam");
        if (string.IsNullOrWhiteSpace(connStr))
        {
            Console.Error.WriteLine("Missing connection string. Set ConnectionStrings:Carjam in appsettings.json or user-secrets.");
            return 4;
        }

        var service = new CarjamImportService(
            new CarjamBrowser(),
            new VehicleRepository(new DbConnectionFactory(connStr)));

        var result = await service.ImportByPlateAsync(plateInput, CancellationToken.None);
        if (!result.Success || result.Vehicle is null)
        {
            Console.Error.WriteLine(result.Error ?? "Import failed.");
            return 2;
        }

        Console.WriteLine($"**********Upserted vehicle plate={result.Vehicle.Plate}, rows affected={result.AffectedRows}");
        Console.WriteLine($"*******make={result.Vehicle.Make}, model={result.Vehicle.Model}, year={result.Vehicle.Year}, vin={result.Vehicle.Vin}, odometer={result.Vehicle.Odometer}");
        return 0;
    }
}
