using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using Workshop.Api.Data;
using Workshop.Api.Models;

namespace Workshop.Api.Services;

public sealed class PoTodoService
{
    public const string PoGmailSyncKey = "po-gmail";
    private static readonly TimeSpan ConfirmationProcessingTimeout = TimeSpan.FromMinutes(10);

    private readonly AppDbContext _db;
    private readonly GmailThreadSyncService? _gmailThreadSyncService;
    private readonly JobPoStateService? _jobPoStateService;
    private readonly GmailLabelService? _gmailLabelService;
    private readonly JobInvoiceService? _jobInvoiceService;
    private readonly Func<long, string, CancellationToken, Task<JobInvoiceCreateResult>>? _updateDraftReferenceAsync;
    private readonly Func<long, CancellationToken, Task<JobInvoiceCreateResult>>? _markInvoiceWaitingPaymentAsync;
    private readonly Func<long, CancellationToken, Task<JobInvoiceCreateResult>>? _emailInvoiceAsync;
    private readonly Func<long?, string?, string?, CancellationToken, Task<GmailLabelResult>>? _addInvoicedLabelAsync;
    private readonly ILogger<PoTodoService>? _logger;

    public PoTodoService(
        AppDbContext db,
        GmailThreadSyncService? gmailThreadSyncService,
        JobPoStateService? jobPoStateService,
        GmailLabelService? gmailLabelService,
        JobInvoiceService? jobInvoiceService,
        ILogger<PoTodoService>? logger,
        Func<long, string, CancellationToken, Task<JobInvoiceCreateResult>>? updateDraftReferenceAsync = null,
        Func<long?, string?, string?, CancellationToken, Task<GmailLabelResult>>? addInvoicedLabelAsync = null,
        Func<long, CancellationToken, Task<JobInvoiceCreateResult>>? markInvoiceWaitingPaymentAsync = null,
        Func<long, CancellationToken, Task<JobInvoiceCreateResult>>? emailInvoiceAsync = null)
    {
        _db = db;
        _gmailThreadSyncService = gmailThreadSyncService;
        _jobPoStateService = jobPoStateService;
        _gmailLabelService = gmailLabelService;
        _jobInvoiceService = jobInvoiceService;
        _updateDraftReferenceAsync = updateDraftReferenceAsync;
        _markInvoiceWaitingPaymentAsync = markInvoiceWaitingPaymentAsync;
        _emailInvoiceAsync = emailInvoiceAsync;
        _addInvoicedLabelAsync = addInvoicedLabelAsync;
        _logger = logger;
    }

    public Task<PoTodoListResult> GetTodoAsync(string? status, CancellationToken ct) =>
        GetTodoAsync(status, 1, 500, ct);

    public async Task<PoTodoListResult> GetTodoAsync(string? status, int page, int pageSize, CancellationToken ct)
    {
        await RecoverStaleConfirmationsAsync(ct);

        var normalizedStatus = NormalizeStatusFilter(status);
        var safePage = NormalizePage(page);
        var safePageSize = NormalizePageSize(pageSize);
        var query =
            from job in _db.Jobs.AsNoTracking()
            join state in _db.JobPoStates.AsNoTracking() on job.Id equals state.JobId into stateJoin
            from state in stateJoin.DefaultIfEmpty()
            join invoice in _db.JobInvoices.AsNoTracking() on job.Id equals invoice.JobId into invoiceJoin
            from invoice in invoiceJoin.DefaultIfEmpty()
            where job.NeedsPo
            select new
            {
                Job = job,
                State = state,
                Invoice = invoice,
                HasPo =
                    (job.PoNumber != null && job.PoNumber != "") ||
                    (state != null && state.ConfirmedPoNumber != null && state.ConfirmedPoNumber != "") ||
                    (invoice != null && invoice.Reference != null &&
                     EF.Functions.ILike(invoice.Reference, "PO# %") &&
                     !EF.Functions.ILike(invoice.Reference, "PO# Pending%")),
                HasSentRequest =
                    state != null &&
                    (state.FirstRequestSentAt != null ||
                     state.LastRequestSentAt != null ||
                     state.ManuallyMarkedSentAt != null),
            };

        query = normalizedStatus switch
        {
            "pendingSend" => query.Where(x =>
                !x.HasPo &&
                !x.HasSentRequest &&
                (x.State == null || x.State.Status == JobPoStateStatus.Draft)),
            "awaitingPo" => query.Where(x =>
                !x.HasPo &&
                x.State != null &&
                (x.HasSentRequest ||
                 x.State.Status == JobPoStateStatus.AwaitingReply ||
                 x.State.Status == JobPoStateStatus.PendingConfirmation ||
                 x.State.Status == JobPoStateStatus.EscalationRequired)),
            "invoiced" => query.Where(x => x.HasPo),
            "unknown" => query.Where(_ => false),
            _ => query.Where(x =>
                x.HasPo ||
                x.State == null ||
                x.State.Status != JobPoStateStatus.Completed),
        };

        var total = await query.CountAsync(ct);
        var totalPages = Math.Max(1, (int)Math.Ceiling(total / (double)safePageSize));
        safePage = Math.Min(safePage, totalPages);

        var rows = await query
            .OrderByDescending(x => x.Job.CreatedAt)
            .ThenByDescending(x => x.Job.Id)
            .Skip((safePage - 1) * safePageSize)
            .Take(safePageSize)
            .Select(x => new PoTodoQueryRow(
                x.Job.Id,
                x.Job.CreatedAt,
                x.Job.CustomerId,
                x.Job.VehicleId,
                x.Job.Notes,
                x.Job.InvoiceReference,
                x.Job.PoNumber,
                x.Invoice == null ? null : x.Invoice.Reference,
                x.State == null ? null : x.State.CorrelationId,
                x.State == null ? null : x.State.GmailDraftId,
                x.State == null ? null : x.State.GmailDraftUpdatedAt,
                x.State == null ? null : x.State.Status,
                x.State == null ? null : x.State.SentSource,
                x.State == null ? null : x.State.ManuallyMarkedSentAt,
                x.State == null ? null : x.State.FirstRequestSentAt,
                x.State == null ? null : x.State.LastRequestSentAt,
                x.State == null ? null : x.State.LastFollowUpSentAt,
                x.State == null ? null : x.State.LastSupplierReplyAt,
                x.State == null ? null : x.State.DetectedPoNumber,
                x.State == null ? null : x.State.ConfirmedPoNumber,
                x.State == null ? null : x.State.PendingPoNumber,
                x.State == null ? null : x.State.ConfirmationStatus,
                x.State == null ? null : x.State.ConfirmationNote,
                x.State == null ? null : x.State.ConfirmationLastAttemptAt))
            .ToListAsync(ct);

        var lastGmailSyncedAt = await GetLastGmailSyncedAtAsync(ct);

        if (rows.Count == 0)
            return new PoTodoListResult(total, [], safePage, safePageSize, totalPages, lastGmailSyncedAt);

        var jobIds = rows.Select(x => x.JobId).ToArray();
        var customerIds = rows.Where(x => x.CustomerId.HasValue).Select(x => x.CustomerId!.Value).Distinct().ToArray();
        var vehicleIds = rows.Where(x => x.VehicleId.HasValue).Select(x => x.VehicleId!.Value).Distinct().ToArray();
        var correlationIds = rows
            .Select(x => x.CorrelationId)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x!)
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        var customers = customerIds.Length == 0
            ? new Dictionary<long, Customer>()
            : await _db.Customers.AsNoTracking()
                .Where(x => customerIds.Contains(x.Id))
                .ToDictionaryAsync(x => x.Id, ct);

