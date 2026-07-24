using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Models;

namespace Workshop.Api.Services;

public sealed class InvoiceOutboxService
{
    public const string CreateDraftMessageType = "job_invoice.create_draft";
    public const string AttachExistingMessageType = "job_invoice.attach_existing";
    public const string ReplaceExistingMessageType = "job_invoice.replace_existing";
    public const string SyncWofDraftMessageType = "job_invoice.sync_wof_draft";
    public const string RemoveWofDraftItemsMessageType = "job_invoice.remove_wof_draft_items";
    public const string SyncJobContentDraftMessageType = "job_invoice.sync_job_content_draft";
    public const string SyncPoStateMessageType = "job_po.sync_state";
    public const string JobAggregateType = "job";
    private const string JobsListVersionCacheKey = "jobs:list:version:v1";
    private static readonly TimeSpan JobsListVersionCacheDuration = TimeSpan.FromDays(30);

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly AppDbContext _db;
    private readonly IAppCache _cache;
    private readonly JobInvoiceService _jobInvoiceService;
    private readonly JobPoStateService _jobPoStateService;
    private readonly ILogger<InvoiceOutboxService> _logger;

    public InvoiceOutboxService(
        AppDbContext db,
        IAppCache cache,
        JobInvoiceService jobInvoiceService,
        JobPoStateService jobPoStateService,
        ILogger<InvoiceOutboxService> logger)
    {
        _db = db;
        _cache = cache;
        _jobInvoiceService = jobInvoiceService;
        _jobPoStateService = jobPoStateService;
        _logger = logger;
    }

    public OutboxMessage BuildCreateDraftMessage(long jobId, DateTime utcNow)
        => BuildMessage(CreateDraftMessageType, jobId, new CreateDraftPayload(jobId), utcNow);

    public OutboxMessage BuildAttachExistingMessage(long jobId, string invoiceNumber, DateTime utcNow)
        => BuildMessage(
            AttachExistingMessageType,
            jobId,
            new AttachExistingPayload(jobId, invoiceNumber.Trim()),
            utcNow);

    public OutboxMessage BuildReplaceExistingMessage(long jobId, string invoiceNumber, DateTime utcNow)
        => BuildMessage(
            ReplaceExistingMessageType,
            jobId,
            new ReplaceExistingPayload(jobId, invoiceNumber.Trim()),
            utcNow);

    public OutboxMessage BuildSyncPoStateMessage(long jobId, DateTime utcNow)
        => BuildMessage(SyncPoStateMessageType, jobId, new SyncPoStatePayload(jobId), utcNow);

    public OutboxMessage BuildSyncWofDraftMessage(long jobId, DateTime utcNow)
        => BuildMessage(SyncWofDraftMessageType, jobId, new SyncWofDraftPayload(jobId), utcNow);

    public OutboxMessage BuildSyncJobContentDraftMessage(
        long jobId,
        IReadOnlyCollection<string> legacyNoteDescriptions,
        DateTime utcNow,
        bool syncReference = false,
        bool referenceOnly = false)
        => BuildMessage(
            SyncJobContentDraftMessageType,
            jobId,
            new SyncJobContentDraftPayload(jobId, legacyNoteDescriptions, syncReference, referenceOnly),
            utcNow);

    public OutboxMessage BuildRemoveWofDraftItemsMessage(
        long jobId,
        IReadOnlyList<RemovedServiceSelectionPayload> selections,
        DateTime utcNow)
        => BuildMessage(RemoveWofDraftItemsMessageType, jobId, new RemoveWofDraftItemsPayload(jobId, selections), utcNow);

    public async Task<InvoiceOutboxEnqueueResult> EnqueueCreateDraftAsync(long jobId, CancellationToken ct)
    {
        var existingInvoice = await _db.JobInvoices.AsNoTracking().AnyAsync(x => x.JobId == jobId, ct);
        if (existingInvoice)
            return InvoiceOutboxEnqueueResult.AsAlreadyHandled("Invoice already exists.");

        var active = await FindActiveInvoiceMessageAsync(jobId, ct);
        if (active is not null)
            return InvoiceOutboxEnqueueResult.Queued(active.Id, active.Status);

        var now = DateTime.UtcNow;
        var message = BuildCreateDraftMessage(jobId, now);
        _db.OutboxMessages.Add(message);
        await _db.SaveChangesAsync(ct);
        return InvoiceOutboxEnqueueResult.Queued(message.Id, message.Status);
    }

