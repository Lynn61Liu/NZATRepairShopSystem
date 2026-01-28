using CarjamImporter.Infrastructure;
using CarjamImporter.Mappers;
using CarjamImporter.Parsers;
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

        var plate = PlateValidator.Normalize(plateInput);
        if (!PlateValidator.IsValid(plate))
        {
            Console.Error.WriteLine("Invalid plate format.");
            return 2;
        }

        var browser = new CarjamBrowser();
        var html = await browser.FetchHtmlAsync(plate, CancellationToken.None);

        var windowDocs = WindowJsonParser.ParseDocuments(html);
        using var vehicleDoc = windowDocs.VehicleDoc;
        using var odoDoc = windowDocs.OdoDoc;
        using var jphDoc = windowDocs.JphDoc;

        var htmlDoc = HtmlDataKeyParser.Load(html);
        var vehicle = VehicleMapper.Map(
            plate,
            htmlDoc,
            vehicleDoc?.RootElement,
            odoDoc?.RootElement,
            jphDoc?.RootElement);

        if (string.IsNullOrWhiteSpace(vehicle.Plate))
        {
            Console.Error.WriteLine("plate not found in window.report.idh.vehicle nor HTML data-key.");
            return 3;
        }

        var appConfig = AppConfig.Load(Directory.GetCurrentDirectory());
        var connStr = appConfig.GetConnectionString("Carjam");
        if (string.IsNullOrWhiteSpace(connStr))
        {
            Console.Error.WriteLine("Missing connection string. Set ConnectionStrings:Carjam in appsettings.json or user-secrets.");
            return 4;
        }

        var repo = new VehicleRepository(new DbConnectionFactory(connStr));
        var affected = repo.Upsert(vehicle);

        Console.WriteLine($"**********Upserted vehicle plate={vehicle.Plate}, rows affected={affected}");
        Console.WriteLine($"*******make={vehicle.Make}, model={vehicle.Model}, year={vehicle.Year}, vin={vehicle.Vin}, odometer={vehicle.Odometer}");
        return 0;
    }
}