        var vehicles = vehicleIds.Length == 0
            ? new Dictionary<long, Vehicle>()
            : await _db.Vehicles.AsNoTracking()
                .Where(x => vehicleIds.Contains(x.Id))
                .ToDictionaryAsync(x => x.Id, ct);

        var invoices = jobIds.Length == 0
            ? []
            : await _db.JobInvoices.AsNoTracking()
                .Where(x => jobIds.Contains(x.JobId))
                .OrderByDescending(x => x.UpdatedAt)
                .ThenByDescending(x => x.CreatedAt)
                .ThenByDescending(x => x.Id)
                .Select(x => new PoTodoInvoiceRow(
                    x.JobId,
                    x.Reference,
                    x.ExternalInvoiceId,
                    x.ResponsePayloadJson,
                    x.UpdatedAt,
                    x.CreatedAt,
                    x.Id))
                .ToListAsync(ct);
        var latestInvoiceByJobId = invoices
            .GroupBy(x => x.JobId)
            .ToDictionary(x => x.Key, x => x.First());

        var logs = correlationIds.Length == 0
            ? []
            : await _db.GmailMessageLogs.AsNoTracking()
                .Where(x => x.CorrelationId != null && correlationIds.Contains(x.CorrelationId))
                .Where(x => !string.IsNullOrWhiteSpace(x.GmailThreadId))
                .ToListAsync(ct);
        var latestThreadByCorrelationId = logs
            .GroupBy(x => x.CorrelationId!)
            .ToDictionary(
                x => x.Key,
                x => x
                    .OrderByDescending(GetLogOccurredAtUtc)
                    .ThenByDescending(log => log.Id)
                    .First().GmailThreadId,
                StringComparer.Ordinal);

        var items = rows.Select(row =>
        {
            var customer = row.CustomerId.HasValue && customers.TryGetValue(row.CustomerId.Value, out var matchedCustomer)
                ? matchedCustomer
                : null;
            var vehicle = row.VehicleId.HasValue && vehicles.TryGetValue(row.VehicleId.Value, out var matchedVehicle)
                ? matchedVehicle
                : null;
            var invoice = latestInvoiceByJobId.TryGetValue(row.JobId, out var matchedInvoice)
                ? matchedInvoice
                : null;
            var effectiveReference = invoice?.Reference ?? row.XeroReference ?? row.InvoiceReference;
            var effectivePoNumber = new[]
                {
                    row.JobPoNumber,
                    row.ConfirmedPoNumber,
                    PoReferenceBuilder.ExtractPoNumber(effectiveReference),
                }
                .FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))
                ?.Trim();
            var correlationId = string.IsNullOrWhiteSpace(row.CorrelationId)
                ? JobPoStateService.BuildCorrelationId(row.JobId)
                : row.CorrelationId;

            latestThreadByCorrelationId.TryGetValue(correlationId, out var gmailThreadId);

            return new PoTodoRow(
                row.JobId,
                row.CreatedAt,
                row.CustomerId,
                customer?.Name ?? "",
                customer?.BusinessCode ?? "",
                vehicle?.Plate ?? "",
                BuildModelText(vehicle),
                row.Notes ?? "",
                effectiveReference,
                invoice?.ExternalInvoiceId,
                !string.IsNullOrWhiteSpace(effectivePoNumber)
                    ? ToPoStatusValue(JobPoStateStatus.PoConfirmed)
                    : row.ManuallyMarkedSentAt.HasValue &&
                      row.PoStatus == JobPoStateStatus.Draft
                        ? ToPoStatusValue(JobPoStateStatus.AwaitingReply)
                    : ToPoStatusValue(row.PoStatus ?? JobPoStateStatus.Draft),
                row.SentSource,
                row.ManuallyMarkedSentAt,
                row.FirstRequestSentAt ?? row.ManuallyMarkedSentAt,
                row.LastRequestSentAt ?? row.ManuallyMarkedSentAt,
                row.LastFollowUpSentAt,
                row.LastSupplierReplyAt,
                row.DetectedPoNumber,
                effectivePoNumber,
                row.GmailDraftId,
                row.GmailDraftUpdatedAt,
                gmailThreadId,
                correlationId,
                row.PendingPoNumber,
                row.ConfirmationStatus,
                row.ConfirmationNote,
                row.ConfirmationLastAttemptAt,
                ExtractSubtotal(invoice?.ResponsePayloadJson));
        }).ToList();

        return new PoTodoListResult(total, items, safePage, safePageSize, totalPages, lastGmailSyncedAt);
    }

    public Task<PoTodoSyncResult> SyncActiveAsync(CancellationToken ct) =>
        SyncActiveAsync(null, 1, 500, ct);

    public async Task<PoTodoSyncResult> SyncActiveAsync(string? status, int page, int pageSize, CancellationToken ct)
    {
        var warnings = new List<string>();
        if (_jobPoStateService is null)
        {
            warnings.Add("PO state sync service is unavailable.");
            return new PoTodoSyncResult(0, 0, warnings);
        }

        await _jobPoStateService.EnsureStatesForNeedsPoJobsAsync(ct);

        var normalizedStatus = NormalizeStatusFilter(status);
        var safePage = NormalizePage(page);
        var safePageSize = NormalizePageSize(pageSize);
        var targetQuery =
                from job in _db.Jobs.AsNoTracking()
                join state in _db.JobPoStates.AsNoTracking() on job.Id equals state.JobId
                where job.NeedsPo
                select new
                {
                    job.Id,
                    job.CreatedAt,
                    state.CounterpartyEmail,
                    state.CorrelationId,
                    state.Status,
                };

        targetQuery = normalizedStatus switch
        {
            "pendingSend" => targetQuery.Where(x => x.Status == JobPoStateStatus.Draft),
            "awaitingPo" => targetQuery.Where(x =>
                x.Status == JobPoStateStatus.AwaitingReply ||
                x.Status == JobPoStateStatus.PendingConfirmation ||
                x.Status == JobPoStateStatus.EscalationRequired),
            "invoiced" => targetQuery.Where(x => x.Status == JobPoStateStatus.PoConfirmed),
            "unknown" => targetQuery.Where(_ => false),
            _ => targetQuery.Where(x =>
                x.Status == JobPoStateStatus.Draft ||
                x.Status == JobPoStateStatus.AwaitingReply ||
                x.Status == JobPoStateStatus.PendingConfirmation ||
                x.Status == JobPoStateStatus.EscalationRequired),
        };

        var targets = await targetQuery
            .OrderByDescending(x => x.CreatedAt)
            .ThenByDescending(x => x.Id)
            .Skip((safePage - 1) * safePageSize)
            .Take(safePageSize)
            .Select(x => new PoTodoSyncTarget(x.Id, x.CreatedAt, x.CounterpartyEmail, x.CorrelationId, x.Status))
            .ToListAsync(ct);

        return await SyncTargetsAsync(targets, warnings, ct);
    }

    public async Task<PoTodoSyncResult> SyncDashboardGmailAsync(CancellationToken ct)
    {
        var warnings = new List<string>();
        if (_jobPoStateService is null)
        {
            warnings.Add("PO state sync service is unavailable.");
            await SavePoGmailSyncStateAsync(0, 0, warnings, ct);
            return new PoTodoSyncResult(0, 0, warnings);
        }

        var targets = await (
                from job in _db.Jobs.AsNoTracking()
                join state in _db.JobPoStates.AsNoTracking() on job.Id equals state.JobId
                where job.NeedsPo
                where state.Status == JobPoStateStatus.Draft ||
                      state.Status == JobPoStateStatus.AwaitingReply ||
                      state.Status == JobPoStateStatus.PendingConfirmation ||
                      state.Status == JobPoStateStatus.PoConfirmed
                orderby job.CreatedAt descending, job.Id descending
                select new PoTodoSyncTarget(
                    job.Id,
                    job.CreatedAt,
                    state.CounterpartyEmail,
                    state.CorrelationId,
                    state.Status))
            .ToListAsync(ct);

    
        var result = await SyncTargetsAsync(targets, warnings, ct);
        await SavePoGmailSyncStateAsync(result.CheckedJobs, result.SyncedMessages, result.Warnings, ct);
         return result;
    }