    public async Task<InvoiceOutboxEnqueueResult> EnqueueAttachExistingAsync(long jobId, string invoiceNumber, CancellationToken ct)
    {
        var normalizedInvoiceNumber = invoiceNumber.Trim();
        if (string.IsNullOrWhiteSpace(normalizedInvoiceNumber))
            return InvoiceOutboxEnqueueResult.Fail("Invoice number is required.");

        var existingInvoice = await _db.JobInvoices.AsNoTracking().AnyAsync(x => x.JobId == jobId, ct);
        if (existingInvoice)
            return InvoiceOutboxEnqueueResult.AsAlreadyHandled("Invoice already exists.");

        var active = await FindActiveInvoiceMessageAsync(jobId, ct);
        if (active is not null)
            return InvoiceOutboxEnqueueResult.Queued(active.Id, active.Status);

        var now = DateTime.UtcNow;
        var message = BuildAttachExistingMessage(jobId, normalizedInvoiceNumber, now);
        _db.OutboxMessages.Add(message);
        await _db.SaveChangesAsync(ct);
        return InvoiceOutboxEnqueueResult.Queued(message.Id, message.Status);
    }

    public async Task<InvoiceOutboxEnqueueResult> EnqueueReplaceExistingAsync(long jobId, string invoiceNumber, CancellationToken ct)
    {
        var normalizedInvoiceNumber = invoiceNumber.Trim();
        if (string.IsNullOrWhiteSpace(normalizedInvoiceNumber))
            return InvoiceOutboxEnqueueResult.Fail("Invoice number is required.");

        var existingInvoice = await _db.JobInvoices.AsNoTracking().AnyAsync(x => x.JobId == jobId, ct);
        if (!existingInvoice)
            return await EnqueueAttachExistingAsync(jobId, normalizedInvoiceNumber, ct);

        var active = await FindActiveInvoiceMessageAsync(jobId, ct);
        if (active is not null)
            return InvoiceOutboxEnqueueResult.Queued(active.Id, active.Status);

        var now = DateTime.UtcNow;
        var message = BuildReplaceExistingMessage(jobId, normalizedInvoiceNumber, now);
        _db.OutboxMessages.Add(message);
        await _db.SaveChangesAsync(ct);
        return InvoiceOutboxEnqueueResult.Queued(message.Id, message.Status);
    }

    public async Task<InvoiceOutboxEnqueueResult> EnqueuePoStateSyncAsync(long jobId, CancellationToken ct)
    {
        var active = await FindActiveMessageAsync(jobId, SyncPoStateMessageType, ct);
        if (active is not null)
            return InvoiceOutboxEnqueueResult.Queued(active.Id, active.Status);

        var now = DateTime.UtcNow;
        var message = BuildSyncPoStateMessage(jobId, now);
        _db.OutboxMessages.Add(message);
        await _db.SaveChangesAsync(ct);
        return InvoiceOutboxEnqueueResult.Queued(message.Id, message.Status);
    }

    public Task<InvoiceOutboxEnqueueResult> EnqueueSyncJobContentDraftAsync(
        long jobId,
        IEnumerable<string?>? legacyNoteDescriptions,
        CancellationToken ct)
        => EnqueueSyncJobDraftAsync(
            jobId,
            legacyNoteDescriptions,
            syncReference: false,
            referenceOnly: false,
            ct: ct);

    public Task<InvoiceOutboxEnqueueResult> EnqueueSyncVehicleReferenceAsync(long jobId, CancellationToken ct)
        => EnqueueSyncJobDraftAsync(
            jobId,
            null,
            syncReference: true,
            referenceOnly: true,
            ct: ct);

