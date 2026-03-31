using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Models;

namespace Workshop.Api.Services;

public sealed class InvoiceOutboxService
{
    public const string CreateDraftMessageType = "job_invoice.create_draft";
    public const string AttachExistingMessageType = "job_invoice.attach_existing";
    public const string SyncWofDraftMessageType = "job_invoice.sync_wof_draft";
    public const string RemoveWofDraftItemsMessageType = "job_invoice.remove_wof_draft_items";
    public const string SyncPoStateMessageType = "job_po.sync_state";
    public const string JobAggregateType = "job";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly AppDbContext _db;
    private readonly JobInvoiceService _jobInvoiceService;
    private readonly JobPoStateService _jobPoStateService;
    private readonly ILogger<InvoiceOutboxService> _logger;

    public InvoiceOutboxService(
        AppDbContext db,
        JobInvoiceService jobInvoiceService,
        JobPoStateService jobPoStateService,
        ILogger<InvoiceOutboxService> logger)
    {
        _db = db;
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

    public OutboxMessage BuildSyncPoStateMessage(long jobId, DateTime utcNow)
        => BuildMessage(SyncPoStateMessageType, jobId, new SyncPoStatePayload(jobId), utcNow);

    public OutboxMessage BuildSyncWofDraftMessage(long jobId, DateTime utcNow)
        => BuildMessage(SyncWofDraftMessageType, jobId, new SyncWofDraftPayload(jobId), utcNow);

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

        var active = await FindActiveMessageAsync(jobId, CreateDraftMessageType, ct);
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

        var active = await FindActiveMessageAsync(jobId, AttachExistingMessageType, ct);
        if (active is not null)
            return InvoiceOutboxEnqueueResult.Queued(active.Id, active.Status);

        var now = DateTime.UtcNow;
        var message = BuildAttachExistingMessage(jobId, normalizedInvoiceNumber, now);
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
                  AND message_type IN ({CreateDraftMessageType}, {AttachExistingMessageType}, {SyncWofDraftMessageType}, {RemoveWofDraftItemsMessageType}, {SyncPoStateMessageType})
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
        return messages;
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
            await MarkFailedAsync(message.Id, ex.Message, retryable: true, ct);
        }
    }

    private async Task<InvoiceOutboxDispatchResult> DispatchAsync(OutboxMessage message, CancellationToken ct)
    {
        return message.MessageType switch
        {
            CreateDraftMessageType => await ProcessCreateDraftAsync(message, ct),
            AttachExistingMessageType => await ProcessAttachExistingAsync(message, ct),
            SyncWofDraftMessageType => await ProcessSyncWofDraftAsync(message, ct),
            RemoveWofDraftItemsMessageType => await ProcessRemoveWofDraftItemsAsync(message, ct),
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
        return result.Ok
            ? InvoiceOutboxDispatchResult.Success()
            : InvoiceOutboxDispatchResult.Fail(
                result.Error ?? "Failed to create draft invoice.",
                IsRetryableStatusCode(result.StatusCode));
    }

    private async Task<InvoiceOutboxDispatchResult> ProcessAttachExistingAsync(OutboxMessage message, CancellationToken ct)
    {
        var payload = JsonSerializer.Deserialize<AttachExistingPayload>(message.PayloadJson, JsonOptions);
        if (payload is null || payload.JobId <= 0 || string.IsNullOrWhiteSpace(payload.InvoiceNumber))
            return InvoiceOutboxDispatchResult.Fail("Invalid attach existing invoice outbox payload.");

        var result = await _jobInvoiceService.AttachExistingXeroInvoiceAsync(payload.JobId, payload.InvoiceNumber, ct);
        return result.Ok
            ? InvoiceOutboxDispatchResult.Success()
            : InvoiceOutboxDispatchResult.Fail(
                result.Error ?? "Failed to attach existing Xero invoice.",
                IsRetryableStatusCode(result.StatusCode));
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
    }

    private async Task<OutboxMessage?> FindActiveMessageAsync(long jobId, string messageType, CancellationToken ct)
        => await _db.OutboxMessages.AsNoTracking()
            .Where(x => x.AggregateType == JobAggregateType
                && x.AggregateId == jobId
                && x.MessageType == messageType
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
            1 => TimeSpan.FromSeconds(30),
            2 => TimeSpan.FromMinutes(2),
            3 => TimeSpan.FromMinutes(10),
            4 => TimeSpan.FromMinutes(30),
            _ => TimeSpan.FromHours(2),
        };

    private static bool IsRetryableStatusCode(int statusCode)
        => statusCode == 0 || statusCode == 408 || statusCode == 429 || statusCode >= 500;

    private sealed record CreateDraftPayload(long JobId);
    private sealed record AttachExistingPayload(long JobId, string InvoiceNumber);
    private sealed record SyncWofDraftPayload(long JobId);
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
