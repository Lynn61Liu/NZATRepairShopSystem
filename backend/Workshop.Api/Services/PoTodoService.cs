using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Models;

namespace Workshop.Api.Services;

public sealed class PoTodoService
{
    private readonly AppDbContext _db;
    private readonly GmailThreadSyncService? _gmailThreadSyncService;
    private readonly JobPoStateService? _jobPoStateService;
    private readonly GmailLabelService? _gmailLabelService;
    private readonly JobInvoiceService? _jobInvoiceService;
    private readonly Func<long, string, CancellationToken, Task<JobInvoiceCreateResult>>? _updateDraftReferenceAsync;
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
        Func<long?, string?, string?, CancellationToken, Task<GmailLabelResult>>? addInvoicedLabelAsync = null)
    {
        _db = db;
        _gmailThreadSyncService = gmailThreadSyncService;
        _jobPoStateService = jobPoStateService;
        _gmailLabelService = gmailLabelService;
        _jobInvoiceService = jobInvoiceService;
        _updateDraftReferenceAsync = updateDraftReferenceAsync;
        _addInvoicedLabelAsync = addInvoicedLabelAsync;
        _logger = logger;
    }

    public async Task<PoTodoListResult> GetTodoAsync(string? status, CancellationToken ct)
    {
        var normalizedStatus = NormalizeStatusFilter(status);
        var query =
            from job in _db.Jobs.AsNoTracking()
            join state in _db.JobPoStates.AsNoTracking() on job.Id equals state.JobId into stateJoin
            from state in stateJoin.DefaultIfEmpty()
            where job.NeedsPo
            where job.Status == null || job.Status.ToLower() != "archived"
            where state == null || state.Status != JobPoStateStatus.Completed
            select new
            {
                Job = job,
                State = state,
            };

        query = normalizedStatus switch
        {
            "pendingSend" => query.Where(x => x.State == null || x.State.Status == JobPoStateStatus.Draft),
            "awaitingPo" => query.Where(x =>
                x.State != null &&
                (x.State.Status == JobPoStateStatus.AwaitingReply ||
                 x.State.Status == JobPoStateStatus.PendingConfirmation ||
                 x.State.Status == JobPoStateStatus.EscalationRequired)),
            "invoiced" => query.Where(x => x.State != null && x.State.Status == JobPoStateStatus.PoConfirmed),
            "unknown" => query.Where(_ => false),
            _ => query,
        };

        var rows = await query
            .OrderByDescending(x => x.Job.CreatedAt)
            .ThenByDescending(x => x.Job.Id)
            .Take(500)
            .Select(x => new PoTodoQueryRow(
                x.Job.Id,
                x.Job.CreatedAt,
                x.Job.CustomerId,
                x.Job.VehicleId,
                x.Job.Notes,
                x.Job.InvoiceReference,
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
                x.State == null ? null : x.State.ConfirmedPoNumber))
            .ToListAsync(ct);

        if (rows.Count == 0)
            return new PoTodoListResult(0, []);

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
            var correlationId = string.IsNullOrWhiteSpace(row.CorrelationId)
                ? JobPoStateService.BuildCorrelationId(row.JobId)
                : row.CorrelationId;

            latestThreadByCorrelationId.TryGetValue(correlationId, out var gmailThreadId);

            return new PoTodoRow(
                row.JobId,
                row.CreatedAt,
                customer?.BusinessCode ?? "",
                vehicle?.Plate ?? "",
                BuildModelText(vehicle),
                row.Notes ?? "",
                invoice?.Reference ?? row.InvoiceReference,
                invoice?.ExternalInvoiceId,
                ToPoStatusValue(row.PoStatus ?? JobPoStateStatus.Draft),
                row.SentSource,
                row.ManuallyMarkedSentAt,
                row.FirstRequestSentAt,
                row.LastRequestSentAt,
                row.LastFollowUpSentAt,
                row.LastSupplierReplyAt,
                row.DetectedPoNumber,
                row.ConfirmedPoNumber,
                row.GmailDraftId,
                row.GmailDraftUpdatedAt,
                gmailThreadId,
                correlationId);
        }).ToList();

        return new PoTodoListResult(items.Count, items);
    }

    public async Task<PoTodoSyncResult> SyncActiveAsync(CancellationToken ct)
    {
        var warnings = new List<string>();
        if (_jobPoStateService is null)
        {
            warnings.Add("PO state sync service is unavailable.");
            return new PoTodoSyncResult(0, 0, warnings);
        }

        await _jobPoStateService.EnsureStatesForNeedsPoJobsAsync(ct);

        var targets = await (
                from job in _db.Jobs.AsNoTracking()
                join state in _db.JobPoStates.AsNoTracking() on job.Id equals state.JobId
                where job.NeedsPo
                where job.Status == null || job.Status.ToLower() != "archived"
                where state.Status == JobPoStateStatus.Draft ||
                      state.Status == JobPoStateStatus.AwaitingReply ||
                      state.Status == JobPoStateStatus.PendingConfirmation ||
                      state.Status == JobPoStateStatus.EscalationRequired
                orderby job.CreatedAt descending, job.Id descending
                select new
                {
                    job.Id,
                    state.CounterpartyEmail,
                    state.CorrelationId,
                })
            .Take(500)
            .ToListAsync(ct);

        var syncedMessages = 0;

        foreach (var target in targets)
        {
            try
            {
                if (_gmailThreadSyncService is null)
                {
                    warnings.Add($"Gmail thread sync service is unavailable for job {target.Id}.");
                }
                else
                {
                    var result = await _gmailThreadSyncService.SyncThreadAsync(
                        target.CounterpartyEmail,
                        target.CorrelationId,
                        _gmailThreadSyncService.BackgroundThreadFetchLimit,
                        null,
                        ct);

                    syncedMessages += result.SyncedCount;
                    if (!string.IsNullOrWhiteSpace(result.Warning))
                        warnings.Add($"Job {target.Id}: {result.Warning}");
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger?.LogWarning(ex, "PO todo Gmail sync failed for job {JobId}.", target.Id);
                warnings.Add($"Job {target.Id}: {ex.Message}");
            }

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

        var states = await _db.JobPoStates
            .Where(x => distinctJobIds.Contains(x.JobId))
            .ToListAsync(ct);
        var now = DateTime.UtcNow;
        var updated = 0;

        foreach (var state in states.Where(x => x.Status == JobPoStateStatus.PoConfirmed))
        {
            state.Status = JobPoStateStatus.Completed;
            state.CompletedAt = now;
            state.UpdatedAt = now;
            updated++;
        }

        if (updated > 0)
            await _db.SaveChangesAsync(ct);

        return new PoTodoCompleteResult(updated, distinctJobIds.Length - updated);
    }

    public async Task<ConfirmPoResult> ConfirmPoAsync(long jobId, string? poNumber, CancellationToken ct)
    {
        var steps = CreateConfirmPoSteps();
        var normalizedPo = poNumber?.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(normalizedPo))
        {
            steps["savePo"] = PoTodoStepResult.Failed("PO number is required.");
            return new ConfirmPoResult(false, jobId, "", "", steps);
        }

        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == jobId && x.NeedsPo, ct);
        if (job is null)
        {
            steps["savePo"] = PoTodoStepResult.Failed("Job not found or does not need PO.");
            return new ConfirmPoResult(false, jobId, normalizedPo, "", steps);
        }

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
            xero = await UpdateDraftReferenceAsync(jobId, nextReference, ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger?.LogWarning(ex, "PO confirm Xero reference update failed for job {JobId}.", jobId);
            steps["xero"] = PoTodoStepResult.Failed(ex.Message);
            return new ConfirmPoResult(false, jobId, normalizedPo, nextReference, steps);
        }

        if (!xero.Ok)
        {
            steps["xero"] = PoTodoStepResult.Failed(xero.Error ?? "Failed to update Xero reference.");
            return new ConfirmPoResult(false, jobId, normalizedPo, nextReference, steps);
        }
        steps["xero"] = PoTodoStepResult.Success("Xero reference updated.");

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
            return new ConfirmPoResult(false, jobId, normalizedPo, nextReference, steps);
        }

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
            return new ConfirmPoResult(false, jobId, normalizedPo, nextReference, steps);
        }

        if (!gmail.Ok)
        {
            steps["gmail"] = PoTodoStepResult.Failed(gmail.Error ?? "Failed to add Gmail label.");
            return new ConfirmPoResult(false, jobId, normalizedPo, nextReference, steps);
        }
        steps["gmail"] = PoTodoStepResult.Success("Gmail label added.");

        steps["savePo"] = PoTodoStepResult.Running("Saving PO number.");
        steps["poState"] = PoTodoStepResult.Running("Updating PO state.");
        var now = DateTime.UtcNow;
        var state = await EnsureStateAsync(jobId, now, ct);
        job.PoNumber = normalizedPo;
        job.InvoiceReference = nextReference;
        job.UpdatedAt = now;
        state.Status = JobPoStateStatus.PoConfirmed;
        state.ConfirmedPoNumber = normalizedPo;
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

    private async Task<JobInvoiceCreateResult> UpdateDraftReferenceAsync(long jobId, string reference, CancellationToken ct)
    {
        if (_updateDraftReferenceAsync is not null)
            return await _updateDraftReferenceAsync(jobId, reference, ct);

        return _jobInvoiceService is null
            ? JobInvoiceCreateResult.Fail(500, "Xero invoice service is unavailable.")
            : await _jobInvoiceService.UpdateDraftReferenceAsync(jobId, reference, ct);
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
        ["savePo"] = PoTodoStepResult.Pending("Waiting to save PO."),
        ["xero"] = PoTodoStepResult.Pending("Waiting to update Xero reference."),
        ["gmail"] = PoTodoStepResult.Pending("Waiting to add Gmail label."),
        ["poState"] = PoTodoStepResult.Pending("Waiting to update PO state."),
    };

    private sealed record PoTodoQueryRow(
        long JobId,
        DateTime CreatedAt,
        long? CustomerId,
        long? VehicleId,
        string? Notes,
        string? InvoiceReference,
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
        string? ConfirmedPoNumber);
}

public sealed record PoTodoActionResult(bool Success, string? Error)
{
    public static PoTodoActionResult Ok() => new(true, null);
    public static PoTodoActionResult Fail(string error) => new(false, error);
}

public sealed record PoTodoCompleteResult(int Updated, int Skipped);

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

public sealed record PoTodoListResult(int Total, IReadOnlyList<PoTodoRow> Items);

public sealed record PoTodoRow(
    long JobId,
    DateTime CreatedAt,
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
    string CorrelationId);

public sealed record PoTodoSyncResult(int CheckedJobs, int SyncedMessages, IReadOnlyList<string> Warnings);