    public async Task<int> EnqueueVehicleReferenceBackfillAsync(CancellationToken ct)
    {
        var jobIds = await (
                from invoice in _db.JobInvoices.AsNoTracking()
                join job in _db.Jobs.AsNoTracking() on invoice.JobId equals job.Id
                join customer in _db.Customers.AsNoTracking() on job.CustomerId equals customer.Id
                join vehicle in _db.Vehicles.AsNoTracking() on job.VehicleId equals vehicle.Id
                where EF.Functions.ILike(invoice.Provider, "xero")
                    && (EF.Functions.ILike(invoice.ExternalStatus ?? "", "draft")
                        || EF.Functions.ILike(invoice.ExternalStatus ?? "", "submitted")
                        || EF.Functions.ILike(invoice.ExternalStatus ?? "", "authorised"))
                    && EF.Functions.ILike(customer.Type, "business")
                    && vehicle.Year.HasValue
                    && vehicle.Year.Value > 0
                    && vehicle.Make != null
                    && vehicle.Make != ""
                    && vehicle.Model != null
                    && vehicle.Model != ""
                    && (EF.Functions.ILike(invoice.Reference ?? "", "%[year]%")
                        || EF.Functions.ILike(invoice.Reference ?? "", "%[make]%")
                        || EF.Functions.ILike(invoice.Reference ?? "", "%[model]%")
                        || EF.Functions.ILike(invoice.Reference ?? "", "%[rego]%"))
                select job.Id)
            .Distinct()
            .ToListAsync(ct);

        foreach (var jobId in jobIds)
            await EnqueueSyncVehicleReferenceAsync(jobId, ct);

        return jobIds.Count;
    }

    private async Task<InvoiceOutboxEnqueueResult> EnqueueSyncJobDraftAsync(
        long jobId,
        IEnumerable<string?>? legacyNoteDescriptions,
        bool syncReference,
        bool referenceOnly,
        CancellationToken ct)
    {
        var ownsTransaction = _db.Database.IsRelational() && _db.Database.CurrentTransaction is null;
        await using var transaction = ownsTransaction
            ? await _db.Database.BeginTransactionAsync(ct)
            : null;
        var now = DateTime.UtcNow;
        var legacyNotes = (legacyNoteDescriptions ?? [])
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x!.Trim())
            .Distinct(StringComparer.Ordinal)
            .ToList();

        OutboxMessage? pending;
        if (_db.Database.IsRelational())
        {
            var pendingRows = await _db.OutboxMessages
                .FromSqlInterpolated($@"
                    SELECT *
                    FROM outbox_messages
                    WHERE aggregate_type = {JobAggregateType}
                      AND aggregate_id = {jobId}
                      AND message_type = {SyncJobContentDraftMessageType}
                      AND status = 'pending'
                    ORDER BY created_at DESC
                    LIMIT 1
                    FOR UPDATE")
                .ToListAsync(ct);
            pending = pendingRows.FirstOrDefault();
        }
        else
        {
            pending = await _db.OutboxMessages
                .Where(x => x.AggregateType == JobAggregateType
                    && x.AggregateId == jobId
                    && x.MessageType == SyncJobContentDraftMessageType
                    && x.Status == "pending")
                .OrderByDescending(x => x.CreatedAt)
                .FirstOrDefaultAsync(ct);
        }

        if (pending is not null)
        {
            var existingPayload = JsonSerializer.Deserialize<SyncJobContentDraftPayload>(pending.PayloadJson, JsonOptions);
            var mergedNotes = (existingPayload?.LegacyNoteDescriptions ?? [])
                .Concat(legacyNotes)
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Select(x => x.Trim())
                .Distinct(StringComparer.Ordinal)
                .ToArray();
            pending.PayloadJson = JsonSerializer.Serialize(
                new SyncJobContentDraftPayload(
                    jobId,
                    mergedNotes,
                    SyncReference: existingPayload?.SyncReference == true || syncReference,
                    ReferenceOnly: existingPayload?.ReferenceOnly == true && referenceOnly),
                JsonOptions);
            pending.AvailableAt = now.AddSeconds(5);
            pending.UpdatedAt = now;
            await _db.SaveChangesAsync(ct);
            if (transaction is not null)
                await transaction.CommitAsync(ct);
            return InvoiceOutboxEnqueueResult.Queued(pending.Id, pending.Status);
        }

        var message = BuildSyncJobContentDraftMessage(
            jobId,
            legacyNotes,
            now,
            syncReference,
            referenceOnly);
        message.AvailableAt = now.AddSeconds(5);
        _db.OutboxMessages.Add(message);
        await _db.SaveChangesAsync(ct);
        if (transaction is not null)
            await transaction.CommitAsync(ct);
        return InvoiceOutboxEnqueueResult.Queued(message.Id, message.Status);
    }

