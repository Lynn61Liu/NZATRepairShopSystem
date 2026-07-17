using System.Diagnostics;
using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.DTOs;
using Workshop.Api.Models;

namespace Workshop.Api.Services;

public sealed class NewJobCreationService
{
    private const string JobsListVersionCacheKey = "jobs:list:version:v1";
    private const string PaintBoardCacheKey = "jobs:paint-board:v1";
    private const string WofScheduleCacheKey = "jobs:wof-schedule:v1";
    private const string PoUnreadSummaryCacheKey = "jobs:po-unread-summary:v1";
    private static readonly TimeSpan JobsListVersionCacheDuration = TimeSpan.FromDays(30);

    private readonly AppDbContext _db;
    private readonly IAppCache _cache;
    private readonly ReferenceDataCacheService _referenceDataCache;
    private readonly InvoiceOutboxService _invoiceOutboxService;
    private readonly InvoiceOutboxKickService _invoiceOutboxKickService;
    private readonly NztaAutoSyncQueue _nztaAutoSyncQueue;
    private readonly ILogger<NewJobCreationService> _logger;

    public NewJobCreationService(
        AppDbContext db,
        IAppCache cache,
        ReferenceDataCacheService referenceDataCache,
        InvoiceOutboxService invoiceOutboxService,
        InvoiceOutboxKickService invoiceOutboxKickService,
        NztaAutoSyncQueue nztaAutoSyncQueue,
        ILogger<NewJobCreationService> logger)
    {
        _db = db;
        _cache = cache;
        _referenceDataCache = referenceDataCache;
        _invoiceOutboxService = invoiceOutboxService;
        _invoiceOutboxKickService = invoiceOutboxKickService;
        _nztaAutoSyncQueue = nztaAutoSyncQueue;
        _logger = logger;
    }