//test xero update po
public async Task<object> DebugSyncDraftPoInvoicesFromXeroAsync(CancellationToken ct)
{
    var warnings = new List<string>();
    await SyncDraftPoInvoicesFromXeroAndCompleteReadyAsync(warnings, ct);

    return new
    {
        ok = warnings.Count == 0,
        warnings
    };
}
//end test xero update po
    private async Task SyncDraftPoInvoicesFromXeroAndCompleteReadyAsync(List<string> warnings, CancellationToken ct)
    {
        static string? TruncateForLog(string? value, int maxLength = 300)
        {
            if (string.IsNullOrWhiteSpace(value))
                return value;

            var trimmed = value.Trim();
            return trimmed.Length <= maxLength ? trimmed : trimmed[..maxLength] + "...";
        }

        _logger?.LogInformation("PO todo Xero draft invoice sync started.");

        if (_jobInvoiceService is null)
        {
            warnings.Add("Xero invoice service is unavailable for PO draft completion sync.");
            _logger?.LogWarning("PO todo Xero draft invoice sync skipped: JobInvoiceService is unavailable.");
            return;
        }

        var draftInvoiceCandidateRows = await (
                from job in _db.Jobs.AsNoTracking()
                join state in _db.JobPoStates.AsNoTracking() on job.Id equals state.JobId
                join invoice in _db.JobInvoices.AsNoTracking() on job.Id equals invoice.JobId
                join vehicle in _db.Vehicles.AsNoTracking() on job.VehicleId equals vehicle.Id into vehicleJoin
                from vehicle in vehicleJoin.DefaultIfEmpty()
                join customer in _db.Customers.AsNoTracking() on job.CustomerId equals customer.Id into customerJoin
                from customer in customerJoin.DefaultIfEmpty()
                where job.NeedsPo
                where state.Status == JobPoStateStatus.Draft
                where invoice.ExternalInvoiceId != null && invoice.ExternalInvoiceId != ""
                where invoice.ExternalStatus != null && invoice.ExternalStatus!.Trim().ToUpper() == "DRAFT"
                where invoice.Reference != null && invoice.Reference!.Trim() != ""
                orderby invoice.Reference!.ToLower().Contains("pending"), invoice.UpdatedAt descending, job.Id descending
                select new
                {
                    JobId = job.Id,
                    Plate = vehicle != null ? vehicle.Plate : null,
                    VehicleMake = vehicle != null ? vehicle.Make : null,
                    VehicleModel = vehicle != null ? vehicle.Model : null,
                    VehicleYear = vehicle != null ? vehicle.Year : null,
                    MerchantName = customer != null ? customer.Name : null,
                    MerchantCode = customer != null ? customer.BusinessCode : null,
                    JobNotes = job.Notes,
                    PoStatus = state.Status,
                    JobInvoiceId = invoice.Id,
                    ExternalInvoiceId = invoice.ExternalInvoiceId!,
                    ExternalInvoiceNumber = invoice.ExternalInvoiceNumber,
                    XeroStatus = invoice.ExternalStatus,
                    XeroReference = invoice.Reference,
                    InvoiceUpdatedAt = invoice.UpdatedAt,
                })
            .Distinct()
            .ToListAsync(ct);

        _logger?.LogInformation(
            "PO todo Xero draft invoice sync found {CandidateCount} candidates. HasReference={HasReferenceCount}, PendingReference={PendingReferenceCount}.",
            draftInvoiceCandidateRows.Count,
            draftInvoiceCandidateRows.Count(x => !x.XeroReference!.Contains("pending", StringComparison.OrdinalIgnoreCase)),
            draftInvoiceCandidateRows.Count(x => x.XeroReference!.Contains("pending", StringComparison.OrdinalIgnoreCase)));

        foreach (var candidate in draftInvoiceCandidateRows)
        {
            var referenceState = candidate.XeroReference!.Contains("pending", StringComparison.OrdinalIgnoreCase)
                ? "(pending reference)"
                : "(has reference)";
            var vehicleModel = string.Join(
                " ",
                new[]
                {
                    candidate.VehicleMake,
                    candidate.VehicleModel,
                    candidate.VehicleYear?.ToString(),
                }.Where(x => !string.IsNullOrWhiteSpace(x)));

            _logger?.LogInformation(
                "PO todo Xero draft invoice sync candidate. JobId={JobId}, Plate={Plate}, VehicleModel={VehicleModel}, MerchantName={MerchantName}, MerchantCode={MerchantCode}, ReferenceState={ReferenceState}, XeroStatus={XeroStatus}, XeroReference={XeroReference}, ExternalInvoiceNumber={ExternalInvoiceNumber}, ExternalInvoiceId={ExternalInvoiceId}, InvoiceUpdatedAt={InvoiceUpdatedAt}, JobNotes={JobNotes}",
                candidate.JobId,
                candidate.Plate,
                vehicleModel,
                candidate.MerchantName,
                candidate.MerchantCode,
                referenceState,
                candidate.XeroStatus,
                candidate.XeroReference,
                candidate.ExternalInvoiceNumber,
                candidate.ExternalInvoiceId,
                candidate.InvoiceUpdatedAt,
                TruncateForLog(candidate.JobNotes));
        }
        var draftInvoiceCandidateLength = draftInvoiceCandidateRows.Count;

        var draftInvoiceTargets = draftInvoiceCandidateRows
            .Select(x => new JobInvoiceXeroSyncTarget(x.JobId, x.JobInvoiceId, x.ExternalInvoiceId))
            .Distinct()
            .ToArray();

        if (draftInvoiceTargets.Length == 0)
        {
            _logger?.LogInformation("PO todo Xero draft invoice sync finished: no matching draft Xero invoices to sync.");
            return;
        }

        try
        {
            var syncResult = await _jobInvoiceService.SyncFromXeroAsync(draftInvoiceTargets, ct);
            _logger?.LogInformation(
                "PO todo Xero draft invoice sync Xero batch completed. Ok={Ok}, StatusCode={StatusCode}, RequestedJobs={RequestedJobs}, SyncedInvoices={SyncedInvoices}, Error={Error}",
                syncResult.Ok,
                syncResult.StatusCode,
                syncResult.RequestedJobs,
                syncResult.SyncedInvoices,
                syncResult.Error);

            if (!syncResult.Ok)
            {
                warnings.Add(syncResult.Error ?? "Failed to sync draft PO invoices from Xero.");
                _logger?.LogWarning(
                    "PO todo Xero draft invoice sync stopped after failed Xero batch. StatusCode={StatusCode}, Error={Error}",
                    syncResult.StatusCode,
                    syncResult.Error);
                return;
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger?.LogWarning(ex, "PO todo Xero draft invoice sync failed.");
            warnings.Add($"Xero draft invoice sync failed: {ex.Message}");
            return;
        }

        var draftJobIds = draftInvoiceTargets.Select(x => x.JobId).Distinct().ToArray();
        var readyStates = await (
                from job in _db.Jobs.AsNoTracking()
                join state in _db.JobPoStates on job.Id equals state.JobId
                join invoice in _db.JobInvoices.AsNoTracking() on job.Id equals invoice.JobId
                where draftJobIds.Contains(job.Id)
                where job.NeedsPo
                where state.Status == JobPoStateStatus.Draft
                where invoice.Reference != null &&
                      invoice.Reference.Trim() != "" &&
                      !invoice.Reference.ToLower().Contains("pending")
                select state)
            .Distinct()
            .ToListAsync(ct);

        if (readyStates.Count == 0)
        {
            _logger?.LogInformation(
                "PO todo Xero draft invoice sync finished: Xero references synced, but no PO draft states are ready to complete. CandidateJobs={CandidateJobs}.",
                draftJobIds.Length);
            return;
        }

        var now = DateTime.UtcNow;
        foreach (var state in readyStates)
        {
            state.Status = JobPoStateStatus.Completed;
            state.CompletedAt = now;
            state.UpdatedAt = now;
        }

        await _db.SaveChangesAsync(ct);

        _logger?.LogInformation(
            "PO todo Xero draft invoice sync completed {CompletedCount} PO states. JobIds={JobIds}",
            readyStates.Count,
            string.Join(",", readyStates.Select(x => x.JobId)));
    }

    private async Task<PoTodoSyncResult> SyncTargetsAsync(
        IReadOnlyList<PoTodoSyncTarget> targets,
        List<string> warnings,
        CancellationToken ct)
    {
        if (_jobPoStateService is null)
        {
            warnings.Add("PO state sync service is unavailable.");
            return new PoTodoSyncResult(0, 0, warnings);
        }

        var syncedMessages = 0;
        IReadOnlyList<GmailThreadSyncService.GmailThreadBatchSyncResult> gmailResults;

        if (_gmailThreadSyncService is null)
        {
            gmailResults = targets
                .Select(target => new GmailThreadSyncService.GmailThreadBatchSyncResult(
                    target.Id,
                    GmailThreadSyncService.GmailThreadSyncResult.Failed(
                        $"Gmail thread sync service is unavailable for job {target.Id}.")))
                .ToList();
        }
        else
        {
            try
            {
                gmailResults = await _gmailThreadSyncService.SyncThreadsAsync(
                    targets
                        .Select(target => new GmailThreadSyncService.GmailThreadBatchSyncTarget(
                            target.Id,
                            target.CounterpartyEmail,
                            target.CorrelationId))
                        .ToList(),
                    _gmailThreadSyncService.BackgroundThreadFetchLimit,
                    null,
                    ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger?.LogWarning(ex, "PO todo Gmail batch sync failed.");
                warnings.Add($"Gmail batch sync failed: {ex.Message}");
                gmailResults = targets
                    .Select(target => new GmailThreadSyncService.GmailThreadBatchSyncResult(
                        target.Id,
                        GmailThreadSyncService.GmailThreadSyncResult.Failed(ex.Message)))
                    .ToList();
            }
        }

        var gmailResultsByJobId = gmailResults.ToDictionary(x => x.TargetId);

        foreach (var target in targets)
        {
            var stateSyncedByGmail = false;
            if (gmailResultsByJobId.TryGetValue(target.Id, out var gmailResult))
            {
                var result = gmailResult.Result;
                syncedMessages += result.SyncedCount;
                stateSyncedByGmail = result.Ok && !result.Skipped;
                if (!string.IsNullOrWhiteSpace(result.Warning))
                    warnings.Add($"Job {target.Id}: {result.Warning}");
            }
            else
            {
                warnings.Add($"Job {target.Id}: Gmail batch sync returned no result.");
            }

            if (stateSyncedByGmail)
                continue;

            try
            {
                await _jobPoStateService.SyncStateForJobAsync(target.Id, ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger?.LogWarning(ex, "PO todo state sync failed for job {JobId}.", target.Id);
                warnings.Add($"Job {target.Id}: {ex.Message}");
            }
        }

        return new PoTodoSyncResult(targets.Count, syncedMessages, warnings);
    }

    private async Task<DateTime?> GetLastGmailSyncedAtAsync(CancellationToken ct)
    {
        return await _db.SystemSyncStates.AsNoTracking()
            .Where(x => x.SyncKey == PoGmailSyncKey)
            .Select(x => x.LastSyncedAt)
            .FirstOrDefaultAsync(ct);
    }

    private async Task SavePoGmailSyncStateAsync(int checkedJobs, int syncedMessages, IReadOnlyList<string> warnings, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var state = await _db.SystemSyncStates.FirstOrDefaultAsync(x => x.SyncKey == PoGmailSyncKey, ct);
        if (state is null)
        {
            state = new SystemSyncState
            {
                SyncKey = PoGmailSyncKey,
                CreatedAt = now,
            };
            _db.SystemSyncStates.Add(state);
        }

        state.LastSyncedAt = now;
        state.LastResult = $"checkedJobs={checkedJobs}; syncedMessages={syncedMessages}; warnings={warnings.Count}";
        state.LastError = warnings.Count == 0 ? null : string.Join("\n", warnings.Take(10));
        state.UpdatedAt = now;
        await _db.SaveChangesAsync(ct);
    }

    public async Task<PoTodoActionResult> ManualConfirmSentAsync(long jobId, CancellationToken ct)
    {
        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == jobId, ct);
        if (job is null)
            return PoTodoActionResult.Fail("Job not found.");

        if (!job.NeedsPo)
            return PoTodoActionResult.Fail("Job does not need a PO.");

        var now = DateTime.UtcNow;
        var state = await EnsureStateAsync(job.Id, now, ct);
        state.Status = JobPoStateStatus.AwaitingReply;
        state.SentSource = "manual";
        state.ManuallyMarkedSentAt = now;
        state.FirstRequestSentAt ??= now;
        state.LastRequestSentAt = now;
        state.UpdatedAt = now;

        await _db.SaveChangesAsync(ct);
        return PoTodoActionResult.Ok();
    }

    public async Task<PoTodoCompleteResult> CompleteAsync(long[] jobIds, CancellationToken ct)
    {
        var distinctJobIds = jobIds.Distinct().ToArray();
        if (distinctJobIds.Length == 0)
            return new PoTodoCompleteResult(0, 0);

        var activeJobIds = await _db.Jobs
            .AsNoTracking()
            .Where(x => distinctJobIds.Contains(x.Id))
            .Where(x => x.NeedsPo)
            .Select(x => x.Id)
            .ToListAsync(ct);
        if (activeJobIds.Count == 0)
            return new PoTodoCompleteResult(0, distinctJobIds.Length);

        var states = await _db.JobPoStates
            .Where(x => activeJobIds.Contains(x.JobId))
            .ToListAsync(ct);
        var stateByJobId = states.ToDictionary(x => x.JobId);
        var now = DateTime.UtcNow;
        var updated = 0;

        foreach (var jobId in activeJobIds)
        {
            if (!stateByJobId.TryGetValue(jobId, out var state))
            {
                state = new JobPoState
                {
                    JobId = jobId,
                    CorrelationId = JobPoStateService.BuildCorrelationId(jobId),
                    CreatedAt = now,
                    UpdatedAt = now,
                };
                _db.JobPoStates.Add(state);
                stateByJobId[jobId] = state;
            }

            if (state.Status == JobPoStateStatus.Completed)
                continue;

            state.Status = JobPoStateStatus.Completed;
            state.CompletedAt = now;
            state.UpdatedAt = now;
            updated++;
        }

        if (updated > 0)
            await _db.SaveChangesAsync(ct);

        return new PoTodoCompleteResult(updated, distinctJobIds.Length - updated);
    }

    public async Task<PoDraftPreviewResult?> GetDraftPreviewAsync(long jobId, CancellationToken ct)
    {
        var row = await (
            from job in _db.Jobs.AsNoTracking()
            join vehicle in _db.Vehicles.AsNoTracking() on job.VehicleId equals vehicle.Id into vehicleJoin
            from vehicle in vehicleJoin.DefaultIfEmpty()
            join state in _db.JobPoStates.AsNoTracking() on job.Id equals state.JobId into stateJoin
            from state in stateJoin.DefaultIfEmpty()
            where job.Id == jobId && job.NeedsPo
            select new
            {
                JobId = job.Id,
                Vehicle = vehicle,
                State = state,
            })
            .FirstOrDefaultAsync(ct);

        if (row is null)
            return null;

        var correlationId = string.IsNullOrWhiteSpace(row.State?.CorrelationId)
            ? JobPoStateService.BuildCorrelationId(jobId)
            : row.State.CorrelationId;
        var vehicleLabel = BuildVehicleLabel(row.Vehicle);
        var subject = $"PO Request for {vehicleLabel} [{correlationId}]";
        var encodedRego = System.Net.WebUtility.HtmlEncode(row.Vehicle?.Plate ?? "");
        var encodedModel = System.Net.WebUtility.HtmlEncode(BuildModelText(row.Vehicle));
        var encodedCorrelationId = System.Net.WebUtility.HtmlEncode(correlationId);
        var htmlBody = $"""
            <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
              <div style="margin-bottom: 20px;">Hi Team,</div>
              <div style="margin-bottom: 20px;">Could you please issue a PO number for the jobs on the vehicle below? Much appreciated.</div>
              <div style="margin-bottom: 8px;">
                <div style="margin-bottom: 6px;"><strong>- Rego:</strong> {encodedRego}</div>
                <div style="margin-bottom: 6px;"><strong>- Make & Model:</strong> {encodedModel}</div>
                <div style="margin-bottom: 6px;"><strong>- Reference:</strong> {encodedCorrelationId}</div>
              </div>
            </div>
            """;

        return new PoDraftPreviewResult(
            row.JobId,
            row.State?.CounterpartyEmail ?? "",
            subject,
            htmlBody,
            row.State?.GmailDraftId);
    }

    public Task<ConfirmPoResult> ConfirmPoAsync(long jobId, string? poNumber, CancellationToken ct) =>
        ConfirmPoAsync(jobId, poNumber, sendInvoice: false, ct);

    public async Task<ConfirmPoResult> ConfirmPoAsync(long jobId, string? poNumber, bool sendInvoice, CancellationToken ct)
    {
        try
        {
            return await ConfirmPoCoreAsync(jobId, poNumber, sendInvoice, ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            await TrySaveInterruptedConfirmationAsync(
                jobId,
                "PO confirmation was interrupted before completion. Please retry.");
            throw;
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "PO confirmation failed unexpectedly for job {JobId}.", jobId);
            var message = $"PO confirmation failed unexpectedly: {ex.Message}";
            await TrySaveInterruptedConfirmationAsync(jobId, message);

            var steps = CreateConfirmPoSteps();
            steps["poState"] = PoTodoStepResult.Failed(message);
            return new ConfirmPoResult(false, jobId, poNumber?.Trim() ?? "", "", steps);
        }
    }

    private async Task<ConfirmPoResult> ConfirmPoCoreAsync(long jobId, string? poNumber, bool sendInvoice, CancellationToken ct)
    {
        var steps = CreateConfirmPoSteps();
        var normalizedPo = poNumber?.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(normalizedPo))
        {
            steps["savePo"] = PoTodoStepResult.Failed("PO number is required.");
            return new ConfirmPoResult(false, jobId, "", "", steps);
        }
        if (!normalizedPo.All(char.IsDigit))
        {
            steps["savePo"] = PoTodoStepResult.Failed("PO number must contain digits only.");
            return new ConfirmPoResult(false, jobId, normalizedPo, "", steps);
        }

        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == jobId && x.NeedsPo, ct);
        if (job is null)
        {
            steps["savePo"] = PoTodoStepResult.Failed("Job not found or does not need PO.");
            return new ConfirmPoResult(false, jobId, normalizedPo, "", steps);
        }

        var now = DateTime.UtcNow;
        var state = await EnsureStateAsync(jobId, now, ct);
        state.PendingPoNumber = normalizedPo;
        state.ConfirmationStatus = "processing";
        state.ConfirmationNote = null;
        state.ConfirmationLastAttemptAt = now;
        state.UpdatedAt = now;
        await _db.SaveChangesAsync(ct);

        var invoice = await _db.JobInvoices.AsNoTracking()
            .Where(x => x.JobId == jobId)
            .OrderByDescending(x => x.UpdatedAt)
            .ThenByDescending(x => x.CreatedAt)
            .ThenByDescending(x => x.Id)
            .FirstOrDefaultAsync(ct);
        var nextReference = PoReferenceBuilder.BuildReference(invoice?.Reference ?? job.InvoiceReference, normalizedPo);

        steps["xero"] = PoTodoStepResult.Running("Updating Xero reference.");
        JobInvoiceCreateResult xero;
        try
        {
            xero = await UpdatePoReferenceAsync(jobId, normalizedPo, nextReference, ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger?.LogWarning(ex, "PO confirm Xero reference update failed for job {JobId}.", jobId);
            steps["xero"] = PoTodoStepResult.Failed(ex.Message);
            await SaveConfirmationFailureAsync(state, ex.Message, ct);
            return new ConfirmPoResult(false, jobId, normalizedPo, nextReference, steps);
        }

        if (!xero.Ok)
        {
            steps["xero"] = PoTodoStepResult.Failed(xero.Error ?? "Failed to update Xero reference.");
            await SaveConfirmationFailureAsync(state, steps["xero"].Message, ct);
            return new ConfirmPoResult(false, jobId, normalizedPo, nextReference, steps);
        }
        steps["xero"] = PoTodoStepResult.Success("Xero reference updated.");
        nextReference = xero.Invoice?.Reference ?? nextReference;

        steps["xeroStatus"] = PoTodoStepResult.Running("Updating Xero invoice to Waiting Payment.");
        JobInvoiceCreateResult xeroStatus;
        try
        {
            xeroStatus = await MarkInvoiceWaitingPaymentAsync(jobId, ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger?.LogWarning(ex, "PO confirm Xero Waiting Payment update failed for job {JobId}.", jobId);
            steps["xeroStatus"] = PoTodoStepResult.Failed(ex.Message);
            xeroStatus = JobInvoiceCreateResult.Fail(500, ex.Message);
        }

        if (!xeroStatus.Ok)
        {
            _logger?.LogWarning(
                "PO confirm Xero Waiting Payment update failed for job {JobId}: {Error}",
                jobId,
                xeroStatus.Error);
            steps["xeroStatus"] = PoTodoStepResult.Failed(xeroStatus.Error ?? "Failed to update Xero invoice to Waiting Payment.");
            await SaveConfirmationFailureAsync(state, steps["xeroStatus"].Message, ct);
            return new ConfirmPoResult(false, jobId, normalizedPo, nextReference, steps);
        }
        else
        {
            steps["xeroStatus"] = PoTodoStepResult.Success("Xero invoice updated to Waiting Payment.");
        }

        if (sendInvoice)
        {
            steps["xeroEmail"] = PoTodoStepResult.Running("Sending the Xero invoice PDF through Gmail.");
            if (state.XeroEmailSentAt.HasValue)
            {
                try
                {
                    var repairResult = await RepairInvoiceSentToContactAsync(jobId, ct);
                    steps["xeroEmail"] = !repairResult.Ok
                        ? PoTodoStepResult.Success($"Invoice sending was already recorded. Xero sent status repair warning: {repairResult.Error}")
                        : repairResult.Payload switch
                        {
                            InvoiceSentRepairPayload { GmailDeliveryFound: true, XeroMarkedSent: true } =>
                                PoTodoStepResult.Success("Invoice Gmail delivery was already recorded and Xero sent status was verified."),
                            InvoiceSentRepairPayload { GmailDeliveryFound: true, XeroMarkedSent: false } repair =>
                                PoTodoStepResult.Success($"Invoice Gmail delivery was already recorded. Xero sent status repair warning: {repair.Error}"),
                            _ => PoTodoStepResult.Success("Invoice sending was already recorded for this job."),
                        };
                }
                catch (OperationCanceledException) when (ct.IsCancellationRequested)
                {
                    throw;
                }
                catch (Exception ex)
                {
                    _logger?.LogWarning(ex, "Invoice SentToContact repair failed for job {JobId}.", jobId);
                    steps["xeroEmail"] = PoTodoStepResult.Success($"Invoice sending was already recorded. Xero sent status repair warning: {ex.Message}");
                }
            }
            else
            {
                var emailResult = await EmailInvoiceAsync(jobId, ct);
                if (!emailResult.Ok)
                {
                    steps["xeroEmail"] = PoTodoStepResult.Failed(emailResult.Error ?? "Failed to send the invoice through Gmail.");
                    await SaveConfirmationFailureAsync(state, steps["xeroEmail"].Message, ct);
                    return new ConfirmPoResult(false, jobId, normalizedPo, nextReference, steps);
                }

                state.XeroEmailSentAt = DateTime.UtcNow;
                state.UpdatedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync(ct);

                steps["xeroEmail"] = emailResult.Payload is InvoiceEmailDeliveryPayload { XeroMarkedSent: false } delivery
                    ? PoTodoStepResult.Success($"Invoice emailed with PDF. Xero sent status could not be updated: {delivery.XeroMarkError}")
                    : PoTodoStepResult.Success("Invoice emailed with the official Xero PDF.");
            }
        }

        var latestLog = await _db.GmailMessageLogs.AsNoTracking()
            .Where(x => x.CorrelationId == JobPoStateService.BuildCorrelationId(jobId))
            .ToListAsync(ct);
        var gmailLog = latestLog
            .OrderByDescending(GetLogOccurredAtUtc)
            .ThenByDescending(x => x.Id)
            .FirstOrDefault();

        steps["gmail"] = PoTodoStepResult.Running("Adding Gmail label.");
        if (string.IsNullOrWhiteSpace(gmailLog?.GmailThreadId) && string.IsNullOrWhiteSpace(gmailLog?.GmailMessageId))
        {
            steps["gmail"] = PoTodoStepResult.Failed("Gmail thread or message was not found.");
        }
        else
        {
            GmailLabelResult gmail;
            try
            {
                gmail = await AddInvoicedLabelAsync(gmailLog.GmailAccountId, gmailLog.GmailThreadId, gmailLog.GmailMessageId, ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger?.LogWarning(ex, "PO confirm Gmail label update failed for job {JobId}.", jobId);
                steps["gmail"] = PoTodoStepResult.Failed(ex.Message);
                gmail = GmailLabelResult.Fail(500, ex.Message);
            }

            if (!gmail.Ok)
            {
                steps["gmail"] = PoTodoStepResult.Failed(gmail.Error ?? "Failed to add Gmail label.");
            }
            else
            {
                steps["gmail"] = PoTodoStepResult.Success("Gmail label added.");
            }
        }

        steps["savePo"] = PoTodoStepResult.Running("Saving PO number.");
        steps["poState"] = PoTodoStepResult.Running("Updating PO state.");
        now = DateTime.UtcNow;
        job.PoNumber = normalizedPo;
        job.InvoiceReference = nextReference;
        job.UpdatedAt = now;
        state.Status = JobPoStateStatus.PoConfirmed;
        state.ConfirmedPoNumber = normalizedPo;
        state.PendingPoNumber = null;
        state.ConfirmationStatus = steps["gmail"].Status == "failed" ? "completedWithWarning" : "completed";
        state.ConfirmationNote = steps["gmail"].Status == "failed" ? steps["gmail"].Message : null;
        state.FollowUpEnabled = false;
        state.NextFollowUpDueAt = null;
        state.RequiresAdminAttention = false;
        state.AdminAttentionReason = null;
        state.FollowUpCount = 0;
        state.LastFollowUpSentAt = null;
        state.UpdatedAt = now;
        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger?.LogWarning(ex, "PO confirm local save failed for job {JobId}.", jobId);
            steps["savePo"] = PoTodoStepResult.Failed(ex.Message);
            steps["poState"] = PoTodoStepResult.Failed(ex.Message);
            return new ConfirmPoResult(false, jobId, normalizedPo, nextReference, steps);
        }

        steps["savePo"] = PoTodoStepResult.Success("PO saved.");
        steps["poState"] = PoTodoStepResult.Success("PO state updated.");

        return new ConfirmPoResult(true, jobId, normalizedPo, nextReference, steps);
    }

    public async Task<IReadOnlyList<ConfirmPoResult>> ConfirmPoBatchAsync(
        IReadOnlyCollection<PoBatchConfirmItem> items,
        bool sendInvoice,
        CancellationToken ct)
    {
        var results = new List<ConfirmPoResult>(items.Count);
        foreach (var item in items)
        {
            try
            {
                results.Add(await ConfirmPoAsync(item.JobId, item.PoNumber, sendInvoice, ct));
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger?.LogError(ex, "PO batch confirmation item failed unexpectedly for job {JobId}.", item.JobId);
                var message = $"PO confirmation failed unexpectedly: {ex.Message}";
                var steps = CreateConfirmPoSteps();
                steps["poState"] = PoTodoStepResult.Failed(message);
                results.Add(new ConfirmPoResult(false, item.JobId, item.PoNumber?.Trim() ?? "", "", steps));
            }
        }
        return results;
    }

    public async Task<IReadOnlyList<PoXeroSummary>> RefreshXeroSummariesAsync(
        IReadOnlyCollection<long> jobIds,
        CancellationToken ct)
    {
        var ids = jobIds.Where(x => x > 0).Distinct().Take(50).ToArray();
        if (ids.Length == 0 || _jobInvoiceService is null)
            return [];

        var targets = await _db.JobInvoices.AsNoTracking()
            .Where(x => ids.Contains(x.JobId) && x.ExternalInvoiceId != null)
            .Select(x => new JobInvoiceXeroSyncTarget(x.JobId, x.Id, x.ExternalInvoiceId!))
            .ToArrayAsync(ct);
        if (targets.Length > 0)
            await _jobInvoiceService.SyncFromXeroAsync(targets, ct);

        var invoices = await _db.JobInvoices.AsNoTracking()
            .Where(x => ids.Contains(x.JobId))
            .ToListAsync(ct);
        return invoices.Select(x => new PoXeroSummary(
            x.JobId,
            ExtractSubtotal(x.ResponsePayloadJson),
            x.ExternalStatus,
            x.Reference,
            x.UpdatedAt)).ToList();
    }

    private async Task SaveConfirmationFailureAsync(JobPoState state, string message, CancellationToken ct)
    {
        state.ConfirmationStatus = "failed";
        state.ConfirmationNote = message;
        state.ConfirmationLastAttemptAt = DateTime.UtcNow;
        state.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
    }

    private async Task TrySaveInterruptedConfirmationAsync(long jobId, string message)
    {
        try
        {
            var state = await _db.JobPoStates.FirstOrDefaultAsync(x => x.JobId == jobId, CancellationToken.None);
            if (state is null || !string.Equals(state.ConfirmationStatus, "processing", StringComparison.OrdinalIgnoreCase))
                return;

            await SaveConfirmationFailureAsync(state, message, CancellationToken.None);
        }
        catch (Exception cleanupError)
        {
            _logger?.LogError(
                cleanupError,
                "Failed to clear interrupted PO confirmation state for job {JobId}.",
                jobId);
        }
    }

    private async Task RecoverStaleConfirmationsAsync(CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var cutoff = now.Subtract(ConfirmationProcessingTimeout);
        var recovered = await _db.JobPoStates
            .Where(state =>
                state.ConfirmationStatus == "processing" &&
                (!state.ConfirmationLastAttemptAt.HasValue || state.ConfirmationLastAttemptAt.Value < cutoff))
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(state => state.ConfirmationStatus, "failed")
                    .SetProperty(
                        state => state.ConfirmationNote,
                        "The previous PO confirmation was interrupted or timed out. Please retry.")
                    .SetProperty(state => state.UpdatedAt, now),
                ct);

        if (recovered > 0)
        {
            _logger?.LogWarning(
                "Recovered {Count} stale PO confirmation record(s) older than {TimeoutMinutes} minutes.",
                recovered,
                ConfirmationProcessingTimeout.TotalMinutes);
        }
    }

    private static decimal? ExtractSubtotal(string? payload)
    {
        if (string.IsNullOrWhiteSpace(payload)) return null;
        try
        {
            using var document = JsonDocument.Parse(payload);
            if (!document.RootElement.TryGetProperty("Invoices", out var invoices)
                || invoices.ValueKind != JsonValueKind.Array
                || invoices.GetArrayLength() == 0
                || !invoices[0].TryGetProperty("SubTotal", out var subtotal))
                return null;
            return subtotal.TryGetDecimal(out var value) ? value : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private async Task<JobInvoiceCreateResult> UpdateDraftReferenceAsync(long jobId, string reference, CancellationToken ct)
    {
        if (_updateDraftReferenceAsync is not null)
            return await _updateDraftReferenceAsync(jobId, reference, ct);

        return _jobInvoiceService is null
            ? JobInvoiceCreateResult.Fail(500, "Xero invoice service is unavailable.")
            : await _jobInvoiceService.UpdateDraftReferenceAsync(jobId, reference, ct);
    }

    private async Task<JobInvoiceCreateResult> UpdatePoReferenceAsync(long jobId, string poNumber, string reference, CancellationToken ct)
    {
        if (_updateDraftReferenceAsync is not null)
            return await _updateDraftReferenceAsync(jobId, reference, ct);

        return _jobInvoiceService is null
            ? JobInvoiceCreateResult.Fail(500, "Xero invoice service is unavailable.")
            : await _jobInvoiceService.UpdatePoReferenceAsync(jobId, poNumber, ct);
    }

    private async Task<JobInvoiceCreateResult> EmailInvoiceAsync(long jobId, CancellationToken ct)
    {
        if (_emailInvoiceAsync is not null)
            return await _emailInvoiceAsync(jobId, ct);

        return _jobInvoiceService is null
            ? JobInvoiceCreateResult.Fail(500, "Xero invoice service is unavailable.")
            : await _jobInvoiceService.EmailInvoiceAsync(jobId, ct);
    }

    private Task<JobInvoiceCreateResult> RepairInvoiceSentToContactAsync(long jobId, CancellationToken ct) =>
        _jobInvoiceService is null
            ? Task.FromResult(JobInvoiceCreateResult.Fail(500, "Xero invoice service is unavailable."))
            : _jobInvoiceService.RepairInvoiceSentToContactAsync(jobId, ct);

    private async Task<JobInvoiceCreateResult> MarkInvoiceWaitingPaymentAsync(long jobId, CancellationToken ct)
    {
        if (_markInvoiceWaitingPaymentAsync is not null)
            return await _markInvoiceWaitingPaymentAsync(jobId, ct);

        return _jobInvoiceService is null
            ? JobInvoiceCreateResult.Fail(500, "Xero invoice service is unavailable.")
            : await _jobInvoiceService.MarkInvoiceWaitingPaymentAsync(jobId, ct);
    }

    private async Task<GmailLabelResult> AddInvoicedLabelAsync(
        long? gmailAccountId,
        string? gmailThreadId,
        string? gmailMessageId,
        CancellationToken ct)
    {
        if (_addInvoicedLabelAsync is not null)
            return await _addInvoicedLabelAsync(gmailAccountId, gmailThreadId, gmailMessageId, ct);

        return _gmailLabelService is null
            ? GmailLabelResult.Fail(500, "Gmail label service is unavailable.")
            : await _gmailLabelService.AddInvoicedLabelAsync(gmailAccountId, gmailThreadId, gmailMessageId, ct);
    }

    private async Task RestoreLocalReferencesAsync(
        long jobId,
        long? invoiceId,
        string? originalJobPoNumber,
        string? originalJobInvoiceReference,
        string? originalInvoiceReference,
        CancellationToken ct)
    {
        try
        {
            var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == jobId, ct);
            if (job is not null)
            {
                job.PoNumber = originalJobPoNumber;
                job.InvoiceReference = originalJobInvoiceReference;
                job.UpdatedAt = DateTime.UtcNow;
            }

            if (invoiceId.HasValue)
            {
                var invoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.Id == invoiceId.Value, ct);
                if (invoice is not null)
                {
                    invoice.Reference = originalInvoiceReference;
                    invoice.UpdatedAt = DateTime.UtcNow;
                }
            }

            await _db.SaveChangesAsync(ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger?.LogWarning(ex, "PO confirm local reference restore failed for job {JobId}.", jobId);
        }
    }

    private async Task<JobPoState> EnsureStateAsync(long jobId, DateTime now, CancellationToken ct)
    {
        var state = await _db.JobPoStates.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (state is not null)
            return state;

        state = new JobPoState
        {
            JobId = jobId,
            CorrelationId = JobPoStateService.BuildCorrelationId(jobId),
            CreatedAt = now,
            UpdatedAt = now,
        };
        _db.JobPoStates.Add(state);
        return state;
    }

    private static string BuildModelText(Vehicle? vehicle)
    {
        if (vehicle is null)
            return "";

        return string.Join(
            " ",
            new[]
            {
                vehicle.Year?.ToString(),
                vehicle.Make,
                vehicle.Model,
            }.Where(x => !string.IsNullOrWhiteSpace(x)));
    }

    private static string BuildVehicleLabel(Vehicle? vehicle)
    {
        if (vehicle is null)
            return "";

        return string.Join(
            " ",
            new[]
            {
                vehicle.Plate,
                vehicle.Year?.ToString(),
                vehicle.Make,
                vehicle.Model,
            }.Where(x => !string.IsNullOrWhiteSpace(x)));
    }

    private static string ToPoStatusValue(JobPoStateStatus status) => status switch
    {
        JobPoStateStatus.Draft => "draft",
        JobPoStateStatus.AwaitingReply => "awaitingReply",
        JobPoStateStatus.PendingConfirmation => "pendingConfirmation",
        JobPoStateStatus.PoConfirmed => "poConfirmed",
        JobPoStateStatus.EscalationRequired => "escalationRequired",
        JobPoStateStatus.Completed => "completed",
        JobPoStateStatus.Cancelled => "cancelled",
        _ => status.ToString(),
    };

    private static string NormalizeStatusFilter(string? status)
    {
        if (string.IsNullOrWhiteSpace(status))
            return "";

        var trimmed = status.Trim();
        if (string.Equals(trimmed, "pendingSend", StringComparison.OrdinalIgnoreCase))
            return "pendingSend";
        if (string.Equals(trimmed, "awaitingPo", StringComparison.OrdinalIgnoreCase))
            return "awaitingPo";
        if (string.Equals(trimmed, "invoiced", StringComparison.OrdinalIgnoreCase))
            return "invoiced";

        return "unknown";
    }

    private static int NormalizePage(int page) => Math.Max(1, page);

    private static int NormalizePageSize(int pageSize)
    {
        if (pageSize <= 0)
            return 500;

        return Math.Min(pageSize, 1000);
    }

    private static DateTime GetLogOccurredAtUtc(GmailMessageLog log)
    {
        if (log.InternalDateMs.HasValue && log.InternalDateMs.Value > 0)
        {
            try
            {
                return DateTimeOffset.FromUnixTimeMilliseconds(log.InternalDateMs.Value).UtcDateTime;
            }
            catch
            {
                // Fall through to persisted timestamps.
            }
        }

        return log.UpdatedAt != default ? log.UpdatedAt : log.CreatedAt;
    }

    private static Dictionary<string, PoTodoStepResult> CreateConfirmPoSteps() => new()
    {
        ["xero"] = PoTodoStepResult.Pending("Waiting to update Xero reference."),
        ["xeroStatus"] = PoTodoStepResult.Pending("Waiting to update Xero invoice to Waiting Payment."),
        ["gmail"] = PoTodoStepResult.Pending("Waiting to add Gmail label."),
        ["savePo"] = PoTodoStepResult.Pending("Waiting to save PO."),
        ["poState"] = PoTodoStepResult.Pending("Waiting to update PO state."),
    };

    private sealed record PoTodoQueryRow(
        long JobId,
        DateTime CreatedAt,
        long? CustomerId,
        long? VehicleId,
        string? Notes,
        string? InvoiceReference,
        string? JobPoNumber,
        string? XeroReference,
        string? CorrelationId,
        string? GmailDraftId,
        DateTime? GmailDraftUpdatedAt,
        JobPoStateStatus? PoStatus,
        string? SentSource,
        DateTime? ManuallyMarkedSentAt,
        DateTime? FirstRequestSentAt,
        DateTime? LastRequestSentAt,
        DateTime? LastFollowUpSentAt,
        DateTime? LastSupplierReplyAt,
        string? DetectedPoNumber,
        string? ConfirmedPoNumber,
        string? PendingPoNumber,
        string? ConfirmationStatus,
        string? ConfirmationNote,
        DateTime? ConfirmationLastAttemptAt);

    private sealed record PoTodoSyncTarget(
        long Id,
        DateTime CreatedAt,
        string? CounterpartyEmail,
        string CorrelationId,
        JobPoStateStatus Status);

    private sealed record PoTodoInvoiceRow(
        long JobId,
        string? Reference,
        string? ExternalInvoiceId,
        string? ResponsePayloadJson,
        DateTime UpdatedAt,
        DateTime CreatedAt,
        long Id);
}

public sealed record PoTodoActionResult(bool Success, string? Error)
{
    public static PoTodoActionResult Ok() => new(true, null);
    public static PoTodoActionResult Fail(string error) => new(false, error);
}

public sealed record PoTodoCompleteResult(int Updated, int Skipped);

public sealed record PoDraftPreviewResult(
    long JobId,
    string To,
    string Subject,
    string HtmlBody,
    string? GmailDraftId);

public sealed record PoTodoStepResult(string Status, string Message)
{
    public static PoTodoStepResult Pending(string message) => new("pending", message);
    public static PoTodoStepResult Running(string message) => new("running", message);
    public static PoTodoStepResult Success(string message) => new("success", message);
    public static PoTodoStepResult Failed(string message) => new("failed", message);
}

public sealed record ConfirmPoResult(
    bool Success,
    long JobId,
    string PoNumber,
    string InvoiceReference,
    Dictionary<string, PoTodoStepResult> Steps);

public sealed record PoBatchConfirmItem(long JobId, string? PoNumber);
public sealed record PoXeroSummary(long JobId, decimal? Subtotal, string? Status, string? Reference, DateTime RefreshedAt);

public sealed record PoTodoListResult(
    int Total,
    IReadOnlyList<PoTodoRow> Items,
    int CurrentPage = 1,
    int PageSize = 500,
    int TotalPages = 1,
    DateTime? LastGmailSyncedAt = null);

public sealed record PoTodoRow(
    long JobId,
    DateTime CreatedAt,
    long? CustomerId,
    string CustomerName,
    string Code,
    string Plate,
    string Model,
    string Notes,
    string? Reference,
    string? XeroInvoiceId,
    string Status,
    string? SentSource,
    DateTime? ManuallyMarkedSentAt,
    DateTime? FirstRequestSentAt,
    DateTime? LastRequestSentAt,
    DateTime? LastFollowUpSentAt,
    DateTime? LastSupplierReplyAt,
    string? DetectedPoNumber,
    string? ConfirmedPoNumber,
    string? GmailDraftId,
    DateTime? GmailDraftUpdatedAt,
    string? GmailThreadId,
    string CorrelationId,
    string? PendingPoNumber,
    string? ConfirmationStatus,
    string? ConfirmationNote,
    DateTime? ConfirmationLastAttemptAt,
    decimal? XeroSubtotal);

public sealed record PoTodoSyncResult(int CheckedJobs, int SyncedMessages, IReadOnlyList<string> Warnings);