    public async Task<List<OutboxMessage>> ClaimPendingBatchAsync(int batchSize, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        await using var transaction = await _db.Database.BeginTransactionAsync(ct);

        var messages = await _db.OutboxMessages
            .FromSqlInterpolated($@"
                SELECT *
                FROM outbox_messages
                WHERE status = 'pending'
                  AND available_at <= {now}
                  AND message_type IN ({CreateDraftMessageType}, {AttachExistingMessageType}, {ReplaceExistingMessageType}, {SyncWofDraftMessageType}, {RemoveWofDraftItemsMessageType}, {SyncJobContentDraftMessageType}, {SyncPoStateMessageType})
                ORDER BY created_at
                FOR UPDATE SKIP LOCKED
                LIMIT {batchSize}")
            .ToListAsync(ct);

        if (messages.Count == 0)
        {
            await transaction.CommitAsync(ct);
            return messages;
        }

        foreach (var message in messages)
        {
            message.Status = "processing";
            message.LockedAt = now;
            message.UpdatedAt = now;
        }

        await _db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        foreach (var message in messages)
            await InvalidateJobCachesAsync(message.AggregateType, message.AggregateId, ct);
        return messages;
    }

    public async Task<int> RecoverStaleProcessingAsync(TimeSpan staleAfter, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var cutoff = now.Subtract(staleAfter);
        var recovered = await _db.OutboxMessages
            .Where(x => x.Status == "processing"
                && x.LockedAt.HasValue
                && x.LockedAt.Value < cutoff
                && x.AttemptCount < 5
                && (x.MessageType == CreateDraftMessageType
                    || x.MessageType == AttachExistingMessageType
                    || x.MessageType == ReplaceExistingMessageType
                    || x.MessageType == SyncWofDraftMessageType
                    || x.MessageType == RemoveWofDraftItemsMessageType
                    || x.MessageType == SyncJobContentDraftMessageType
                    || x.MessageType == SyncPoStateMessageType))
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(x => x.Status, "pending")
                .SetProperty(x => x.LockedAt, (DateTime?)null)
                .SetProperty(x => x.AvailableAt, now)
                .SetProperty(x => x.UpdatedAt, now)
                .SetProperty(x => x.AttemptCount, x => x.AttemptCount + 1)
                .SetProperty(x => x.LastError, "Recovered after interrupted background processing."), ct);

        if (recovered > 0)
        {
            _logger.LogWarning(
                "Recovered {RecoveredCount} stale invoice outbox message(s) locked before {Cutoff}.",
                recovered,
                cutoff);
        }

        return recovered;
    }