    public async Task<NewJobCreationResult> CreateAsync(NewJobRequest req, CancellationToken ct)
    {
        var totalStopwatch = Stopwatch.StartNew();

        if (req is null)
            throw new InvalidOperationException("Request body is required.");
        if (string.IsNullOrWhiteSpace(req.Plate))
            throw new InvalidOperationException("Plate is required.");

        var normalizedCustomerType = NormalizeCustomerType(req.Customer.Type);
        if (!IsValidCustomerType(normalizedCustomerType))
            throw new InvalidOperationException("Customer type must be Personal or Business.");
        if (!req.SkipInvoice && !req.CreateNewInvoice && string.IsNullOrWhiteSpace(req.ExistingInvoiceNumber))
            throw new InvalidOperationException("Invoice number is required when linking an existing invoice.");

        req.Customer.Type = normalizedCustomerType;
        var isBusiness = string.Equals(req.Customer.Type, "Business", StringComparison.Ordinal);
        var customerNotes = req.Customer.Notes?.Trim();
        SelectedServiceCatalogItems selectedCatalogItems;
        var resolveServicesStopwatch = Stopwatch.StartNew();
        try
        {
            selectedCatalogItems = await ResolveSelectedServiceCatalogItemsAsync(req, ct);
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

        var plate = NormalizePlate(req.Plate);
        var now = DateTime.UtcNow;
        var reservedJobId = await ReserveNextJobIdAsync(ct);
        var transactionStopwatch = Stopwatch.StartNew();
        using var tx = await _db.Database.BeginTransactionAsync(ct);

        Customer? customer = null;
        string? jobCustomerCode = null;
        if (!isBusiness)
        {
            if (req.Customer.ExistingCustomerId.HasValue)
            {
                var existingCustomer = await _db.Customers.FirstOrDefaultAsync(x => x.Id == req.Customer.ExistingCustomerId.Value, ct);
                if (existingCustomer is null)
                    throw new InvalidOperationException("Selected customer was not found.");
                if (!string.Equals(existingCustomer.Type, "Personal", StringComparison.Ordinal))
                    throw new InvalidOperationException("Selected customer is not a personal customer.");

                if (!string.IsNullOrWhiteSpace(customerNotes))
                    existingCustomer.Notes = customerNotes;

                jobCustomerCode = existingCustomer.BusinessCode;
                customer = null;
            }
            else
            {
                customer = BuildCustomer(req.Customer);
                jobCustomerCode = customer.BusinessCode;
            }
        }

        long? jobCustomerId = req.Customer.ExistingCustomerId ?? customer?.Id;
        if (isBusiness)
        {
            if (string.IsNullOrWhiteSpace(req.BusinessId) || !long.TryParse(req.BusinessId, out var businessCustomerId))
                throw new InvalidOperationException("Business customer id is required.");

            var businessCustomer = await _db.Customers.FirstOrDefaultAsync(x => x.Id == businessCustomerId, ct);
            if (businessCustomer is null)
                throw new InvalidOperationException("Selected business customer was not found.");

            if (!string.Equals(businessCustomer.Type, "Business", StringComparison.Ordinal))
                throw new InvalidOperationException("Selected customer is not a business customer. Please reselect the merchant.");

            jobCustomerId = businessCustomerId;
            jobCustomerCode = businessCustomer.BusinessCode;
            if (!string.IsNullOrWhiteSpace(customerNotes))
                businessCustomer.Notes = customerNotes;
        }

        var vehicle = await _db.Vehicles.FirstOrDefaultAsync(x => x.Plate == plate, ct);
        if (vehicle is null)
        {
            vehicle = new Vehicle
            {
                Plate = plate,
                Customer = customer,
                CustomerId = customer is null ? jobCustomerId : null,
                UpdatedAt = now,
            };
        }

        var isGryCustomer = JobPoStateService.IsGryCustomerCode(jobCustomerCode);
        var job = new Job
        {
            Id = reservedJobId,
            Status = "InProgress",
            IsUrgent = false,
            NeedsPo = (req.NeedsPo ?? false) || isGryCustomer,
            UseServiceCatalogMapping = req.UseServiceCatalogMapping,
            Vehicle = vehicle.Id > 0 ? null : vehicle,
            VehicleId = vehicle.Id > 0 ? vehicle.Id : null,
            Customer = customer,
            CustomerId = customer?.Id ?? jobCustomerId,
            Notes = req.Notes?.Trim(),
            PrivateNotes = req.PrivateNotes?.Trim(),
            CreatedAt = now,
            UpdatedAt = now,
        };

        _db.Jobs.Add(job);
        if (isGryCustomer)
        {
            _db.JobPoStates.Add(new JobPoState
            {
                JobId = job.Id,
                CorrelationId = JobPoStateService.BuildCorrelationId(job.Id),
                Status = JobPoStateService.GetInitialStatus(job.PoNumber, jobCustomerCode),
                FollowUpEnabled = true,
                CreatedAt = now,
                UpdatedAt = now,
                LastSyncedAt = now,
            });
        }

        var wofCreated = HasRequestedOrSelectedService(
            req.Services,
            "wof",
            selectedCatalogItems.RootItems,
            selectedCatalogItems.WofItems);
        var hasMech = HasRequestedOrSelectedService(
            req.Services,
            "mech",
            selectedCatalogItems.RootItems,
            selectedCatalogItems.MechItems);
        var hasPaint = HasRequestedOrSelectedService(
            req.Services,
            "paint",
            selectedCatalogItems.RootItems,
            selectedCatalogItems.PaintItems);
        var partsDescriptions = ParsePartsDescriptions(req);
        var hasPendingPostJobChanges = false;

        if (partsDescriptions.Count > 0)
        {
            foreach (var partsDescription in partsDescriptions)
            {
                _db.JobPartsServices.Add(new JobPartsService
                {
                    JobId = job.Id,
                    Description = partsDescription,
                    Status = PartsServiceStatus.PendingOrder,
                    CreatedAt = now,
                    UpdatedAt = now,
                });
            }
            hasPendingPostJobChanges = true;
        }

        var mechDescriptions = selectedCatalogItems.MechItems.Count > 0
            ? selectedCatalogItems.MechItems.Select(x => x.Name.Trim()).Where(x => !string.IsNullOrWhiteSpace(x)).ToList()
            : req.MechItems.Select(x => x?.Trim()).Where(x => !string.IsNullOrWhiteSpace(x)).Cast<string>().ToList();

        if (hasMech && mechDescriptions.Count > 0)
        {
            foreach (var item in mechDescriptions)
            {
                _db.JobMechServices.Add(new JobMechService
                {
                    JobId = job.Id,
                    Description = item,
                    Cost = null,
                    CreatedAt = now,
                    UpdatedAt = now,
                });
            }
            hasPendingPostJobChanges = true;
        }

        if (hasPaint)
        {
            var paintPanels = req.PaintPanels.HasValue && req.PaintPanels.Value > 0
                ? req.PaintPanels.Value
                : 1;
            _db.JobPaintServices.Add(new JobPaintService
            {
                JobId = job.Id,
                Status = "pending",
                CurrentStage = -1,
                Panels = paintPanels,
                CreatedAt = now,
                UpdatedAt = now,
            });
            hasPendingPostJobChanges = true;
        }

        if (req.UseServiceCatalogMapping)
        {
            var selections = BuildJobServiceSelections(hasMech, hasPaint, wofCreated, selectedCatalogItems, job.Id, now);
            if (selections.Count > 0)
            {
                _db.JobServiceSelections.AddRange(selections);
                hasPendingPostJobChanges = true;
            }
        }

        if (wofCreated)
        {
            var existingWofState = await _db.JobWofStates.FirstOrDefaultAsync(x => x.JobId == job.Id, ct);
            if (existingWofState is null)
            {
                _db.JobWofStates.Add(new JobWofState
                {
                    JobId = job.Id,
                    ManualStatus = "Todo",
                    CreatedAt = now,
                    UpdatedAt = now,
                });
            }
            else
            {
                existingWofState.UpdatedAt = now;
            }
            hasPendingPostJobChanges = true;
        }

        if (hasPendingPostJobChanges)
            await _db.SaveChangesAsync(ct);

        OutboxMessage? poOutboxMessage = null;
        if (job.NeedsPo)
        {
            poOutboxMessage = _invoiceOutboxService.BuildSyncPoStateMessage(job.Id, DateTime.UtcNow);
            _db.OutboxMessages.Add(poOutboxMessage);
        }

        OutboxMessage? invoiceOutboxMessage = null;
        if (!req.SkipInvoice)
        {
            invoiceOutboxMessage = req.CreateNewInvoice
                ? _invoiceOutboxService.BuildCreateDraftMessage(job.Id, DateTime.UtcNow)
                : _invoiceOutboxService.BuildAttachExistingMessage(job.Id, req.ExistingInvoiceNumber!, DateTime.UtcNow);
            _db.OutboxMessages.Add(invoiceOutboxMessage);
        }
        await _db.SaveChangesAsync(ct);
        jobCustomerId = job.CustomerId;

        await tx.CommitAsync(ct);
        if (isBusiness && wofCreated && vehicle.Id > 0)
            await _nztaAutoSyncQueue.EnqueueAsync(new NztaAutoSyncRequest(job.Id, vehicle.Id, vehicle.Plate), ct);
        await InvalidateJobsOverviewCachesAsync(hasPaint, wofCreated, job.NeedsPo, ct);
        transactionStopwatch.Stop();
        _logger.LogInformation(
            "New job segment {Segment} completed in {ElapsedMs} ms for job {JobId}",
            "db_transaction",
            transactionStopwatch.Elapsed.TotalMilliseconds,
            job.Id);

        if (poOutboxMessage is not null)
        {
            _logger.LogInformation(
                "New job segment {Segment} completed in {ElapsedMs} ms for job {JobId} (messageId: {MessageId})",
                "po_state_sync_enqueue",
                0,
                job.Id,
                poOutboxMessage.Id);
        }

        if (invoiceOutboxMessage is not null)
        {
            _logger.LogInformation(
                "New job segment {Segment} completed in {ElapsedMs} ms for job {JobId} (messageId: {MessageId}, mode: {Mode})",
                "invoice_outbox_enqueue",
                0,
                job.Id,
                invoiceOutboxMessage.Id,
                req.CreateNewInvoice ? "create_draft" : "attach_existing");
        }

        var coreRequestElapsedMs = totalStopwatch.Elapsed.TotalMilliseconds;
        var invoiceKickDispatchStopwatch = Stopwatch.StartNew();
        var invoiceStartedAsync = false;
        if (invoiceOutboxMessage is not null)
        {
            invoiceStartedAsync = await _invoiceOutboxService.TryStartMessageNowAsync(invoiceOutboxMessage.Id, ct);
            _invoiceOutboxKickService.Dispatch(
                invoiceOutboxMessage.Id,
                job.Id,
                "invoice_outbox_async_kick",
                alreadyStarted: invoiceStartedAsync);
        }
        invoiceKickDispatchStopwatch.Stop();
        var invoiceKickDispatchElapsedMs = invoiceKickDispatchStopwatch.Elapsed.TotalMilliseconds;

        double? poKickDispatchElapsedMs = null;
        bool? poStartedAsync = null;
        if (poOutboxMessage is not null)
        {
            var poKickDispatchStopwatch = Stopwatch.StartNew();
            poStartedAsync = await _invoiceOutboxService.TryStartMessageNowAsync(poOutboxMessage.Id, ct);
            _invoiceOutboxKickService.Dispatch(
                poOutboxMessage.Id,
                job.Id,
                "po_state_outbox_async_kick",
                alreadyStarted: poStartedAsync == true);
            poKickDispatchStopwatch.Stop();
            poKickDispatchElapsedMs = poKickDispatchStopwatch.Elapsed.TotalMilliseconds;
        }

        totalStopwatch.Stop();
        var totalResponseElapsedMs = totalStopwatch.Elapsed.TotalMilliseconds;

        _logger.LogInformation(
            "New job request completed in {ElapsedMs} ms for job {JobId}, vehicle {VehicleId}, customer {CustomerId} (core: {CoreElapsedMs} ms, invoiceKickDispatch: {InvoiceKickDispatchElapsedMs} ms, poKickDispatch: {PoKickDispatchElapsedMs} ms)",
            totalResponseElapsedMs,
            job.Id,
            vehicle.Id,
            jobCustomerId,
            coreRequestElapsedMs,
            invoiceKickDispatchElapsedMs,
            poKickDispatchElapsedMs);

        return new NewJobCreationResult(
            JobId: job.Id,
            CustomerId: jobCustomerId,
            VehicleId: vehicle.Id,
            WofCreated: wofCreated,
            InvoiceQueued: invoiceOutboxMessage is not null,
            InvoiceMode: req.SkipInvoice ? "skipped" : (req.CreateNewInvoice ? "create_draft" : "attach_existing"),
            InvoiceProcessedInline: invoiceOutboxMessage is null ? "skipped" : (invoiceStartedAsync ? "async-started" : "async-pending"),
            PoProcessedInline: poOutboxMessage is null ? null : (poStartedAsync == true ? "async-started" : "async-pending"),
            CoreRequestMs: Math.Round(coreRequestElapsedMs),
            TotalResponseMs: Math.Round(totalResponseElapsedMs),
            InvoiceImmediateKickMs: Math.Round(invoiceKickDispatchElapsedMs),
            PoImmediateKickMs: poKickDispatchElapsedMs is null ? null : Math.Round(poKickDispatchElapsedMs.Value));
    }

    public async Task<long> ResolveActiveRootServiceIdAsync(string serviceType, CancellationToken ct)
    {
        var rows = await _referenceDataCache.GetServiceCatalogItemsAsync(ct);
        var item = rows
            .Where(x => x.IsActive &&
                        string.Equals(x.Category, "root", StringComparison.OrdinalIgnoreCase) &&
                        string.Equals(x.ServiceType, serviceType, StringComparison.OrdinalIgnoreCase))
            .OrderBy(x => x.SortOrder)
            .FirstOrDefault();

        if (item is null)
            throw new InvalidOperationException($"Active root service '{serviceType}' was not found.");

        return item.Id;
    }

    private async Task InvalidateJobsOverviewCachesAsync(bool hasPaint, bool hasWof, bool needsPo, CancellationToken ct)
    {
        await _cache.SetStringAsync(
            JobsListVersionCacheKey,
            DateTime.UtcNow.Ticks.ToString(CultureInfo.InvariantCulture),
            JobsListVersionCacheDuration,
            ct);

        if (hasPaint)
            await _cache.RemoveAsync(PaintBoardCacheKey, ct);
        if (hasWof)
            await _cache.RemoveAsync(WofScheduleCacheKey, ct);
        if (needsPo)
            await _cache.RemoveAsync(PoUnreadSummaryCacheKey, ct);
    }

    private async Task<long> ReserveNextJobIdAsync(CancellationToken ct)
        => await _db.Database
            .SqlQuery<long>($"SELECT nextval(pg_get_serial_sequence('jobs', 'id')) AS \"Value\"")
            .SingleAsync(ct);

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

        return split.Count > 0 ? split : [req.PartsDescription.Trim()];
    }

