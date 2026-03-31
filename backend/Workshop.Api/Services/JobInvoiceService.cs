using System.Diagnostics;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.DTOs;
using Workshop.Api.Models;
using Workshop.Api.Options;

namespace Workshop.Api.Services;

public sealed class JobInvoiceService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly AppDbContext _db;
    private readonly XeroInvoiceService _xeroInvoiceService;
    private readonly XeroPaymentService _xeroPaymentService;
    private readonly XeroPaymentOptions _xeroPaymentOptions;
    private readonly ILogger<JobInvoiceService> _logger;

    public JobInvoiceService(
        AppDbContext db,
        XeroInvoiceService xeroInvoiceService,
        XeroPaymentService xeroPaymentService,
        Microsoft.Extensions.Options.IOptions<XeroPaymentOptions> xeroPaymentOptions,
        ILogger<JobInvoiceService> logger)
    {
        _db = db;
        _xeroInvoiceService = xeroInvoiceService;
        _xeroPaymentService = xeroPaymentService;
        _xeroPaymentOptions = xeroPaymentOptions.Value;
        _logger = logger;
    }

    public sealed record ServiceSelectionSnapshot(long ServiceCatalogItemId, string ServiceNameSnapshot);

    public async Task<JobInvoiceCreateResult> CreateDraftForJobAsync(long jobId, CancellationToken ct)
    {
        try
        {
            var totalStopwatch = Stopwatch.StartNew();

            var existingLookupStopwatch = Stopwatch.StartNew();
            var existing = await _db.JobInvoices.AsNoTracking().FirstOrDefaultAsync(x => x.JobId == jobId, ct);
            existingLookupStopwatch.Stop();
            _logger.LogInformation(
                "Job invoice segment {Segment} completed in {ElapsedMs} ms for job {JobId}",
                "existing_lookup",
                existingLookupStopwatch.Elapsed.TotalMilliseconds,
                jobId);
            if (existing is not null)
            {
                totalStopwatch.Stop();
                _logger.LogInformation(
                    "Job invoice draft creation completed in {ElapsedMs} ms for job {JobId} (ok: {Ok}, alreadyExists: {AlreadyExists})",
                    totalStopwatch.Elapsed.TotalMilliseconds,
                    jobId,
                    true,
                    true);
                return JobInvoiceCreateResult.Success(existing, alreadyExists: true);
            }

            var dataLoadStopwatch = Stopwatch.StartNew();
            var row = await (
                    from j in _db.Jobs.AsNoTracking()
                    join v in _db.Vehicles.AsNoTracking() on j.VehicleId equals v.Id
                    join c in _db.Customers.AsNoTracking() on j.CustomerId equals c.Id
                    where j.Id == jobId
                    select new
                    {
                        Job = j,
                        Vehicle = v,
                        Customer = c,
                    }
                )
                .FirstOrDefaultAsync(ct);

            if (row is null)
            {
                totalStopwatch.Stop();
                _logger.LogInformation(
                    "Job invoice draft creation completed in {ElapsedMs} ms for job {JobId} (ok: {Ok}, alreadyExists: {AlreadyExists})",
                    totalStopwatch.Elapsed.TotalMilliseconds,
                    jobId,
                    false,
                    false);
                return JobInvoiceCreateResult.Fail(404, "Job not found.");
            }

            var partsServices = await _db.JobPartsServices.AsNoTracking()
                .Where(x => x.JobId == jobId)
                .OrderBy(x => x.CreatedAt)
                .ToListAsync(ct);
            var paintService = await _db.JobPaintServices.AsNoTracking()
                .Where(x => x.JobId == jobId)
                .OrderBy(x => x.CreatedAt)
                .FirstOrDefaultAsync(ct);
            var serviceSelections = await _db.JobServiceSelections.AsNoTracking()
                .Where(x => x.JobId == jobId)
                .OrderBy(x => x.CreatedAt)
                .ThenBy(x => x.Id)
                .ToListAsync(ct);
            dataLoadStopwatch.Stop();
            _logger.LogInformation(
                "Job invoice segment {Segment} completed in {ElapsedMs} ms for job {JobId}",
                "load_job_data",
                dataLoadStopwatch.Elapsed.TotalMilliseconds,
                jobId);

            CreateXeroInvoiceRequest request;
            var requestBuildStopwatch = Stopwatch.StartNew();
            try
            {
                request = await BuildCatalogMappedCreateRequestAsync(
                    row.Job,
                    row.Customer,
                    row.Vehicle,
                    serviceSelections,
                    partsServices,
                    paintService,
                    ct);
                request.LineItems = await SanitizeLineItemsAsync(request.LineItems, ct);
            }
            catch (InvalidOperationException ex)
            {
                totalStopwatch.Stop();
                _logger.LogInformation(
                    "Job invoice draft creation completed in {ElapsedMs} ms for job {JobId} (ok: {Ok}, alreadyExists: {AlreadyExists})",
                    totalStopwatch.Elapsed.TotalMilliseconds,
                    jobId,
                    false,
                    false);
                return JobInvoiceCreateResult.Fail(400, ex.Message);
            }

            requestBuildStopwatch.Stop();
            _logger.LogInformation(
                "Job invoice segment {Segment} completed in {ElapsedMs} ms for job {JobId}",
                "build_request",
                requestBuildStopwatch.Elapsed.TotalMilliseconds,
                jobId);

            var xeroCreateStopwatch = Stopwatch.StartNew();
            var createResult = await _xeroInvoiceService.CreateInvoiceAsync(
                request,
                new XeroInvoiceCreateOptions
                {
                    SummarizeErrors = true,
                },
                ct);
            xeroCreateStopwatch.Stop();
            _logger.LogInformation(
                "Job invoice segment {Segment} completed in {ElapsedMs} ms for job {JobId} (ok: {Ok}, statusCode: {StatusCode})",
                "xero_create_invoice",
                xeroCreateStopwatch.Elapsed.TotalMilliseconds,
                jobId,
                createResult.Ok,
                createResult.StatusCode);

            if (!createResult.Ok)
            {
                totalStopwatch.Stop();
                _logger.LogInformation(
                    "Job invoice draft creation completed in {ElapsedMs} ms for job {JobId} (ok: {Ok}, alreadyExists: {AlreadyExists})",
                    totalStopwatch.Elapsed.TotalMilliseconds,
                    jobId,
                    false,
                    false);
                return JobInvoiceCreateResult.Fail(
                    createResult.StatusCode,
                    createResult.Error ?? "Failed to create Xero draft invoice.",
                    createResult.Payload,
                    request,
                    createResult.RefreshToken,
                    createResult.RefreshTokenUpdated,
                    createResult.Scope,
                    createResult.ExpiresIn);
            }

            var persistStopwatch = Stopwatch.StartNew();
            var jobInvoice = BuildJobInvoice(jobId, request, createResult.Payload, createResult.TenantId);
            _db.JobInvoices.Add(jobInvoice);
            await _db.SaveChangesAsync(ct);
            persistStopwatch.Stop();
            _logger.LogInformation(
                "Job invoice segment {Segment} completed in {ElapsedMs} ms for job {JobId}",
                "persist_invoice",
                persistStopwatch.Elapsed.TotalMilliseconds,
                jobId);

            totalStopwatch.Stop();
            _logger.LogInformation(
                "Job invoice draft creation completed in {ElapsedMs} ms for job {JobId} (ok: {Ok}, alreadyExists: {AlreadyExists})",
                totalStopwatch.Elapsed.TotalMilliseconds,
                jobId,
                true,
                false);

            return JobInvoiceCreateResult.Success(
                jobInvoice,
                alreadyExists: false,
                payload: createResult.Payload,
                requestBody: request,
                refreshToken: createResult.RefreshToken,
                refreshTokenUpdated: createResult.RefreshTokenUpdated,
                scope: createResult.Scope,
                expiresIn: createResult.ExpiresIn);
        }
        catch
        {
            _logger.LogWarning(
                "Job invoice draft creation threw an exception for job {JobId}",
                jobId);
            throw;
        }
    }

    public async Task<JobInvoiceCreateResult> SyncDraftForJobAsync(long jobId, SyncJobInvoiceDraftRequest payload, CancellationToken ct)
    {
        var jobInvoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (jobInvoice is null)
            return JobInvoiceCreateResult.Fail(404, "Job invoice not found.");

        if (string.IsNullOrWhiteSpace(jobInvoice.ExternalInvoiceId) || !Guid.TryParse(jobInvoice.ExternalInvoiceId, out var invoiceId))
            return JobInvoiceCreateResult.Fail(400, "Missing Xero invoice id for sync.");

        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == jobId, ct);
        if (job is null)
            return JobInvoiceCreateResult.Fail(404, "Job not found.");

        if (payload.LineItems.Count == 0)
            return JobInvoiceCreateResult.Fail(400, "At least one invoice line item is required.");

        var request = new CreateXeroInvoiceRequest
        {
            InvoiceId = invoiceId,
            Type = "ACCREC",
            Status = string.IsNullOrWhiteSpace(payload.Status) ? (jobInvoice.ExternalStatus ?? "DRAFT") : payload.Status.Trim(),
            LineAmountTypes = string.IsNullOrWhiteSpace(payload.LineAmountTypes) ? "Inclusive" : payload.LineAmountTypes.Trim(),
            Date = payload.Date ?? jobInvoice.InvoiceDate ?? DateOnly.FromDateTime(DateTime.UtcNow),
            Reference = string.IsNullOrWhiteSpace(payload.Reference) ? jobInvoice.Reference : payload.Reference.Trim(),
            Contact = new XeroInvoiceContactInput
            {
                Name = string.IsNullOrWhiteSpace(payload.ContactName) ? jobInvoice.ContactName : payload.ContactName.Trim(),
            },
            LineItems = await SanitizeLineItemsAsync(payload.LineItems, ct),
        };
        var normalizedInvoiceNote = string.IsNullOrWhiteSpace(payload.InvoiceNote) ? null : payload.InvoiceNote.Trim();

        if (request.LineItems.Count == 0)
            return JobInvoiceCreateResult.Fail(400, "At least one invoice line item is required.");

        var syncResult = await _xeroInvoiceService.CreateInvoiceAsync(
            request,
            new XeroInvoiceCreateOptions
            {
                SummarizeErrors = true,
            },
            ct);

        if (!syncResult.Ok)
        {
            return JobInvoiceCreateResult.Fail(
                syncResult.StatusCode,
                syncResult.Error ?? "Failed to sync Xero draft invoice.",
                syncResult.Payload,
                request,
                syncResult.RefreshToken,
                syncResult.RefreshTokenUpdated,
                syncResult.Scope,
                syncResult.ExpiresIn);
        }

        ApplyInvoiceUpdate(jobInvoice, request, syncResult.Payload, syncResult.TenantId);
        jobInvoice.InvoiceNote = normalizedInvoiceNote;
        job.InvoiceReference = request.Reference;
        job.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return JobInvoiceCreateResult.Success(
            jobInvoice,
            alreadyExists: false,
            payload: syncResult.Payload,
            requestBody: request,
            refreshToken: syncResult.RefreshToken,
            refreshTokenUpdated: syncResult.RefreshTokenUpdated,
            scope: syncResult.Scope,
            expiresIn: syncResult.ExpiresIn);
    }

    public async Task<JobInvoiceCreateResult> SaveDraftToDbAsync(long jobId, SaveJobInvoiceDraftRequest payload, CancellationToken ct)
    {
        var jobInvoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (jobInvoice is null)
            return JobInvoiceCreateResult.Fail(404, "Job invoice not found.");

        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == jobId, ct);
        if (job is null)
            return JobInvoiceCreateResult.Fail(404, "Job not found.");

        if (payload.LineItems.Count == 0)
            return JobInvoiceCreateResult.Fail(400, "At least one invoice line item is required.");

        var request = new CreateXeroInvoiceRequest
        {
            InvoiceId = Guid.TryParse(jobInvoice.ExternalInvoiceId, out var invoiceId) ? invoiceId : null,
            Type = "ACCREC",
            Status = jobInvoice.ExternalStatus ?? "DRAFT",
            LineAmountTypes = string.IsNullOrWhiteSpace(payload.LineAmountTypes) ? "Inclusive" : payload.LineAmountTypes.Trim(),
            Date = payload.Date ?? jobInvoice.InvoiceDate ?? DateOnly.FromDateTime(DateTime.UtcNow),
            Reference = string.IsNullOrWhiteSpace(payload.Reference) ? jobInvoice.Reference : payload.Reference.Trim(),
            Contact = new XeroInvoiceContactInput
            {
                Name = string.IsNullOrWhiteSpace(payload.ContactName) ? jobInvoice.ContactName : payload.ContactName.Trim(),
            },
            LineItems = await SanitizeLineItemsAsync(payload.LineItems, ct),
        };
        var normalizedInvoiceNote = string.IsNullOrWhiteSpace(payload.InvoiceNote) ? null : payload.InvoiceNote.Trim();

        if (request.LineItems.Count == 0)
            return JobInvoiceCreateResult.Fail(400, "At least one invoice line item is required.");

        jobInvoice.Reference = request.Reference;
        jobInvoice.ContactName = request.Contact.Name;
        jobInvoice.InvoiceNote = normalizedInvoiceNote;
        jobInvoice.InvoiceDate = request.Date;
        jobInvoice.LineAmountTypes = request.LineAmountTypes;
        jobInvoice.RequestPayloadJson = JsonSerializer.Serialize(request, JsonOptions);
        jobInvoice.UpdatedAt = DateTime.UtcNow;

        job.InvoiceReference = request.Reference;
        job.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);

        return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true, requestBody: request);
    }

    public async Task<JobInvoiceCreateResult> AttachExistingXeroInvoiceAsync(long jobId, string invoiceNumber, CancellationToken ct)
    {
        var normalizedInvoiceNumber = invoiceNumber?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedInvoiceNumber))
            return JobInvoiceCreateResult.Fail(400, "Invoice number is required.");

        var existing = await _db.JobInvoices.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (existing is not null)
            return JobInvoiceCreateResult.Fail(409, "This job already has a linked invoice.");

        var jobExists = await _db.Jobs.AsNoTracking().AnyAsync(x => x.Id == jobId, ct);
        if (!jobExists)
            return JobInvoiceCreateResult.Fail(404, "Job not found.");

        var xeroLookup = await _xeroInvoiceService.GetInvoicesByNumberAsync(normalizedInvoiceNumber, ct);
        if (!xeroLookup.Ok)
        {
            return JobInvoiceCreateResult.Fail(
                xeroLookup.StatusCode,
                xeroLookup.Error ?? "Failed to find invoice in Xero.",
                xeroLookup.Payload);
        }

        var matchedInvoices = ExtractInvoiceSummaries(xeroLookup.Payload)
            .Where(x => string.Equals(x.InvoiceNumber, normalizedInvoiceNumber, StringComparison.OrdinalIgnoreCase))
            .ToList();

        if (matchedInvoices.Count == 0)
            return JobInvoiceCreateResult.Fail(404, $"Invoice '{normalizedInvoiceNumber}' was not found in Xero.");

        if (matchedInvoices.Count > 1)
            return JobInvoiceCreateResult.Fail(409, $"Multiple Xero invoices matched '{normalizedInvoiceNumber}'.");

        var matchedInvoice = matchedInvoices[0];
        if (string.IsNullOrWhiteSpace(matchedInvoice.InvoiceId) || !Guid.TryParse(matchedInvoice.InvoiceId, out var invoiceId))
        {
            return JobInvoiceCreateResult.Fail(502, "Xero returned an invoice without a valid InvoiceID.", xeroLookup.Payload);
        }

        var linkedInvoice = await _db.JobInvoices.AsNoTracking()
            .FirstOrDefaultAsync(x => x.ExternalInvoiceId == invoiceId.ToString(), ct);
        if (linkedInvoice is not null && linkedInvoice.JobId != jobId)
        {
            return JobInvoiceCreateResult.Fail(
                409,
                $"Invoice '{normalizedInvoiceNumber}' is already linked to job {linkedInvoice.JobId}.");
        }

        var now = DateTime.UtcNow;
        var jobInvoice = new JobInvoice
        {
            JobId = jobId,
            Provider = "xero",
            ExternalInvoiceId = invoiceId.ToString(),
            ExternalInvoiceNumber = matchedInvoice.InvoiceNumber,
            ExternalStatus = matchedInvoice.Status,
            Reference = matchedInvoice.Reference,
            ContactName = matchedInvoice.ContactName,
            InvoiceDate = matchedInvoice.Date,
            LineAmountTypes = "Exclusive",
            TenantId = xeroLookup.TenantId,
            CreatedAt = now,
            UpdatedAt = now,
        };

        _db.JobInvoices.Add(jobInvoice);
        await _db.SaveChangesAsync(ct);

        var syncResult = await SyncFromXeroInvoiceIdAsync(invoiceId, ct);
        if (!syncResult.Ok)
        {
            _db.JobInvoices.Remove(jobInvoice);
            await _db.SaveChangesAsync(ct);
            return syncResult;
        }

        return syncResult;
    }

    public async Task<JobInvoiceCreateResult> SyncFromXeroAsync(long jobId, CancellationToken ct)
    {
        var jobInvoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (jobInvoice is null)
            return JobInvoiceCreateResult.Fail(404, "Job invoice not found.");

        if (string.IsNullOrWhiteSpace(jobInvoice.ExternalInvoiceId) || !Guid.TryParse(jobInvoice.ExternalInvoiceId, out var invoiceId))
            return JobInvoiceCreateResult.Fail(400, "Missing Xero invoice id.");

        return await SyncFromXeroInvoiceIdAsync(invoiceId, ct);
    }

    public async Task<JobInvoiceCreateResult> SyncFromXeroInvoiceIdAsync(Guid invoiceId, CancellationToken ct)
    {
        var jobInvoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.ExternalInvoiceId == invoiceId.ToString(), ct);
        if (jobInvoice is null)
            return JobInvoiceCreateResult.Fail(404, "Linked job invoice not found.");

        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == jobInvoice.JobId, ct);
        if (job is null)
            return JobInvoiceCreateResult.Fail(404, "Job not found.");

        var xeroResult = await _xeroInvoiceService.GetInvoiceByIdAsync(invoiceId, ct);
        if (!xeroResult.Ok)
        {
            return JobInvoiceCreateResult.Fail(
                xeroResult.StatusCode,
                xeroResult.Error ?? "Failed to fetch invoice from Xero.",
                xeroResult.Payload);
        }

        var request = BuildRequestFromPayload(xeroResult.Payload, jobInvoice);
        ApplyInvoiceUpdate(jobInvoice, request, xeroResult.Payload, xeroResult.TenantId);
        job.InvoiceReference = jobInvoice.Reference;
        job.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true, payload: xeroResult.Payload, requestBody: request);
    }

    public async Task<JobInvoiceCreateResult> SyncWofItemsToDraftAsync(long jobId, CancellationToken ct)
    {
        var synced = await SyncFromXeroAsync(jobId, ct);
        if (!synced.Ok)
            return synced;

        var jobInvoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (jobInvoice is null)
            return JobInvoiceCreateResult.Fail(404, "Job invoice not found.");

        if (!string.Equals(jobInvoice.Provider, "xero", StringComparison.OrdinalIgnoreCase))
            return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true);

        if (!string.Equals(jobInvoice.ExternalStatus, "DRAFT", StringComparison.OrdinalIgnoreCase))
            return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true);

        var row = await (
                from j in _db.Jobs.AsNoTracking()
                join v in _db.Vehicles.AsNoTracking() on j.VehicleId equals v.Id
                join c in _db.Customers.AsNoTracking() on j.CustomerId equals c.Id
                where j.Id == jobId
                select new
                {
                    Job = j,
                    Vehicle = v,
                    Customer = c,
                }
            )
            .FirstOrDefaultAsync(ct);

        if (row is null)
            return JobInvoiceCreateResult.Fail(404, "Job not found.");

        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == jobId, ct);
        if (job is null)
            return JobInvoiceCreateResult.Fail(404, "Job not found.");

        var serviceSelections = await _db.JobServiceSelections.AsNoTracking()
            .Where(x => x.JobId == jobId)
            .OrderBy(x => x.CreatedAt)
            .ThenBy(x => x.Id)
            .ToListAsync(ct);

        var wofSelectionIds = await _db.ServiceCatalogItems.AsNoTracking()
            .Where(x => x.ServiceType == "wof")
            .Select(x => x.Id)
            .ToListAsync(ct);

        var wofSelections = serviceSelections
            .Where(x => wofSelectionIds.Contains(x.ServiceCatalogItemId))
            .ToList();

        if (wofSelections.Count == 0)
            return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true);

        var wofLineItems = await BuildCatalogMappedServiceLineItemsAsync(
            row.Customer,
            wofSelections,
            paintService: null,
            ct);

        if (wofLineItems.Count == 0)
            return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true);

        var request = BuildRequestFromPayload(jobInvoice.ResponsePayloadJson, jobInvoice);
        var existingKeys = new HashSet<string>(
            request.LineItems.Select(BuildLineItemIdentity),
            StringComparer.OrdinalIgnoreCase);

        var appended = false;
        foreach (var lineItem in wofLineItems)
        {
            var key = BuildLineItemIdentity(lineItem);
            if (existingKeys.Contains(key))
                continue;

            request.LineItems.Add(lineItem);
            existingKeys.Add(key);
            appended = true;
        }

        if (!appended)
            return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true);

        request.Status = "DRAFT";
        request.LineItems = await SanitizeLineItemsAsync(request.LineItems, ct);

        var syncResult = await _xeroInvoiceService.CreateInvoiceAsync(
            request,
            new XeroInvoiceCreateOptions
            {
                SummarizeErrors = true,
            },
            ct);

        if (!syncResult.Ok)
        {
            return JobInvoiceCreateResult.Fail(
                syncResult.StatusCode,
                syncResult.Error ?? "Failed to sync WOF item to Xero draft invoice.",
                syncResult.Payload,
                request,
                syncResult.RefreshToken,
                syncResult.RefreshTokenUpdated,
                syncResult.Scope,
                syncResult.ExpiresIn);
        }

        ApplyInvoiceUpdate(jobInvoice, request, syncResult.Payload, syncResult.TenantId);
        job.InvoiceReference = jobInvoice.Reference;
        job.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return JobInvoiceCreateResult.Success(
            jobInvoice,
            alreadyExists: true,
            payload: syncResult.Payload,
            requestBody: request,
            refreshToken: syncResult.RefreshToken,
            refreshTokenUpdated: syncResult.RefreshTokenUpdated,
            scope: syncResult.Scope,
            expiresIn: syncResult.ExpiresIn);
    }

    public async Task<JobInvoiceCreateResult> RemoveServiceItemsFromDraftAsync(
        long jobId,
        IReadOnlyList<ServiceSelectionSnapshot> selections,
        CancellationToken ct)
    {
        if (selections.Count == 0)
            return JobInvoiceCreateResult.Success(null, alreadyExists: true);

        var synced = await SyncFromXeroAsync(jobId, ct);
        if (!synced.Ok)
            return synced;

        var jobInvoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (jobInvoice is null)
            return JobInvoiceCreateResult.Fail(404, "Job invoice not found.");

        if (!string.Equals(jobInvoice.Provider, "xero", StringComparison.OrdinalIgnoreCase))
            return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true);

        if (!string.Equals(jobInvoice.ExternalStatus, "DRAFT", StringComparison.OrdinalIgnoreCase))
            return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true);

        var customer = await (
                from j in _db.Jobs.AsNoTracking()
                join c in _db.Customers.AsNoTracking() on j.CustomerId equals c.Id
                where j.Id == jobId
                select c
            )
            .FirstOrDefaultAsync(ct);

        if (customer is null)
            return JobInvoiceCreateResult.Fail(404, "Job customer not found.");

        var transientSelections = selections
            .Where(x => x.ServiceCatalogItemId > 0)
            .Select(x => new JobServiceSelection
            {
                JobId = jobId,
                ServiceCatalogItemId = x.ServiceCatalogItemId,
                ServiceNameSnapshot = x.ServiceNameSnapshot ?? "",
            })
            .ToList();

        var removalLineItems = await BuildCatalogMappedServiceLineItemsAsync(customer, transientSelections, paintService: null, ct);
        if (removalLineItems.Count == 0)
            return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true);

        var removalKeys = new HashSet<string>(removalLineItems.Select(BuildLineItemIdentity), StringComparer.OrdinalIgnoreCase);
        var request = BuildRequestFromPayload(jobInvoice.ResponsePayloadJson, jobInvoice);
        var filteredLineItems = request.LineItems
            .Where(x => !removalKeys.Contains(BuildLineItemIdentity(x)))
            .ToList();

        if (filteredLineItems.Count == request.LineItems.Count)
            return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true);

        if (filteredLineItems.Count == 0)
        {
            filteredLineItems.Add(new XeroInvoiceLineItemInput
            {
                Description = "Job draft",
                Quantity = 1m,
                UnitAmount = 0m,
            });
        }

        request.Status = "DRAFT";
        request.LineItems = await SanitizeLineItemsAsync(filteredLineItems, ct);

        var syncResult = await _xeroInvoiceService.CreateInvoiceAsync(
            request,
            new XeroInvoiceCreateOptions
            {
                SummarizeErrors = true,
            },
            ct);

        if (!syncResult.Ok)
        {
            return JobInvoiceCreateResult.Fail(
                syncResult.StatusCode,
                syncResult.Error ?? "Failed to remove service item from Xero draft invoice.",
                syncResult.Payload,
                request,
                syncResult.RefreshToken,
                syncResult.RefreshTokenUpdated,
                syncResult.Scope,
                syncResult.ExpiresIn);
        }

        ApplyInvoiceUpdate(jobInvoice, request, syncResult.Payload, syncResult.TenantId);
        await _db.SaveChangesAsync(ct);

        return JobInvoiceCreateResult.Success(
            jobInvoice,
            alreadyExists: true,
            payload: syncResult.Payload,
            requestBody: request,
            refreshToken: syncResult.RefreshToken,
            refreshTokenUpdated: syncResult.RefreshTokenUpdated,
            scope: syncResult.Scope,
            expiresIn: syncResult.ExpiresIn);
    }

    public async Task<JobInvoiceUnlinkResult> UnlinkInvoiceAsync(long jobId, CancellationToken ct)
    {
        var jobInvoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (jobInvoice is null)
            return JobInvoiceUnlinkResult.Fail(404, "Job invoice not found.");

        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == jobId, ct);
        if (job is null)
            return JobInvoiceUnlinkResult.Fail(404, "Job not found.");

        _db.JobInvoices.Remove(jobInvoice);
        job.InvoiceReference = null;
        job.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return JobInvoiceUnlinkResult.Success();
    }

    public async Task<JobInvoiceStateUpdateResult> UpdateXeroStateAsync(long jobId, UpdateJobInvoiceXeroStateRequest payload, CancellationToken ct)
    {
        var synced = await SyncFromXeroAsync(jobId, ct);
        if (!synced.Ok || synced.Invoice is null)
            return JobInvoiceStateUpdateResult.Fail(synced.StatusCode, synced.Error ?? "Failed to sync invoice from Xero.", synced.Payload);

        var jobInvoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (jobInvoice is null)
            return JobInvoiceStateUpdateResult.Fail(404, "Job invoice not found.");

        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == jobId, ct);
        if (job is null)
            return JobInvoiceStateUpdateResult.Fail(404, "Job not found.");

        var state = (payload.State ?? "").Trim().ToUpperInvariant();
        if (string.IsNullOrWhiteSpace(state))
            return JobInvoiceStateUpdateResult.Fail(400, "State is required.");

        if (string.IsNullOrWhiteSpace(jobInvoice.ExternalInvoiceId) || !Guid.TryParse(jobInvoice.ExternalInvoiceId, out var invoiceId))
            return JobInvoiceStateUpdateResult.Fail(400, "Missing Xero invoice id.");

        if (state == "DRAFT")
        {
            if (!string.Equals(jobInvoice.ExternalStatus, "DRAFT", StringComparison.OrdinalIgnoreCase))
                return JobInvoiceStateUpdateResult.Fail(400, "Xero does not allow reverting this invoice back to Draft from the system.");

            return await BuildStateUpdateResultAsync(jobInvoice, ct);
        }

        if (state == "AUTHORISED")
        {
            if (string.Equals(jobInvoice.ExternalStatus, "PAID", StringComparison.OrdinalIgnoreCase))
                return JobInvoiceStateUpdateResult.Fail(400, "This Xero invoice is already Paid.");

            if (!string.Equals(jobInvoice.ExternalStatus, "AUTHORISED", StringComparison.OrdinalIgnoreCase))
            {
                var authoriseResult = await SyncInvoiceStatusAsync(jobInvoice, "AUTHORISED", ct);
                if (!authoriseResult.Ok)
                    return JobInvoiceStateUpdateResult.Fail(authoriseResult.StatusCode, authoriseResult.Error ?? "Failed to update invoice status.", authoriseResult.Payload);

                job.InvoiceReference = jobInvoice.Reference;
                job.UpdatedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync(ct);
            }

            return await BuildStateUpdateResultAsync(jobInvoice, ct);
        }

        if (state is "PAID_CASH" or "PAID_EPOST" or "PAID_BANK_TRANSFER")
        {
            var paymentMethod = state switch
            {
                "PAID_CASH" => "cash",
                "PAID_EPOST" => "epost",
                _ => "bank_transfer",
            };

            var paymentDate = payload.PaymentDate ?? DateOnly.FromDateTime(DateTime.UtcNow);
            var amount = payload.Amount is > 0
                ? payload.Amount.Value
                : ExtractAmountDue(jobInvoice.ResponsePayloadJson)
                ?? ExtractInvoiceTotal(jobInvoice.ResponsePayloadJson)
                ?? ExtractInvoiceTotal(jobInvoice.RequestPayloadJson);
            if (amount is null || amount <= 0)
                return JobInvoiceStateUpdateResult.Fail(400, "Unable to determine invoice payment amount.");

            var targetInvoiceStatus = paymentMethod == "cash" ? "DELETED" : "AUTHORISED";
            if (paymentMethod == "cash"
                && !string.Equals(jobInvoice.ExternalStatus, "DRAFT", StringComparison.OrdinalIgnoreCase)
                && !string.Equals(jobInvoice.ExternalStatus, "DELETED", StringComparison.OrdinalIgnoreCase))
            {
                return JobInvoiceStateUpdateResult.Fail(409, "Cash can only be saved while the Xero invoice is still Draft.");
            }

            if (!string.Equals(jobInvoice.ExternalStatus, targetInvoiceStatus, StringComparison.OrdinalIgnoreCase))
            {
                var statusSyncResult = await SyncInvoiceStatusAsync(jobInvoice, targetInvoiceStatus, ct);
                if (!statusSyncResult.Ok)
                {
                    var fallbackError = paymentMethod == "cash"
                        ? "Failed to delete invoice in Xero."
                        : "Failed to update invoice status in Xero.";
                    return JobInvoiceStateUpdateResult.Fail(statusSyncResult.StatusCode, statusSyncResult.Error ?? fallbackError, statusSyncResult.Payload);
                }

                job.InvoiceReference = jobInvoice.Reference;
                job.UpdatedAt = DateTime.UtcNow;
            }

            var latestExistingPayment = await _db.JobPayments
                .Where(x => x.JobInvoiceId == jobInvoice.Id)
                .OrderByDescending(x => x.CreatedAt)
                .FirstOrDefaultAsync(ct);

            var paymentReference = FirstNonEmpty(payload.Reference, paymentMethod == "epost" ? payload.EpostReferenceId : null);
            if (latestExistingPayment is null)
            {
                var jobPayment = BuildJobPayment(
                    jobInvoice,
                    paymentMethod,
                    amount.Value,
                    paymentDate,
                    paymentReference,
                    paymentMethod == "cash" ? "DELETED" : "AUTHORISED");
                _db.JobPayments.Add(jobPayment);
            }
            else
            {
                latestExistingPayment.Method = paymentMethod;
                latestExistingPayment.Amount = amount.Value;
                latestExistingPayment.PaymentDate = paymentDate;
                latestExistingPayment.Reference = paymentReference;
                latestExistingPayment.ExternalStatus = paymentMethod == "cash" ? "DELETED" : "AUTHORISED";
                latestExistingPayment.UpdatedAt = DateTime.UtcNow;
            }

            await _db.SaveChangesAsync(ct);

            return await BuildStateUpdateResultAsync(jobInvoice, ct);
        }

        return JobInvoiceStateUpdateResult.Fail(400, $"Unsupported state '{payload.State}'.");
    }

    public async Task<JobInvoiceDeleteResult> DeleteDraftInXeroAsync(long jobId, CancellationToken ct)
    {
        var jobInvoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (jobInvoice is null)
            return JobInvoiceDeleteResult.Success(false);

        if (!string.Equals(jobInvoice.Provider, "xero", StringComparison.OrdinalIgnoreCase))
            return JobInvoiceDeleteResult.Success(false);

        if (string.Equals(jobInvoice.ExternalStatus, "DELETED", StringComparison.OrdinalIgnoreCase))
            return JobInvoiceDeleteResult.Success(true);

        if (string.IsNullOrWhiteSpace(jobInvoice.ExternalInvoiceId) || !Guid.TryParse(jobInvoice.ExternalInvoiceId, out var invoiceId))
            return JobInvoiceDeleteResult.Fail(400, "Missing Xero invoice id.");

        var remoteInvoiceResult = await _xeroInvoiceService.GetInvoiceByIdAsync(invoiceId, ct);
        if (!remoteInvoiceResult.Ok)
        {
            if (remoteInvoiceResult.StatusCode == 404)
                return JobInvoiceDeleteResult.Success(true);

            return JobInvoiceDeleteResult.Fail(
                remoteInvoiceResult.StatusCode,
                remoteInvoiceResult.Error ?? "Failed to fetch Xero invoice before delete.",
                remoteInvoiceResult.Payload);
        }

        var remoteInvoice = ExtractInvoiceSummary(remoteInvoiceResult.Payload);
        if (string.Equals(remoteInvoice.Status, "DELETED", StringComparison.OrdinalIgnoreCase))
            return JobInvoiceDeleteResult.Success(true);

        if (!string.Equals(jobInvoice.ExternalStatus, "DRAFT", StringComparison.OrdinalIgnoreCase))
        {
            return JobInvoiceDeleteResult.Fail(
                400,
                $"Only Xero draft invoices can be deleted when deleting a job. Current status: {jobInvoice.ExternalStatus ?? "UNKNOWN"}.");
        }

        var deleteResult = await SyncInvoiceStatusAsync(jobInvoice, "DELETED", ct);
        if (!deleteResult.Ok)
        {
            if (deleteResult.StatusCode == 404)
                return JobInvoiceDeleteResult.Success(true);

            return JobInvoiceDeleteResult.Fail(deleteResult.StatusCode, deleteResult.Error ?? "Failed to delete Xero draft invoice.", deleteResult.Payload);
        }

        return JobInvoiceDeleteResult.Success(true);
    }

    private async Task<JobInvoiceCreateResult> SyncInvoiceStatusAsync(JobInvoice jobInvoice, string targetStatus, CancellationToken ct)
    {
        var request = BuildRequestFromPayload(jobInvoice.ResponsePayloadJson, jobInvoice);
        request.Status = targetStatus;
        request.DueDate ??= request.Date ?? jobInvoice.InvoiceDate ?? DateOnly.FromDateTime(DateTime.UtcNow);

        var syncResult = await _xeroInvoiceService.CreateInvoiceAsync(
            request,
            new XeroInvoiceCreateOptions
            {
                SummarizeErrors = true,
            },
            ct);

        if (!syncResult.Ok)
        {
            return JobInvoiceCreateResult.Fail(syncResult.StatusCode, syncResult.Error ?? "Failed to sync Xero invoice status.", syncResult.Payload, request);
        }

        ApplyInvoiceUpdate(jobInvoice, request, syncResult.Payload, syncResult.TenantId);
        return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true, payload: syncResult.Payload, requestBody: request);
    }

    private async Task<JobInvoiceStateUpdateResult> BuildStateUpdateResultAsync(JobInvoice jobInvoice, CancellationToken ct)
    {
        var latestPayment = await _db.JobPayments.AsNoTracking()
            .Where(x => x.JobInvoiceId == jobInvoice.Id)
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefaultAsync(ct);

        return JobInvoiceStateUpdateResult.Success(jobInvoice, latestPayment);
    }

    private string? ResolvePaymentAccountCode(string method) =>
        method switch
        {
            "cash" => FirstNonEmpty(_xeroPaymentOptions.CashAccountCode, _xeroPaymentOptions.DefaultAccountCode),
            "epost" => FirstNonEmpty(_xeroPaymentOptions.EpostAccountCode, _xeroPaymentOptions.DefaultAccountCode),
            "bank_transfer" => FirstNonEmpty(_xeroPaymentOptions.BankTransferAccountCode, _xeroPaymentOptions.DefaultAccountCode),
            _ => FirstNonEmpty(_xeroPaymentOptions.DefaultAccountCode),
        };

    private static string? FirstNonEmpty(params string?[] values) =>
        values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))?.Trim();

    private static JobPayment BuildJobPayment(
        JobInvoice jobInvoice,
        string method,
        decimal amount,
        DateOnly paymentDate,
        string? reference,
        string externalStatus)
    {
        var now = DateTime.UtcNow;
        return new JobPayment
        {
            JobId = jobInvoice.JobId,
            JobInvoiceId = jobInvoice.Id,
            Provider = "system",
            ExternalPaymentId = null,
            ExternalInvoiceId = jobInvoice.ExternalInvoiceId,
            Method = method,
            Amount = amount,
            PaymentDate = paymentDate,
            Reference = reference,
            AccountCode = null,
            ExternalStatus = externalStatus,
            RequestPayloadJson = null,
            ResponsePayloadJson = null,
            CreatedAt = now,
            UpdatedAt = now,
        };
    }

    private static decimal? ExtractAmountDue(string? payloadJson) => ExtractDecimalFromInvoicePayload(payloadJson, "AmountDue");

    private static decimal? ExtractInvoiceTotal(string? payloadJson) => ExtractDecimalFromInvoicePayload(payloadJson, "Total");

    private static decimal? ExtractDecimalFromInvoicePayload(string? payloadJson, string propertyName)
    {
        if (string.IsNullOrWhiteSpace(payloadJson)) return null;
        try
        {
            using var document = JsonDocument.Parse(payloadJson);
            if (!document.RootElement.TryGetProperty("Invoices", out var invoices) || invoices.ValueKind != JsonValueKind.Array)
                return null;
            var invoice = invoices.EnumerateArray().FirstOrDefault();
            if (invoice.ValueKind == JsonValueKind.Undefined)
                return null;
            if (!invoice.TryGetProperty(propertyName, out var property))
                return null;
            return property.TryGetDecimal(out var value) ? value : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private async Task<CreateXeroInvoiceRequest> BuildCatalogMappedCreateRequestAsync(
        Job job,
        Customer customer,
        Vehicle vehicle,
        IReadOnlyList<JobServiceSelection> serviceSelections,
        IReadOnlyList<JobPartsService> partsServices,
        JobPaintService? paintService,
        CancellationToken ct)
    {
        var reference = BuildReference(job, customer, vehicle);
        var contactName = BuildContactName(customer, vehicle);
        if (string.IsNullOrWhiteSpace(contactName))
            throw new InvalidOperationException("Unable to derive contact name for invoice.");

        var lineItems = await BuildCatalogMappedServiceLineItemsAsync(customer, serviceSelections, paintService, ct);

        var requestedCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (partsServices.Any(x => !string.IsNullOrWhiteSpace(x.Description)))
            requestedCodes.Add(JobInvoicePartsLineItemBuilder.DefaultItemCode);

        var inventoryByCode = requestedCodes.Count == 0
            ? new Dictionary<string, InventoryItem>(StringComparer.OrdinalIgnoreCase)
            : await _db.InventoryItems.AsNoTracking()
                .Where(x => requestedCodes.Contains(x.ItemCode))
                .ToDictionaryAsync(x => x.ItemCode, x => x, StringComparer.OrdinalIgnoreCase, ct);

        inventoryByCode.TryGetValue(JobInvoicePartsLineItemBuilder.DefaultItemCode, out var partsInventoryItem);
        lineItems.AddRange(JobInvoicePartsLineItemBuilder.Build(partsServices, partsInventoryItem));

        AppendJobNoteLineItem(lineItems, job.Notes);

        if (lineItems.Count == 0)
        {
            lineItems.Add(new XeroInvoiceLineItemInput
            {
                Description = "Job draft",
                Quantity = 1m,
                UnitAmount = 0m,
            });
        }

        return new CreateXeroInvoiceRequest
        {
            Type = "ACCREC",
            Status = "DRAFT",
            LineAmountTypes = "Exclusive",
            Date = DateOnly.FromDateTime(DateTime.UtcNow),
            Reference = reference,
            Contact = new XeroInvoiceContactInput
            {
                Name = contactName,
            },
            LineItems = lineItems,
        };
    }

    private async Task<List<XeroInvoiceLineItemInput>> BuildCatalogMappedServiceLineItemsAsync(
        Customer customer,
        IReadOnlyList<JobServiceSelection> serviceSelections,
        JobPaintService? paintService,
        CancellationToken ct)
    {
        var selectionIds = serviceSelections
            .Select(x => x.ServiceCatalogItemId)
            .Distinct()
            .ToArray();

        var catalogItemsById = selectionIds.Length == 0
            ? new Dictionary<long, ServiceCatalogItem>()
            : await _db.ServiceCatalogItems.AsNoTracking()
                .Where(x => selectionIds.Contains(x.Id))
                .ToDictionaryAsync(x => x.Id, ct);

        var overrideByServiceId = selectionIds.Length == 0
            ? new Dictionary<long, string>()
            : (await _db.CustomerServicePrices.AsNoTracking()
                .Where(x => x.CustomerId == customer.Id && x.IsActive && selectionIds.Contains(x.ServiceCatalogItemId))
                .OrderByDescending(x => x.UpdatedAt)
                .ThenByDescending(x => x.Id)
                .ToListAsync(ct))
                .GroupBy(x => x.ServiceCatalogItemId)
                .ToDictionary(x => x.Key, x => x.First().XeroItemCode.Trim());

        var requestedCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var selection in serviceSelections)
        {
            if (!catalogItemsById.TryGetValue(selection.ServiceCatalogItemId, out var catalogItem))
                continue;

            var resolvedCode = ResolveCatalogItemCode(customer, catalogItem, overrideByServiceId);
            if (!string.IsNullOrWhiteSpace(resolvedCode))
                requestedCodes.Add(resolvedCode);
        }

        var inventoryByCode = requestedCodes.Count == 0
            ? new Dictionary<string, InventoryItem>(StringComparer.OrdinalIgnoreCase)
            : await _db.InventoryItems.AsNoTracking()
                .Where(x => requestedCodes.Contains(x.ItemCode))
                .ToDictionaryAsync(x => x.ItemCode, x => x, StringComparer.OrdinalIgnoreCase, ct);

        var lineItems = new List<XeroInvoiceLineItemInput>();
        foreach (var selection in serviceSelections)
        {
            if (!catalogItemsById.TryGetValue(selection.ServiceCatalogItemId, out var catalogItem))
                continue;

            var itemCode = ResolveCatalogItemCode(customer, catalogItem, overrideByServiceId);
            var description = ResolveSelectionDescription(selection, catalogItem, paintService);
            inventoryByCode.TryGetValue(itemCode ?? "", out var inventoryItem);
            lineItems.Add(BuildConfiguredLineItem(itemCode, description, inventoryItem, fallbackUnitAmount: 0m, useInventoryPrice: true));
        }

        return lineItems;
    }

    private static void AppendJobNoteLineItem(List<XeroInvoiceLineItemInput> lineItems, string? jobNotes)
    {
        var jobNote = jobNotes?.Trim();
        if (string.IsNullOrWhiteSpace(jobNote))
            return;

        lineItems.Add(new XeroInvoiceLineItemInput
        {
            Description = jobNote,
            Quantity = 1m,
            UnitAmount = 0m,
        });
    }

    private async Task<List<XeroInvoiceLineItemInput>> SanitizeLineItemsAsync(
        IEnumerable<XeroInvoiceLineItemInput> lineItems,
        CancellationToken ct)
    {
        var normalized = lineItems
            .Where(item => !string.IsNullOrWhiteSpace(item.Description))
            .Select(item => new XeroInvoiceLineItemInput
            {
                Description = item.Description.Trim(),
                Quantity = item.Quantity,
                UnitAmount = item.UnitAmount,
                LineAmount = item.LineAmount,
                ItemCode = item.ItemCode?.Trim(),
                AccountCode = item.AccountCode?.Trim(),
                TaxType = NormalizeXeroTaxType(item.TaxType),
                TaxAmount = item.TaxAmount,
                DiscountRate = item.DiscountRate,
                DiscountAmount = item.DiscountAmount,
            })
            .ToList();

        if (normalized.Count == 0)
            return normalized;

        var requestedCodes = normalized
            .Select(item => item.ItemCode)
            .Where(code => !string.IsNullOrWhiteSpace(code))
            .Cast<string>()
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        HashSet<string> validCodes = new(StringComparer.OrdinalIgnoreCase);
        if (requestedCodes.Count > 0)
        {
            var matchedCodes = await _db.InventoryItems.AsNoTracking()
                .Where(x => requestedCodes.Contains(x.ItemCode))
                .Select(x => x.ItemCode)
                .ToListAsync(ct);
            validCodes = new HashSet<string>(matchedCodes, StringComparer.OrdinalIgnoreCase);
        }

        return normalized
            .Select(item => new XeroInvoiceLineItemInput
            {
                Description = item.Description,
                Quantity = item.Quantity,
                UnitAmount = item.UnitAmount,
                LineAmount = item.LineAmount,
                ItemCode = !string.IsNullOrWhiteSpace(item.ItemCode) && validCodes.Contains(item.ItemCode)
                    ? item.ItemCode
                    : null,
                AccountCode = item.AccountCode,
                TaxType = item.TaxType,
                TaxAmount = item.TaxAmount,
                DiscountRate = item.DiscountRate,
                DiscountAmount = item.DiscountAmount,
            })
            .ToList();
    }

    private static string? ResolveCatalogItemCode(
        Customer customer,
        ServiceCatalogItem catalogItem,
        IReadOnlyDictionary<long, string> overrideByServiceId)
    {
        overrideByServiceId.TryGetValue(catalogItem.Id, out var overrideCode);
        return JobInvoiceItemCodeResolver.Resolve(customer, catalogItem, overrideCode);
    }

    private static string ResolveSelectionDescription(
        JobServiceSelection selection,
        ServiceCatalogItem catalogItem,
        JobPaintService? paintService)
    {
        var description = string.IsNullOrWhiteSpace(selection.ServiceNameSnapshot)
            ? catalogItem.Name.Trim()
            : selection.ServiceNameSnapshot.Trim();

        if (catalogItem.ServiceType == "paint" &&
            string.Equals(catalogItem.Category, "root", StringComparison.OrdinalIgnoreCase) &&
            paintService is not null &&
            paintService.Panels > 0)
        {
            return $"{description} - {paintService.Panels} panel(s)";
        }

        return description;
    }

    private static XeroInvoiceLineItemInput BuildConfiguredLineItem(
        string? itemCode,
        string description,
        InventoryItem? inventoryItem,
        decimal fallbackUnitAmount,
        bool useInventoryPrice)
    {
        if (inventoryItem is not null)
        {
            return new XeroInvoiceLineItemInput
            {
                ItemCode = string.IsNullOrWhiteSpace(itemCode) ? inventoryItem.ItemCode : itemCode.Trim(),
                Description = description,
                Quantity = 1m,
                UnitAmount = useInventoryPrice
                    ? inventoryItem.SalesUnitPrice ?? inventoryItem.PurchasesUnitPrice ?? fallbackUnitAmount
                    : fallbackUnitAmount,
                AccountCode = inventoryItem.SalesAccount ?? inventoryItem.PurchasesAccount,
                TaxType = NormalizeXeroTaxType(inventoryItem.SalesTaxRate ?? inventoryItem.PurchasesTaxRate),
            };
        }

        return new XeroInvoiceLineItemInput
        {
            ItemCode = string.IsNullOrWhiteSpace(itemCode) ? null : itemCode.Trim(),
            Description = description,
            Quantity = 1m,
            UnitAmount = fallbackUnitAmount,
        };
    }

    private static string? NormalizeXeroTaxType(string? value)
    {
        var normalized = value?.Trim();
        if (string.IsNullOrWhiteSpace(normalized))
            return null;

        return normalized switch
        {
            "15% GST on Income" => "OUTPUT2",
            "15% GST on Expenses" => "INPUT2",
            "No GST" => "NONE",
            _ when normalized.Contains(' ') || normalized.Contains('%') => null,
            _ => normalized,
        };
    }

    private static string BuildLineItemIdentity(XeroInvoiceLineItemInput item)
    {
        var itemCode = item.ItemCode?.Trim().ToUpperInvariant() ?? "";
        var description = item.Description.Trim().ToUpperInvariant();
        var quantity = (item.Quantity ?? 0m).ToString("0.####", System.Globalization.CultureInfo.InvariantCulture);
        var unitAmount = (item.UnitAmount ?? 0m).ToString("0.####", System.Globalization.CultureInfo.InvariantCulture);
        return $"{itemCode}|{description}|{quantity}|{unitAmount}";
    }

    private static string BuildReference(Job job, Customer customer, Vehicle vehicle)
    {
        if (string.Equals(customer.Type, "Personal", StringComparison.OrdinalIgnoreCase))
            return string.Empty;

        var rego = string.IsNullOrWhiteSpace(vehicle.Plate) ? "[REGO]" : vehicle.Plate.Trim().ToUpperInvariant();
        var poPrefix = string.IsNullOrWhiteSpace(job.PoNumber)
            ? $"Po Pending {rego}"
            : $"{job.PoNumber.Trim()} {rego}";
        var year = vehicle.Year.HasValue && vehicle.Year.Value > 0 ? vehicle.Year.Value.ToString() : "[YEAR]";
        var make = string.IsNullOrWhiteSpace(vehicle.Make) ? "[MAKE]" : vehicle.Make.Trim();
        var model = string.IsNullOrWhiteSpace(vehicle.Model) ? "[MODEL]" : vehicle.Model.Trim();

        return $"{poPrefix} {year} {make} {model}";
    }

    private static string BuildContactName(Customer customer, Vehicle vehicle)
    {
        if (!string.Equals(customer.Type, "Personal", StringComparison.OrdinalIgnoreCase))
            return customer.Name.Trim();

        var rego = vehicle.Plate?.Trim().ToUpperInvariant();
        var vehicleSummary = string.Join(
            ' ',
            new[]
            {
                vehicle.Year > 0 ? vehicle.Year.ToString() : null,
                vehicle.Make,
                vehicle.Model,
            }
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x!.Trim().ToUpperInvariant()));

        if (!string.IsNullOrWhiteSpace(rego) && !string.IsNullOrWhiteSpace(vehicleSummary))
            return $"{rego}-{vehicleSummary}";

        if (!string.IsNullOrWhiteSpace(rego))
            return rego;

        return !string.IsNullOrWhiteSpace(vehicleSummary)
            ? vehicleSummary
            : customer.Name.Trim();
    }

    private static JobInvoice BuildJobInvoice(long jobId, CreateXeroInvoiceRequest request, object? payload, string? tenantId)
    {
        var now = DateTime.UtcNow;
        var jobInvoice = new JobInvoice
        {
            JobId = jobId,
            Provider = "xero",
            CreatedAt = now,
            UpdatedAt = now,
        };
        ApplyInvoiceUpdate(jobInvoice, request, payload, tenantId);
        return jobInvoice;
    }

    private static CreateXeroInvoiceRequest BuildRequestFromPayload(object? payload, JobInvoice existing)
    {
        var fallback = new CreateXeroInvoiceRequest
        {
            InvoiceId = Guid.TryParse(existing.ExternalInvoiceId, out var existingId) ? existingId : null,
            Status = existing.ExternalStatus ?? "DRAFT",
            Reference = existing.Reference,
            Date = existing.InvoiceDate,
            LineAmountTypes = existing.LineAmountTypes,
            Contact = new XeroInvoiceContactInput
            {
                Name = existing.ContactName,
            },
        };
        var storedRequest = TryDeserializeStoredRequest(existing.RequestPayloadJson) ?? new CreateXeroInvoiceRequest();
        var baseRequest = MergeRequestWithFallback(storedRequest, fallback);

        if (payload is null)
            return baseRequest;

        try
        {
            using var document = payload switch
            {
                string raw when !string.IsNullOrWhiteSpace(raw) => JsonDocument.Parse(raw),
                _ => JsonDocument.Parse(JsonSerializer.Serialize(payload, JsonOptions)),
            };
            if (!document.RootElement.TryGetProperty("Invoices", out var invoices) || invoices.ValueKind != JsonValueKind.Array)
                return baseRequest;

            var invoice = invoices.EnumerateArray().FirstOrDefault();
            if (invoice.ValueKind == JsonValueKind.Undefined)
                return baseRequest;

            var request = new CreateXeroInvoiceRequest
            {
                InvoiceId = invoice.TryGetProperty("InvoiceID", out var invoiceIdProp) &&
                            invoiceIdProp.ValueKind == JsonValueKind.String &&
                            Guid.TryParse(invoiceIdProp.GetString(), out var parsedInvoiceId)
                    ? parsedInvoiceId
                    : baseRequest.InvoiceId,
                Type = invoice.TryGetProperty("Type", out var typeProp) && typeProp.ValueKind == JsonValueKind.String
                    ? typeProp.GetString() ?? baseRequest.Type
                    : baseRequest.Type,
                Status = invoice.TryGetProperty("Status", out var statusProp) && statusProp.ValueKind == JsonValueKind.String
                    ? statusProp.GetString() ?? baseRequest.Status
                    : baseRequest.Status,
                LineAmountTypes = invoice.TryGetProperty("LineAmountTypes", out var lineAmountProp) && lineAmountProp.ValueKind == JsonValueKind.String
                    ? lineAmountProp.GetString() ?? baseRequest.LineAmountTypes
                    : baseRequest.LineAmountTypes,
                Date = invoice.TryGetProperty("DateString", out var dateStringProp) &&
                       dateStringProp.ValueKind == JsonValueKind.String &&
                       DateOnly.TryParse(dateStringProp.GetString(), out var parsedDate)
                    ? parsedDate
                    : baseRequest.Date,
                Reference = invoice.TryGetProperty("Reference", out var referenceProp) && referenceProp.ValueKind == JsonValueKind.String
                    ? referenceProp.GetString() ?? baseRequest.Reference
                    : baseRequest.Reference,
                InvoiceNumber = invoice.TryGetProperty("InvoiceNumber", out var invoiceNumberProp) && invoiceNumberProp.ValueKind == JsonValueKind.String
                    ? invoiceNumberProp.GetString() ?? baseRequest.InvoiceNumber
                    : baseRequest.InvoiceNumber,
                DueDate = baseRequest.DueDate,
                ExpectedPaymentDate = baseRequest.ExpectedPaymentDate,
                PlannedPaymentDate = baseRequest.PlannedPaymentDate,
                BrandingThemeId = baseRequest.BrandingThemeId,
                CurrencyCode = baseRequest.CurrencyCode,
                CurrencyRate = baseRequest.CurrencyRate,
                SentToContact = baseRequest.SentToContact,
                Url = baseRequest.Url,
                Contact = new XeroInvoiceContactInput
                {
                    ContactId = baseRequest.Contact.ContactId,
                    Name = invoice.TryGetProperty("Contact", out var contactProp) &&
                           contactProp.ValueKind == JsonValueKind.Object &&
                           contactProp.TryGetProperty("Name", out var contactNameProp) &&
                           contactNameProp.ValueKind == JsonValueKind.String
                        ? contactNameProp.GetString() ?? baseRequest.Contact.Name
                        : baseRequest.Contact.Name,
                    EmailAddress = baseRequest.Contact.EmailAddress,
                    ContactNumber = baseRequest.Contact.ContactNumber,
                },
            };

            if (invoice.TryGetProperty("LineItems", out var lineItemsProp) && lineItemsProp.ValueKind == JsonValueKind.Array)
            {
                request.LineItems = lineItemsProp.EnumerateArray()
                    .Select((item, index) =>
                    {
                        var storedLineItem = index < baseRequest.LineItems.Count ? baseRequest.LineItems[index] : null;
                        return new XeroInvoiceLineItemInput
                        {
                            Description = item.TryGetProperty("Description", out var descriptionProp) && descriptionProp.ValueKind == JsonValueKind.String
                                ? descriptionProp.GetString() ?? storedLineItem?.Description ?? ""
                                : storedLineItem?.Description ?? "",
                            Quantity = item.TryGetProperty("Quantity", out var quantityProp) && quantityProp.TryGetDecimal(out var quantity)
                                ? quantity
                                : storedLineItem?.Quantity ?? 1m,
                            UnitAmount = item.TryGetProperty("UnitAmount", out var unitAmountProp) && unitAmountProp.TryGetDecimal(out var unitAmount)
                                ? unitAmount
                                : storedLineItem?.UnitAmount,
                            LineAmount = item.TryGetProperty("LineAmount", out var lineAmountItemProp) && lineAmountItemProp.TryGetDecimal(out var lineAmount)
                                ? lineAmount
                                : storedLineItem?.LineAmount,
                            ItemCode = item.TryGetProperty("ItemCode", out var itemCodeProp) && itemCodeProp.ValueKind == JsonValueKind.String
                                ? itemCodeProp.GetString() ?? storedLineItem?.ItemCode
                                : storedLineItem?.ItemCode,
                            AccountCode = item.TryGetProperty("AccountCode", out var accountCodeProp) && accountCodeProp.ValueKind == JsonValueKind.String
                                ? accountCodeProp.GetString() ?? storedLineItem?.AccountCode
                                : storedLineItem?.AccountCode,
                            TaxType = item.TryGetProperty("TaxType", out var taxTypeProp) && taxTypeProp.ValueKind == JsonValueKind.String
                                ? taxTypeProp.GetString() ?? storedLineItem?.TaxType
                                : storedLineItem?.TaxType,
                            TaxAmount = item.TryGetProperty("TaxAmount", out var taxAmountProp) && taxAmountProp.TryGetDecimal(out var taxAmount)
                                ? taxAmount
                                : storedLineItem?.TaxAmount,
                            DiscountRate = item.TryGetProperty("DiscountRate", out var discountRateProp) && discountRateProp.TryGetDecimal(out var discountRate)
                                ? discountRate
                                : storedLineItem?.DiscountRate,
                            DiscountAmount = item.TryGetProperty("DiscountAmount", out var discountAmountProp) && discountAmountProp.TryGetDecimal(out var discountAmount)
                                ? discountAmount
                                : storedLineItem?.DiscountAmount,
                        };
                    })
                    .Where(x => !string.IsNullOrWhiteSpace(x.Description) || !string.IsNullOrWhiteSpace(x.ItemCode))
                    .ToList();
            }
            else
            {
                request.LineItems = baseRequest.LineItems;
            }

            return request;
        }
        catch (JsonException)
        {
            return baseRequest;
        }
    }

    private static CreateXeroInvoiceRequest? TryDeserializeStoredRequest(string? payloadJson)
    {
        if (string.IsNullOrWhiteSpace(payloadJson))
            return null;

        try
        {
            return JsonSerializer.Deserialize<CreateXeroInvoiceRequest>(payloadJson, JsonOptions);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static CreateXeroInvoiceRequest MergeRequestWithFallback(CreateXeroInvoiceRequest source, CreateXeroInvoiceRequest fallback)
    {
        return new CreateXeroInvoiceRequest
        {
            InvoiceId = source.InvoiceId ?? fallback.InvoiceId,
            Type = string.IsNullOrWhiteSpace(source.Type) ? fallback.Type : source.Type,
            Status = string.IsNullOrWhiteSpace(source.Status) ? fallback.Status : source.Status,
            LineAmountTypes = string.IsNullOrWhiteSpace(source.LineAmountTypes) ? fallback.LineAmountTypes : source.LineAmountTypes,
            Date = source.Date ?? fallback.Date,
            DueDate = source.DueDate ?? fallback.DueDate,
            ExpectedPaymentDate = source.ExpectedPaymentDate ?? fallback.ExpectedPaymentDate,
            PlannedPaymentDate = source.PlannedPaymentDate ?? fallback.PlannedPaymentDate,
            InvoiceNumber = string.IsNullOrWhiteSpace(source.InvoiceNumber) ? fallback.InvoiceNumber : source.InvoiceNumber,
            Reference = string.IsNullOrWhiteSpace(source.Reference) ? fallback.Reference : source.Reference,
            BrandingThemeId = source.BrandingThemeId ?? fallback.BrandingThemeId,
            CurrencyCode = string.IsNullOrWhiteSpace(source.CurrencyCode) ? fallback.CurrencyCode : source.CurrencyCode,
            CurrencyRate = source.CurrencyRate ?? fallback.CurrencyRate,
            SentToContact = source.SentToContact ?? fallback.SentToContact,
            Url = string.IsNullOrWhiteSpace(source.Url) ? fallback.Url : source.Url,
            Contact = new XeroInvoiceContactInput
            {
                ContactId = source.Contact.ContactId ?? fallback.Contact.ContactId,
                Name = string.IsNullOrWhiteSpace(source.Contact.Name) ? fallback.Contact.Name : source.Contact.Name,
                EmailAddress = string.IsNullOrWhiteSpace(source.Contact.EmailAddress) ? fallback.Contact.EmailAddress : source.Contact.EmailAddress,
                ContactNumber = string.IsNullOrWhiteSpace(source.Contact.ContactNumber) ? fallback.Contact.ContactNumber : source.Contact.ContactNumber,
            },
            LineItems = source.LineItems.Count > 0 ? source.LineItems : fallback.LineItems,
        };
    }

    private static void ApplyInvoiceUpdate(JobInvoice jobInvoice, CreateXeroInvoiceRequest request, object? payload, string? tenantId)
    {
        var extracted = ExtractInvoiceSummary(payload);
        jobInvoice.ExternalInvoiceId = extracted.InvoiceId ?? request.InvoiceId?.ToString();
        jobInvoice.ExternalInvoiceNumber = extracted.InvoiceNumber;
        jobInvoice.ExternalStatus = extracted.Status ?? request.Status;
        jobInvoice.Reference = extracted.Reference ?? request.Reference;
        jobInvoice.ContactName = extracted.ContactName ?? request.Contact.Name;
        jobInvoice.InvoiceDate = extracted.Date ?? request.Date;
        jobInvoice.LineAmountTypes = request.LineAmountTypes;
        jobInvoice.TenantId = tenantId;
        jobInvoice.RequestPayloadJson = JsonSerializer.Serialize(request, JsonOptions);
        jobInvoice.ResponsePayloadJson = payload is null ? null : JsonSerializer.Serialize(payload, JsonOptions);
        jobInvoice.UpdatedAt = DateTime.UtcNow;
    }

    private static ExtractedInvoiceSummary ExtractInvoiceSummary(object? payload) =>
        ExtractInvoiceSummaries(payload).FirstOrDefault() ?? new ExtractedInvoiceSummary();

    private static List<ExtractedInvoiceSummary> ExtractInvoiceSummaries(object? payload)
    {
        if (payload is null)
            return [];

        var json = JsonSerializer.Serialize(payload, JsonOptions);
        if (string.IsNullOrWhiteSpace(json))
            return [];

        try
        {
            using var document = JsonDocument.Parse(json);
            if (!document.RootElement.TryGetProperty("Invoices", out var invoices) || invoices.ValueKind != JsonValueKind.Array)
                return [];

            return invoices.EnumerateArray()
                .Select(invoice =>
                {
                    var contactName = invoice.TryGetProperty("Contact", out var contact) && contact.ValueKind == JsonValueKind.Object &&
                                      contact.TryGetProperty("Name", out var nameElement)
                        ? nameElement.GetString()
                        : null;

                    DateOnly? date = null;
                    if (invoice.TryGetProperty("DateString", out var dateStringElement) && dateStringElement.ValueKind == JsonValueKind.String &&
                        DateOnly.TryParse(dateStringElement.GetString(), out var parsedDateString))
                    {
                        date = parsedDateString;
                    }
                    else if (invoice.TryGetProperty("Date", out var dateElement) && dateElement.ValueKind == JsonValueKind.String &&
                             DateTime.TryParse(dateElement.GetString(), out var parsedDateTime))
                    {
                        date = DateOnly.FromDateTime(parsedDateTime);
                    }

                    return new ExtractedInvoiceSummary
                    {
                        InvoiceId = TryGetString(invoice, "InvoiceID"),
                        InvoiceNumber = TryGetString(invoice, "InvoiceNumber"),
                        Status = TryGetString(invoice, "Status"),
                        Reference = TryGetString(invoice, "Reference"),
                        ContactName = contactName,
                        Date = date,
                    };
                })
                .ToList();
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static string? TryGetString(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var value) || value.ValueKind != JsonValueKind.String)
            return null;

        return value.GetString();
    }

    private sealed class ExtractedInvoiceSummary
    {
        public string? InvoiceId { get; init; }
        public string? InvoiceNumber { get; init; }
        public string? Status { get; init; }
        public string? Reference { get; init; }
        public string? ContactName { get; init; }
        public DateOnly? Date { get; init; }
    }
}

public sealed class JobInvoiceCreateResult
{
    public bool Ok { get; private init; }
    public int StatusCode { get; private init; }
    public string? Error { get; private init; }
    public bool AlreadyExists { get; private init; }
    public JobInvoice? Invoice { get; private init; }
    public object? Payload { get; private init; }
    public CreateXeroInvoiceRequest? RequestBody { get; private init; }
    public string Scope { get; private init; } = "";
    public int AccessTokenExpiresIn { get; private init; }
    public string LatestRefreshToken { get; private init; } = "";
    public bool RefreshTokenUpdated { get; private init; }

    public static JobInvoiceCreateResult Success(
        JobInvoice? invoice,
        bool alreadyExists,
        object? payload = null,
        CreateXeroInvoiceRequest? requestBody = null,
        string? refreshToken = null,
        bool refreshTokenUpdated = false,
        string? scope = null,
        int expiresIn = 0) =>
        new()
        {
            Ok = true,
            StatusCode = alreadyExists ? 200 : 201,
            AlreadyExists = alreadyExists,
            Invoice = invoice,
            Payload = payload,
            RequestBody = requestBody,
            LatestRefreshToken = refreshToken ?? "",
            RefreshTokenUpdated = refreshTokenUpdated,
            Scope = scope ?? "",
            AccessTokenExpiresIn = expiresIn,
        };

    public static JobInvoiceCreateResult Fail(
        int statusCode,
        string error,
        object? payload = null,
        CreateXeroInvoiceRequest? requestBody = null,
        string? refreshToken = null,
        bool refreshTokenUpdated = false,
        string? scope = null,
        int expiresIn = 0) =>
        new()
        {
            Ok = false,
            StatusCode = statusCode,
            Error = error,
            Payload = payload,
            RequestBody = requestBody,
            LatestRefreshToken = refreshToken ?? "",
            RefreshTokenUpdated = refreshTokenUpdated,
            Scope = scope ?? "",
            AccessTokenExpiresIn = expiresIn,
        };
}

public sealed class JobInvoiceStateUpdateResult
{
    public bool Ok { get; private init; }
    public int StatusCode { get; private init; }
    public string? Error { get; private init; }
    public JobInvoice? Invoice { get; private init; }
    public JobPayment? LatestPayment { get; private init; }
    public object? Payload { get; private init; }

    public static JobInvoiceStateUpdateResult Success(JobInvoice invoice, JobPayment? latestPayment) =>
        new()
        {
            Ok = true,
            StatusCode = 200,
            Invoice = invoice,
            LatestPayment = latestPayment,
        };

    public static JobInvoiceStateUpdateResult Fail(int statusCode, string error, object? payload = null) =>
        new()
        {
            Ok = false,
            StatusCode = statusCode,
            Error = error,
            Payload = payload,
        };
}

public sealed class JobInvoiceDeleteResult
{
    public bool Ok { get; private init; }
    public int StatusCode { get; private init; }
    public string? Error { get; private init; }
    public object? Payload { get; private init; }
    public bool DeletedInXero { get; private init; }

    public static JobInvoiceDeleteResult Success(bool deletedInXero) =>
        new()
        {
            Ok = true,
            StatusCode = 200,
            DeletedInXero = deletedInXero,
        };

    public static JobInvoiceDeleteResult Fail(int statusCode, string error, object? payload = null) =>
        new()
        {
            Ok = false,
            StatusCode = statusCode,
            Error = error,
            Payload = payload,
        };
}

public sealed class JobInvoiceUnlinkResult
{
    public bool Ok { get; private init; }
    public int StatusCode { get; private init; }
    public string? Error { get; private init; }

    public static JobInvoiceUnlinkResult Success() =>
        new()
        {
            Ok = true,
            StatusCode = 200,
        };

    public static JobInvoiceUnlinkResult Fail(int statusCode, string error) =>
        new()
        {
            Ok = false,
            StatusCode = statusCode,
            Error = error,
        };
}