    public async Task ProcessAsync(OutboxMessage message, CancellationToken ct)
    {
        try
        {
            var dispatchResult = await DispatchAsync(message, ct);
            if (dispatchResult.Ok)
            {
                await MarkSucceededAsync(message.Id, ct);
                return;
            }

            await MarkFailedAsync(
                message.Id,
                dispatchResult.Error ?? "Invoice outbox processing failed.",
                retryable: dispatchResult.Retryable,
                ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Invoice outbox processing threw for message {MessageId}", message.Id);
            if (ct.IsCancellationRequested)
            {
                using var cleanupTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
                await MarkFailedAsync(
                    message.Id,
                    FormatExceptionForDisplay(ex),
                    retryable: true,
                    cleanupTimeout.Token);
            }
            else
            {
                await MarkFailedAsync(message.Id, FormatExceptionForDisplay(ex), retryable: true, ct);
            }
        }
    }

    public async Task<bool> TryStartMessageNowAsync(long messageId, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        await using var transaction = await _db.Database.BeginTransactionAsync(ct);

        var message = await _db.OutboxMessages
            .FromSqlInterpolated($@"
                SELECT *
                FROM outbox_messages
                WHERE id = {messageId}
                  AND status = 'pending'
                  AND available_at <= {now}
                  AND message_type IN ({CreateDraftMessageType}, {AttachExistingMessageType}, {ReplaceExistingMessageType}, {SyncWofDraftMessageType}, {RemoveWofDraftItemsMessageType}, {SyncJobContentDraftMessageType}, {SyncPoStateMessageType})
                FOR UPDATE SKIP LOCKED")
            .FirstOrDefaultAsync(ct);

        if (message is null)
        {
            await transaction.CommitAsync(ct);
            return false;
        }

        message.Status = "processing";
        message.LockedAt = now;
        message.UpdatedAt = now;

        await _db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        await InvalidateJobCachesAsync(message.AggregateType, message.AggregateId, ct);
        return true;
    }

    public async Task<bool> TryProcessClaimedMessageNowAsync(long messageId, CancellationToken ct)
    {
        var message = await _db.OutboxMessages
            .AsNoTracking()
            .FirstOrDefaultAsync(
                x => x.Id == messageId &&
                     x.Status == "processing" &&
                     (x.MessageType == CreateDraftMessageType ||
                      x.MessageType == AttachExistingMessageType ||
                      x.MessageType == ReplaceExistingMessageType ||
                      x.MessageType == SyncWofDraftMessageType ||
                      x.MessageType == RemoveWofDraftItemsMessageType ||
                      x.MessageType == SyncJobContentDraftMessageType ||
                      x.MessageType == SyncPoStateMessageType),
                ct);

        if (message is null)
            return false;

        await ProcessAsync(message, ct);
        return true;
    }

    public async Task<bool> TryProcessMessageNowAsync(long messageId, CancellationToken ct)
    {
        var started = await TryStartMessageNowAsync(messageId, ct);
        if (!started)
            return false;

        return await TryProcessClaimedMessageNowAsync(messageId, ct);
    }

    private async Task<InvoiceOutboxDispatchResult> DispatchAsync(OutboxMessage message, CancellationToken ct)
    {
        return message.MessageType switch
        {
            CreateDraftMessageType => await ProcessCreateDraftAsync(message, ct),
            AttachExistingMessageType => await ProcessAttachExistingAsync(message, ct),
            ReplaceExistingMessageType => await ProcessReplaceExistingAsync(message, ct),
            SyncWofDraftMessageType => await ProcessSyncWofDraftAsync(message, ct),
            RemoveWofDraftItemsMessageType => await ProcessRemoveWofDraftItemsAsync(message, ct),
            SyncJobContentDraftMessageType => await ProcessSyncJobContentDraftAsync(message, ct),
            SyncPoStateMessageType => await ProcessSyncPoStateAsync(message, ct),
            _ => InvoiceOutboxDispatchResult.Fail($"Unsupported invoice outbox message type '{message.MessageType}'."),
        };
    }

    private async Task<InvoiceOutboxDispatchResult> ProcessCreateDraftAsync(OutboxMessage message, CancellationToken ct)
    {
        var payload = JsonSerializer.Deserialize<CreateDraftPayload>(message.PayloadJson, JsonOptions);
        if (payload is null || payload.JobId <= 0)
            return InvoiceOutboxDispatchResult.Fail("Invalid create draft outbox payload.");

        var result = await _jobInvoiceService.CreateDraftForJobAsync(payload.JobId, ct);
        var reconnectRequired = RequiresXeroReconnect(result.Error);
        return result.Ok
            ? InvoiceOutboxDispatchResult.Success()
            : InvoiceOutboxDispatchResult.Fail(
                result.Error ?? "Failed to create draft invoice.",
                !reconnectRequired && IsRetryableStatusCode(result.StatusCode));
    }

    private async Task<InvoiceOutboxDispatchResult> ProcessAttachExistingAsync(OutboxMessage message, CancellationToken ct)
    {
        var payload = JsonSerializer.Deserialize<AttachExistingPayload>(message.PayloadJson, JsonOptions);
        if (payload is null || payload.JobId <= 0 || string.IsNullOrWhiteSpace(payload.InvoiceNumber))
            return InvoiceOutboxDispatchResult.Fail("Invalid attach existing invoice outbox payload.");

        var result = await _jobInvoiceService.AttachExistingXeroInvoiceAsync(payload.JobId, payload.InvoiceNumber, ct);
        var reconnectRequired = RequiresXeroReconnect(result.Error);
        return result.Ok
            ? InvoiceOutboxDispatchResult.Success()
            : InvoiceOutboxDispatchResult.Fail(
                result.Error ?? "Failed to attach existing Xero invoice.",
                !reconnectRequired && IsRetryableStatusCode(result.StatusCode));
    }

    private async Task<InvoiceOutboxDispatchResult> ProcessReplaceExistingAsync(OutboxMessage message, CancellationToken ct)
    {
        var payload = JsonSerializer.Deserialize<ReplaceExistingPayload>(message.PayloadJson, JsonOptions);
        if (payload is null || payload.JobId <= 0 || string.IsNullOrWhiteSpace(payload.InvoiceNumber))
            return InvoiceOutboxDispatchResult.Fail("Invalid replace existing invoice outbox payload.", retryable: false);

        var result = await _jobInvoiceService.ReplaceExistingXeroInvoiceAsync(payload.JobId, payload.InvoiceNumber, ct);
        var reconnectRequired = RequiresXeroReconnect(result.Error);
        return result.Ok
            ? InvoiceOutboxDispatchResult.Success()
            : InvoiceOutboxDispatchResult.Fail(
                result.Error ?? "Failed to replace linked Xero invoice.",
                !reconnectRequired && IsRetryableStatusCode(result.StatusCode));
    }

    private async Task<InvoiceOutboxDispatchResult> ProcessSyncWofDraftAsync(OutboxMessage message, CancellationToken ct)
    {
        var payload = JsonSerializer.Deserialize<SyncWofDraftPayload>(message.PayloadJson, JsonOptions);
        if (payload is null || payload.JobId <= 0)
            return InvoiceOutboxDispatchResult.Fail("Invalid WOF draft sync outbox payload.");

        var result = await _jobInvoiceService.SyncWofItemsToDraftAsync(payload.JobId, ct);
        return result.Ok
            ? InvoiceOutboxDispatchResult.Success()
            : InvoiceOutboxDispatchResult.Fail(
                result.Error ?? "Failed to sync WOF item to draft invoice.",
                IsRetryableStatusCode(result.StatusCode));
    }

    private async Task<InvoiceOutboxDispatchResult> ProcessRemoveWofDraftItemsAsync(OutboxMessage message, CancellationToken ct)
    {
        var payload = JsonSerializer.Deserialize<RemoveWofDraftItemsPayload>(message.PayloadJson, JsonOptions);
        if (payload is null || payload.JobId <= 0)
            return InvoiceOutboxDispatchResult.Fail("Invalid remove WOF draft items outbox payload.");

        var result = await _jobInvoiceService.RemoveServiceItemsFromDraftAsync(
            payload.JobId,
            payload.Selections.Select(x => new JobInvoiceService.ServiceSelectionSnapshot(x.ServiceCatalogItemId, x.ServiceNameSnapshot)).ToArray(),
            ct);

        return result.Ok
            ? InvoiceOutboxDispatchResult.Success()
            : InvoiceOutboxDispatchResult.Fail(
                result.Error ?? "Failed to remove WOF item from draft invoice.",
                IsRetryableStatusCode(result.StatusCode));
    }

    private async Task<InvoiceOutboxDispatchResult> ProcessSyncJobContentDraftAsync(OutboxMessage message, CancellationToken ct)
    {
        var payload = JsonSerializer.Deserialize<SyncJobContentDraftPayload>(message.PayloadJson, JsonOptions);
        if (payload is null || payload.JobId <= 0)
            return InvoiceOutboxDispatchResult.Fail("Invalid job content draft sync payload.", retryable: false);

        if (payload.SyncReference)
        {
            var referenceResult = await _jobInvoiceService.SyncVehicleReferenceToXeroAsync(payload.JobId, ct);
            if (!referenceResult.Ok)
            {
                return InvoiceOutboxDispatchResult.Fail(
                    referenceResult.Error ?? "Failed to sync vehicle reference to Xero invoice.",
                    IsRetryableStatusCode(referenceResult.StatusCode));
            }
        }

        if (payload.ReferenceOnly)
            return InvoiceOutboxDispatchResult.Success();

        var result = await _jobInvoiceService.SyncManagedJobContentToDraftAsync(
            payload.JobId,
            payload.LegacyNoteDescriptions,
            ct);
        return result.Ok
            ? InvoiceOutboxDispatchResult.Success()
            : InvoiceOutboxDispatchResult.Fail(
                result.Error ?? "Failed to sync job content to Xero draft invoice.",
                IsRetryableStatusCode(result.StatusCode));
    }

    private async Task<InvoiceOutboxDispatchResult> ProcessSyncPoStateAsync(OutboxMessage message, CancellationToken ct)
    {
        var payload = JsonSerializer.Deserialize<SyncPoStatePayload>(message.PayloadJson, JsonOptions);
        if (payload is null || payload.JobId <= 0)
            return InvoiceOutboxDispatchResult.Fail("Invalid PO sync outbox payload.");

        await _jobPoStateService.SyncStateForJobAsync(payload.JobId, ct);
        return InvoiceOutboxDispatchResult.Success();
    }

    private async Task MarkSucceededAsync(long messageId, CancellationToken ct)
    {
        var message = await _db.OutboxMessages.FirstOrDefaultAsync(x => x.Id == messageId, ct);
        if (message is null) return;

        var now = DateTime.UtcNow;
        message.Status = "succeeded";
        message.ProcessedAt = now;
        message.LockedAt = null;
        message.LastError = null;
        message.UpdatedAt = now;
        await _db.SaveChangesAsync(ct);
        await InvalidateJobCachesAsync(message.AggregateType, message.AggregateId, ct);
    }

    private async Task MarkFailedAsync(long messageId, string error, bool retryable, CancellationToken ct)
    {
        var message = await _db.OutboxMessages.FirstOrDefaultAsync(x => x.Id == messageId, ct);
        if (message is null) return;

        var now = DateTime.UtcNow;
        message.AttemptCount += 1;
        message.LastError = error;
        message.LockedAt = null;
        message.UpdatedAt = now;
        if (retryable && message.AttemptCount < 5)
        {
            message.Status = "pending";
            message.AvailableAt = now.Add(GetRetryDelay(message.AttemptCount));
        }
        else
        {
            message.Status = "failed";
            message.ProcessedAt = now;
        }

        await _db.SaveChangesAsync(ct);
        await InvalidateJobCachesAsync(message.AggregateType, message.AggregateId, ct);
    }

    private async Task<OutboxMessage?> FindActiveMessageAsync(long jobId, string messageType, CancellationToken ct)
        => await _db.OutboxMessages.AsNoTracking()
            .Where(x => x.AggregateType == JobAggregateType
                && x.AggregateId == jobId
                && x.MessageType == messageType
                && (x.Status == "pending" || x.Status == "processing"))
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefaultAsync(ct);

    private async Task<OutboxMessage?> FindActiveInvoiceMessageAsync(long jobId, CancellationToken ct)
        => await _db.OutboxMessages.AsNoTracking()
            .Where(x => x.AggregateType == JobAggregateType
                && x.AggregateId == jobId
                && (x.MessageType == CreateDraftMessageType
                    || x.MessageType == AttachExistingMessageType
                    || x.MessageType == ReplaceExistingMessageType)
                && (x.Status == "pending" || x.Status == "processing"))
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefaultAsync(ct);

    private static OutboxMessage BuildMessage(string messageType, long jobId, object payload, DateTime utcNow)
        => new()
        {
            MessageType = messageType,
            AggregateType = JobAggregateType,
            AggregateId = jobId,
            PayloadJson = JsonSerializer.Serialize(payload, JsonOptions),
            Status = "pending",
            AttemptCount = 0,
            AvailableAt = utcNow,
            CreatedAt = utcNow,
            UpdatedAt = utcNow,
        };

    private static TimeSpan GetRetryDelay(int attemptCount)
        => attemptCount switch
        {
            1 => TimeSpan.FromSeconds(10),
            2 => TimeSpan.FromSeconds(30),
            3 => TimeSpan.FromMinutes(1),
            4 => TimeSpan.FromMinutes(2),
            _ => TimeSpan.FromMinutes(5),
        };

    private static bool IsRetryableStatusCode(int statusCode)
        => statusCode == 0 || statusCode == 408 || statusCode == 429 || statusCode >= 500;

    public static bool RequiresXeroReconnect(string? error)
    {
        if (string.IsNullOrWhiteSpace(error))
            return false;

        return error.Contains("invalid_grant", StringComparison.OrdinalIgnoreCase)
            || error.Contains("refresh token is invalid or expired", StringComparison.OrdinalIgnoreCase)
            || error.Contains("Missing configuration: Xero:RefreshToken", StringComparison.OrdinalIgnoreCase);
    }

    private static string FormatExceptionForDisplay(Exception ex)
    {
        var typeName = ex.GetType().Name;
        var message = string.IsNullOrWhiteSpace(ex.Message) ? "Unexpected error." : ex.Message.Trim();

        if (ex.InnerException is not null && !string.IsNullOrWhiteSpace(ex.InnerException.Message))
            return $"{typeName}: {message} | Inner: {ex.InnerException.GetType().Name}: {ex.InnerException.Message.Trim()}";

        return $"{typeName}: {message}";
    }

    private async Task InvalidateJobCachesAsync(string aggregateType, long aggregateId, CancellationToken ct)
    {
        if (!string.Equals(aggregateType, JobAggregateType, StringComparison.OrdinalIgnoreCase) || aggregateId <= 0)
            return;

        await _cache.RemoveAsync(GetJobDetailCacheKey(aggregateId), ct);
        await _cache.SetStringAsync(
            JobsListVersionCacheKey,
            DateTime.UtcNow.Ticks.ToString(),
            JobsListVersionCacheDuration,
            ct);
    }

    private static string GetJobDetailCacheKey(long jobId)
        => $"job:detail:{jobId}:v1";

    private sealed record CreateDraftPayload(long JobId);
    private sealed record AttachExistingPayload(long JobId, string InvoiceNumber);
    private sealed record ReplaceExistingPayload(long JobId, string InvoiceNumber);
    private sealed record SyncWofDraftPayload(long JobId);
    private sealed record SyncJobContentDraftPayload(
        long JobId,
        IReadOnlyCollection<string> LegacyNoteDescriptions,
        bool SyncReference = false,
        bool ReferenceOnly = false);
    public sealed record RemovedServiceSelectionPayload(long ServiceCatalogItemId, string ServiceNameSnapshot);
    private sealed record RemoveWofDraftItemsPayload(long JobId, IReadOnlyList<RemovedServiceSelectionPayload> Selections);
    private sealed record SyncPoStatePayload(long JobId);
}

public sealed record InvoiceOutboxEnqueueResult(bool Ok, bool AlreadyHandled, long? MessageId, string Status, string? Error = null)
{
    public static InvoiceOutboxEnqueueResult Queued(long? messageId, string status)
        => new(true, false, messageId, status);

    public static InvoiceOutboxEnqueueResult AsAlreadyHandled(string? error = null)
        => new(true, true, null, "already_handled", error);

    public static InvoiceOutboxEnqueueResult Fail(string error)
        => new(false, false, null, "failed", error);
}

public sealed record InvoiceOutboxDispatchResult(bool Ok, string? Error = null, bool Retryable = true)
{
    public static InvoiceOutboxDispatchResult Success() => new(true);
    public static InvoiceOutboxDispatchResult Fail(string error, bool retryable = true) => new(false, error, retryable);
}