    private async Task<SelectedServiceCatalogItems> ResolveSelectedServiceCatalogItemsAsync(NewJobRequest req, CancellationToken ct)
    {
        var requestedIds = req.RootServiceCatalogItemIds
            .Concat(req.WofServiceCatalogItemIds)
            .Concat(req.MechServiceCatalogItemIds)
            .Concat(req.PaintServiceCatalogItemIds)
            .Distinct()
            .ToArray();

        if (requestedIds.Length == 0)
            return new SelectedServiceCatalogItems([], [], [], []);

        var items = await _referenceDataCache.GetServiceCatalogItemsByIdsAsync(requestedIds, ct);

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
            MapIds(req.WofServiceCatalogItemIds, "child", "wof", "WOF service"),
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

        if (hasWof)
        {
            if (selectedCatalogItems.WofItems.Count > 0)
                selections.AddRange(selectedCatalogItems.WofItems.Select(x => BuildJobServiceSelection(jobId, x, now)));
            else if (rootByType.TryGetValue("wof", out var wofRoot))
                selections.Add(BuildJobServiceSelection(jobId, wofRoot, now));
        }

        if (hasMech)
        {
            if (selectedCatalogItems.MechItems.Count > 0)
                selections.AddRange(selectedCatalogItems.MechItems.Select(x => BuildJobServiceSelection(jobId, x, now)));
            else if (rootByType.TryGetValue("mech", out var mechRoot))
                selections.Add(BuildJobServiceSelection(jobId, mechRoot, now));
        }

        if (hasPaint)
        {
            if (selectedCatalogItems.PaintItems.Count > 0)
                selections.AddRange(selectedCatalogItems.PaintItems.Select(x => BuildJobServiceSelection(jobId, x, now)));
            else if (rootByType.TryGetValue("paint", out var paintRoot))
                selections.Add(BuildJobServiceSelection(jobId, paintRoot, now));
        }

        return selections;
    }

