using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.DTOs;
using Workshop.Api.Models;
using Workshop.Api.Services;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/newJob")]
public class NewJobController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly JobPoStateService _jobPoStateService;
    private readonly JobInvoiceService _jobInvoiceService;
    private readonly ILogger<NewJobController> _logger;

    public NewJobController(
        AppDbContext db,
        JobPoStateService jobPoStateService,
        JobInvoiceService jobInvoiceService,
        ILogger<NewJobController> logger)
    {
        _db = db;
        _jobPoStateService = jobPoStateService;
        _jobInvoiceService = jobInvoiceService;
        _logger = logger;
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] NewJobRequest req, CancellationToken ct)
    {
        var totalStopwatch = Stopwatch.StartNew();

        if (req is null)
            return BadRequest(new { error = "Request body is required." });

        if (string.IsNullOrWhiteSpace(req.Plate))
            return BadRequest(new { error = "Plate is required." });

        var normalizedCustomerType = NormalizeCustomerType(req.Customer.Type);
        if (!IsValidCustomerType(normalizedCustomerType))
            return BadRequest(new { error = "Customer type must be Personal or Business." });

        req.Customer.Type = normalizedCustomerType;
        var isBusiness = string.Equals(req.Customer.Type, "Business", StringComparison.Ordinal);
        var customerNotes = req.Customer.Notes?.Trim();
        SelectedServiceCatalogItems selectedCatalogItems;
        var resolveServicesStopwatch = Stopwatch.StartNew();
        try
        {
            selectedCatalogItems = await ResolveSelectedServiceCatalogItemsAsync(req, ct);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        finally
        {
            resolveServicesStopwatch.Stop();
            _logger.LogInformation(
                "New job segment {Segment} completed in {ElapsedMs} ms for plate {Plate}",
                "resolve_service_catalog",
                resolveServicesStopwatch.Elapsed.TotalMilliseconds,
                req.Plate);
        }

        var now = DateTime.UtcNow;
        var transactionStopwatch = Stopwatch.StartNew();
        using var tx = await _db.Database.BeginTransactionAsync(ct);

        Customer? customer = null;
        if (!isBusiness)
            customer = await UpsertCustomerAsync(req.Customer, ct);

        long? jobCustomerId = customer?.Id;
        if (isBusiness)
        {
            if (string.IsNullOrWhiteSpace(req.BusinessId) || !long.TryParse(req.BusinessId, out var businessCustomerId))
                return BadRequest(new { error = "Business customer id is required." });
            jobCustomerId = businessCustomerId;
            if (!string.IsNullOrWhiteSpace(customerNotes))
            {
                var businessCustomer = await _db.Customers.FirstOrDefaultAsync(
                    x => x.Id == businessCustomerId,
                    ct
                );
                if (businessCustomer is not null)
                {
                    businessCustomer.Notes = customerNotes;
                }
            }
        }
        var plate = NormalizePlate(req.Plate);
        var vehicle = await _db.Vehicles.FirstOrDefaultAsync(x => x.Plate == plate, ct);

        if (vehicle is null)
        {
            vehicle = new Vehicle
            {
                Plate = plate,
                CustomerId = customer?.Id,
                UpdatedAt = now,
            };
            _db.Vehicles.Add(vehicle);
            await _db.SaveChangesAsync(ct);
        }

        var job = new Job
        {
            Status = "InProgress",
            IsUrgent = false,
            NeedsPo = req.NeedsPo ?? false,
            UseServiceCatalogMapping = req.UseServiceCatalogMapping,
            VehicleId = vehicle.Id,
            CustomerId = jobCustomerId,
            Notes = req.Notes?.Trim(),
            CreatedAt = now,
            UpdatedAt = now,
        };

        _db.Jobs.Add(job);
        await _db.SaveChangesAsync(ct);

        var wofCreated = req.Services?.Any(s => string.Equals(s, "wof", StringComparison.OrdinalIgnoreCase)) == true;
        var hasMech = req.Services?.Any(s => string.Equals(s, "mech", StringComparison.OrdinalIgnoreCase)) == true;
        var hasPaint = req.Services?.Any(s => string.Equals(s, "paint", StringComparison.OrdinalIgnoreCase)) == true;
        var partsDescriptions = ParsePartsDescriptions(req);


        if (partsDescriptions.Count > 0)
        {
            foreach (var partsDescription in partsDescriptions)

            {
                //   Console.WriteLine(partsDescription);
                var partsService = new JobPartsService
                {
                    JobId = job.Id,
                    Description = partsDescription,
                    Status = PartsServiceStatus.PendingOrder,
                    CreatedAt = now,
                    UpdatedAt = now,
                };
                _db.JobPartsServices.Add(partsService);
            }
            // await _db.SaveChangesAsync(ct);
            try
{
    await _db.SaveChangesAsync(ct);
    Console.WriteLine($"parts save ok, count={partsDescriptions.Count}");
}
catch (Exception ex)
{
    Console.WriteLine($"parts save failed: {ex}");
    throw;
}

        }

        var mechDescriptions = selectedCatalogItems.MechItems.Count > 0
            ? selectedCatalogItems.MechItems.Select(x => x.Name.Trim()).Where(x => !string.IsNullOrWhiteSpace(x)).ToList()
            : req.MechItems.Select(x => x?.Trim()).Where(x => !string.IsNullOrWhiteSpace(x)).Cast<string>().ToList();

        if (hasMech && mechDescriptions.Count > 0)
        {
            foreach (var item in mechDescriptions)
            {
                var mechService = new JobMechService
                {
                    JobId = job.Id,
                    Description = item,
                    Cost = null,
                    CreatedAt = now,
                    UpdatedAt = now,
                };
                _db.JobMechServices.Add(mechService);
            }
            await _db.SaveChangesAsync(ct);
        }

        if (hasPaint)
        {
            var paintPanels = req.PaintPanels.HasValue && req.PaintPanels.Value > 0
                ? req.PaintPanels.Value
                : 1;
            var paintService = new JobPaintService
            {
                JobId = job.Id,
                Status = "pending",
                CurrentStage = -1,
                Panels = paintPanels,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            };
            _db.JobPaintServices.Add(paintService);
            await _db.SaveChangesAsync(ct);
        }

        if (wofCreated)
        {
            var existingWofRecord = await _db.JobWofRecords.AsNoTracking()
                .AnyAsync(x => x.JobId == job.Id, ct);

            if (!existingWofRecord)
            {
                var makeModel = string.Join(' ', new[] { vehicle.Make, vehicle.Model }
                    .Where(x => !string.IsNullOrWhiteSpace(x))
                    .Select(x => x!.Trim()));

                _db.JobWofRecords.Add(new JobWofRecord
                {
                    JobId = job.Id,
                    OccurredAt = now,
                    Rego = vehicle.Plate,
                    MakeModel = string.IsNullOrWhiteSpace(makeModel) ? null : makeModel,
                    Odo = vehicle.Odometer?.ToString(),
                    RecordState = WofRecordState.Pass,
                    IsNewWof = true,
                    OrganisationName = "Workshop",
                    ExcelRowNo = 0,
                    SourceFile = "new-job",
                    Note = "Auto-created from new job WOF service selection.",
                    WofUiState = WofUiState.Pass,
                    ImportedAt = now,
                    UpdatedAt = now,
                });
                await _db.SaveChangesAsync(ct);
            }
        }

        if (req.UseServiceCatalogMapping)
        {
            var selections = BuildJobServiceSelections(
                hasMech,
                hasPaint,
                wofCreated,
                selectedCatalogItems,
                job.Id,
                now);
            if (selections.Count > 0)
            {
                _db.JobServiceSelections.AddRange(selections);
                await _db.SaveChangesAsync(ct);
            }
        }

        await tx.CommitAsync(ct);
        transactionStopwatch.Stop();
        _logger.LogInformation(
            "New job segment {Segment} completed in {ElapsedMs} ms for job {JobId}",
            "db_transaction",
            transactionStopwatch.Elapsed.TotalMilliseconds,
            job.Id);

        if (job.NeedsPo)
        {
            var poSyncStopwatch = Stopwatch.StartNew();
            await _jobPoStateService.SyncStateForJobAsync(job.Id, ct);
            poSyncStopwatch.Stop();
            _logger.LogInformation(
                "New job segment {Segment} completed in {ElapsedMs} ms for job {JobId}",
                "po_state_sync",
                poSyncStopwatch.Elapsed.TotalMilliseconds,
                job.Id);
        }

        var invoiceStopwatch = Stopwatch.StartNew();
        var invoiceResult = await _jobInvoiceService.CreateDraftForJobAsync(job.Id, ct);
        invoiceStopwatch.Stop();
        _logger.LogInformation(
            "New job segment {Segment} completed in {ElapsedMs} ms for job {JobId} (ok: {Ok}, alreadyExists: {AlreadyExists})",
            "invoice_draft_create",
            invoiceStopwatch.Elapsed.TotalMilliseconds,
            job.Id,
            invoiceResult.Ok,
            invoiceResult.AlreadyExists);

        totalStopwatch.Stop();
        _logger.LogInformation(
            "New job request completed in {ElapsedMs} ms for job {JobId}, vehicle {VehicleId}, customer {CustomerId}",
            totalStopwatch.Elapsed.TotalMilliseconds,
            job.Id,
            vehicle.Id,
            jobCustomerId);

        return Ok(new
        {
            jobId = job.Id,
            customerId = jobCustomerId,
            vehicleId = vehicle.Id,
            wofCreated,
            invoiceCreated = invoiceResult.Ok,
            invoiceAlreadyExists = invoiceResult.AlreadyExists,
            invoiceError = invoiceResult.Ok ? null : invoiceResult.Error,
        });
    }

    private static List<string> ParsePartsDescriptions(NewJobRequest req)
    {
        var fromArray = (req.PartsDescriptions ?? new List<string>())
            .Select(x => x?.Trim())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Cast<string>()
            .ToList();

        if (fromArray.Count > 0)
            return fromArray;

        if (string.IsNullOrWhiteSpace(req.PartsDescription))
            return new List<string>();

        var split = req.PartsDescription
            .Split(new[] { '\n', '\r', ',', '，', ';', '；', '、', '/' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(x => x.Trim())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .ToList();

        if (split.Count > 0)
            return split;

        return new List<string> { req.PartsDescription.Trim() };
    }

    private async Task<SelectedServiceCatalogItems> ResolveSelectedServiceCatalogItemsAsync(NewJobRequest req, CancellationToken ct)
    {
        var requestedIds = req.RootServiceCatalogItemIds
            .Concat(req.MechServiceCatalogItemIds)
            .Concat(req.PaintServiceCatalogItemIds)
            .Distinct()
            .ToArray();

        if (requestedIds.Length == 0)
            return new SelectedServiceCatalogItems([], [], []);

        var items = await _db.ServiceCatalogItems.AsNoTracking()
            .Where(x => requestedIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, ct);

        List<ServiceCatalogItem> MapIds(IEnumerable<long> ids, string category, string? serviceType, string label)
        {
            var mapped = new List<ServiceCatalogItem>();
            foreach (var id in ids.Distinct())
            {
                if (!items.TryGetValue(id, out var item))
                    throw new InvalidOperationException($"{label} '{id}' is invalid.");
                if (!string.Equals(item.Category, category, StringComparison.OrdinalIgnoreCase))
                    throw new InvalidOperationException($"{label} '{id}' has invalid category.");
                if (!string.IsNullOrWhiteSpace(serviceType) &&
                    !string.Equals(item.ServiceType, serviceType, StringComparison.OrdinalIgnoreCase))
                {
                    throw new InvalidOperationException($"{label} '{id}' has invalid service type.");
                }

                mapped.Add(item);
            }

            return mapped;
        }

        return new SelectedServiceCatalogItems(
            MapIds(req.RootServiceCatalogItemIds, "root", null, "Root service"),
            MapIds(req.MechServiceCatalogItemIds, "child", "mech", "Mech service"),
            MapIds(req.PaintServiceCatalogItemIds, "child", "paint", "Paint service"));
    }

    private static List<JobServiceSelection> BuildJobServiceSelections(
        bool hasMech,
        bool hasPaint,
        bool hasWof,
        SelectedServiceCatalogItems selectedCatalogItems,
        long jobId,
        DateTime now)
    {
        var selections = new List<JobServiceSelection>();
        var rootByType = selectedCatalogItems.RootItems
            .GroupBy(x => x.ServiceType, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(x => x.Key, x => x.First(), StringComparer.OrdinalIgnoreCase);

        if (hasWof && rootByType.TryGetValue("wof", out var wofRoot))
        {
            selections.Add(BuildJobServiceSelection(jobId, wofRoot, now));
        }

        if (hasMech)
        {
            if (selectedCatalogItems.MechItems.Count > 0)
            {
                selections.AddRange(selectedCatalogItems.MechItems.Select(x => BuildJobServiceSelection(jobId, x, now)));
            }
            else if (rootByType.TryGetValue("mech", out var mechRoot))
            {
                selections.Add(BuildJobServiceSelection(jobId, mechRoot, now));
            }
        }

        if (hasPaint)
        {
            if (selectedCatalogItems.PaintItems.Count > 0)
            {
                selections.AddRange(selectedCatalogItems.PaintItems.Select(x => BuildJobServiceSelection(jobId, x, now)));
            }
            else if (rootByType.TryGetValue("paint", out var paintRoot))
            {
                selections.Add(BuildJobServiceSelection(jobId, paintRoot, now));
            }
        }

        return selections;
    }

    private static JobServiceSelection BuildJobServiceSelection(long jobId, ServiceCatalogItem item, DateTime now) =>
        new()
        {
            JobId = jobId,
            ServiceCatalogItemId = item.Id,
            ServiceNameSnapshot = item.Name.Trim(),
            CreatedAt = now,
            UpdatedAt = now,
        };

    private async Task<Customer> UpsertCustomerAsync(NewJobRequest.CustomerInput input, CancellationToken ct)
    {
        // var isBusiness = string.Equals(input.Type, "Business", StringComparison.Ordinal);
        Customer? existing = null;
        if (!string.IsNullOrWhiteSpace(input.Phone))
        {
            existing = await _db.Customers.FirstOrDefaultAsync(x => x.Phone == input.Phone, ct);
            
        }

     
            existing = new Customer
            {
                Type = input.Type,
            Name = string.IsNullOrWhiteSpace(input.Name) ? (input.Notes ?? "") : input.Name,
            Phone = input.Phone,
            Email = input.Email,
            Address = input.Address,
            BusinessCode = "WI",
            Notes = input.Notes?.Trim(),
        };
           _db.Customers.Add(existing);
        

        await _db.SaveChangesAsync(ct);
        
        return existing;
    }

    private static string NormalizePlate(string plate)
        => new string(plate.Trim().ToUpperInvariant().Where(char.IsLetterOrDigit).ToArray());

    private sealed record SelectedServiceCatalogItems(
        IReadOnlyList<ServiceCatalogItem> RootItems,
        IReadOnlyList<ServiceCatalogItem> MechItems,
        IReadOnlyList<ServiceCatalogItem> PaintItems);

    private static string NormalizeCustomerType(string? type)
    {
        var trimmed = type?.Trim() ?? "";
        if (string.Equals(trimmed, "personal", StringComparison.OrdinalIgnoreCase))
            return "Personal";
        if (string.Equals(trimmed, "business", StringComparison.OrdinalIgnoreCase))
            return "Business";
        return trimmed;
    }

    private static bool IsValidCustomerType(string type)
        => string.Equals(type, "Personal", StringComparison.Ordinal) ||
           string.Equals(type, "Business", StringComparison.Ordinal);
}
