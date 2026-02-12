using System.Collections.Concurrent;
using CarjamImporter.Mappers;
using CarjamImporter.Models;
using CarjamImporter.Parsers;
using CarjamImporter.Persistence;
using CarjamImporter.Playwright;
using CarjamImporter.Utils;

namespace CarjamImporter;

public sealed class CarjamImportService
{
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> Locks = new();
    private readonly CarjamBrowser _browser;
    private readonly VehicleRepository _repo;
    private readonly TimeSpan _timeout;

    public CarjamImportService(CarjamBrowser browser, VehicleRepository repo, TimeSpan? timeout = null)
    {
        _browser = browser;
        _repo = repo;
        _timeout = timeout ?? TimeSpan.FromSeconds(120);
    }

    public async Task<CarjamImportResult> ImportByPlateAsync(string plateInput, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(plateInput))
            return CarjamImportResult.Fail("Plate is required.");

        var plate = PlateValidator.Normalize(plateInput);
        if (!PlateValidator.IsValid(plate))
            return CarjamImportResult.Fail("Invalid plate format.");

        var gate = Locks.GetOrAdd(plate, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            var htmlTask = _browser.FetchHtmlAsync(plate, ct);
            var completed = await Task.WhenAny(htmlTask, Task.Delay(_timeout, ct));
            if (completed != htmlTask)
                return CarjamImportResult.Fail("Timed out while fetching vehicle data.");

            var html = await htmlTask;
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
                return CarjamImportResult.Fail("Plate not found in page data.");

            var affected = _repo.Upsert(vehicle);
            return CarjamImportResult.Ok(vehicle, affected);
        }
        catch (Exception ex)
        {
            return CarjamImportResult.Fail(ex.Message);
        }
        finally
        {
            gate.Release();
        }
    }
}

public sealed record CarjamImportResult(bool Success, string? Error, VehicleEntity? Vehicle, int AffectedRows)
{
    public static CarjamImportResult Ok(VehicleEntity vehicle, int affectedRows)
        => new(true, null, vehicle, affectedRows);

    public static CarjamImportResult Fail(string error)
        => new(false, error, null, 0);
}