    private static bool HasRequestedOrSelectedService(
        IEnumerable<string>? requestedServices,
        string serviceType,
        IEnumerable<ServiceCatalogItem> rootItems,
        IReadOnlyCollection<ServiceCatalogItem> childItems)
    {
        return requestedServices?.Any(s => string.Equals(s, serviceType, StringComparison.OrdinalIgnoreCase)) == true
            || childItems.Count > 0
            || rootItems.Any(x => string.Equals(x.ServiceType, serviceType, StringComparison.OrdinalIgnoreCase));
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

    private static Customer BuildCustomer(NewJobRequest.CustomerInput input)
    {
        return new Customer
        {
            Type = input.Type,
            Name = string.IsNullOrWhiteSpace(input.Name) ? (input.Notes ?? "") : input.Name,
            Phone = input.Phone,
            Email = input.Email,
            Address = input.Address,
            BusinessCode = "WI",
            Notes = input.Notes?.Trim(),
        };
    }

    private static string NormalizePlate(string plate)
        => new(plate.Trim().ToUpperInvariant().Where(char.IsLetterOrDigit).ToArray());

    private sealed record SelectedServiceCatalogItems(
        IReadOnlyList<ServiceCatalogItem> RootItems,
        IReadOnlyList<ServiceCatalogItem> WofItems,
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

public sealed record NewJobCreationResult(
    long JobId,
    long? CustomerId,
    long VehicleId,
    bool WofCreated,
    bool InvoiceQueued,
    string InvoiceMode,
    string InvoiceProcessedInline,
    string? PoProcessedInline,
    double CoreRequestMs,
    double TotalResponseMs,
    double InvoiceImmediateKickMs,
    double? PoImmediateKickMs);
