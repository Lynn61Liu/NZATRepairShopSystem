using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;

namespace Workshop.Api.Services;

public sealed class XeroInvoiceStatusSyncService
{
    private readonly AppDbContext _db;
    private readonly JobInvoiceService _jobInvoiceService;
    private readonly InvoiceOutboxService _invoiceOutboxService;
    private readonly ILogger<XeroInvoiceStatusSyncService> _logger;

    public XeroInvoiceStatusSyncService(
        AppDbContext db,
        JobInvoiceService jobInvoiceService,
        InvoiceOutboxService invoiceOutboxService,
        ILogger<XeroInvoiceStatusSyncService> logger)
    {
        _db = db;
        _jobInvoiceService = jobInvoiceService;
        _invoiceOutboxService = invoiceOutboxService;
        _logger = logger;
    }

    public async Task<XeroInvoiceStatusBatchResult> SyncJobsAsync(
        IReadOnlyCollection<long>? requestedJobIds,
        CancellationToken ct)
    {
        var invoiceQuery =
            from invoice in _db.JobInvoices.AsNoTracking()
            join job in _db.Jobs.AsNoTracking() on invoice.JobId equals job.Id
            where invoice.Provider.ToLower() == "xero"
                  && invoice.ExternalInvoiceId != null
                  && invoice.ExternalInvoiceId != ""
            select new { invoice.JobId, invoice.ExternalStatus, JobStatus = job.Status };

        if (requestedJobIds is { Count: > 0 })
        {
            var ids = requestedJobIds.Distinct().ToArray();
            invoiceQuery = invoiceQuery.Where(x => ids.Contains(x.JobId));
        }
        else
        {
            invoiceQuery = invoiceQuery.Where(x =>
                (x.JobStatus == null || x.JobStatus.ToUpper() != "ARCHIVED")
                && (x.ExternalStatus == null
                    || (x.ExternalStatus.ToUpper() != "PAID"
                        && x.ExternalStatus.ToUpper() != "VOIDED"
                        && x.ExternalStatus.ToUpper() != "DELETED")));
        }

        var jobIds = await invoiceQuery
            .Select(x => x.JobId)
            .Distinct()
            .OrderBy(x => x)
            .ToListAsync(ct);

        var items = new List<XeroInvoiceStatusSyncItem>(jobIds.Count);
        foreach (var jobId in jobIds)
        {
            try
            {
                var result = await _jobInvoiceService.SyncFromXeroAsync(jobId, ct);
                items.Add(new XeroInvoiceStatusSyncItem(
                    jobId,
                    result.Ok,
                    result.Invoice?.ExternalStatus,
                    result.Ok ? null : result.Error));
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to sync Xero invoice status for job {JobId}.", jobId);
                items.Add(new XeroInvoiceStatusSyncItem(jobId, false, null, ex.Message));
            }
        }

        var requestedCount = requestedJobIds?.Distinct().Count() ?? jobIds.Count;
        var requeued = 0;
        var enqueueFailed = 0;
        var skipped = 0;

        // A manual batch status check also acts as a recovery pass for jobs whose
        // original asynchronous Xero invoice creation never completed. Reuse the
        // normal outbox flow so retries keep the same idempotency and rate-limiting
        // behaviour as invoices created with a new job.
        if (requestedJobIds is { Count: > 0 })
        {
            var requestedIds = requestedJobIds
                .Where(x => x > 0)
                .Distinct()
                .ToArray();
            var existingJobIds = await _db.Jobs.AsNoTracking()
                .Where(x => requestedIds.Contains(x.Id))
                .Select(x => x.Id)
                .ToListAsync(ct);
            var jobsWithXeroInvoices = jobIds.ToHashSet();

            foreach (var jobId in existingJobIds.Where(x => !jobsWithXeroInvoices.Contains(x)))
            {
                try
                {
                    var enqueueResult = await _invoiceOutboxService.EnqueueCreateDraftAsync(jobId, ct);
                    if (!enqueueResult.Ok)
                    {
                        enqueueFailed++;
                        _logger.LogWarning(
                            "Failed to requeue Xero invoice creation for job {JobId}: {Error}",
                            jobId,
                            enqueueResult.Error);
                    }
                    else if (enqueueResult.AlreadyHandled)
                    {
                        skipped++;
                    }
                    else
                    {
                        requeued++;
                    }
                }
                catch (OperationCanceledException) when (ct.IsCancellationRequested)
                {
                    throw;
                }
                catch (Exception ex)
                {
                    enqueueFailed++;
                    _logger.LogWarning(ex, "Failed to requeue Xero invoice creation for job {JobId}.", jobId);
                }
            }

            skipped += requestedIds.Length - existingJobIds.Count;
        }

        return new XeroInvoiceStatusBatchResult(
            requestedCount,
            items.Count,
            items.Count(x => x.Ok),
            skipped,
            items.Count(x => !x.Ok) + enqueueFailed,
            requeued,
            items);
    }
}

public sealed record XeroInvoiceStatusSyncItem(long JobId, bool Ok, string? Status, string? Error);

public sealed record XeroInvoiceStatusBatchResult(
    int Requested,
    int Processed,
    int Succeeded,
    int Skipped,
    int Failed,
    int Requeued,
    IReadOnlyList<XeroInvoiceStatusSyncItem> Items);
