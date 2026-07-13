using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;

namespace Workshop.Api.Services;

public sealed class XeroInvoiceStatusSyncService
{
    private readonly AppDbContext _db;
    private readonly JobInvoiceService _jobInvoiceService;
    private readonly ILogger<XeroInvoiceStatusSyncService> _logger;

    public XeroInvoiceStatusSyncService(
        AppDbContext db,
        JobInvoiceService jobInvoiceService,
        ILogger<XeroInvoiceStatusSyncService> logger)
    {
        _db = db;
        _jobInvoiceService = jobInvoiceService;
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
        return new XeroInvoiceStatusBatchResult(
            requestedCount,
            items.Count,
            items.Count(x => x.Ok),
            Math.Max(0, requestedCount - items.Count),
            items.Count(x => !x.Ok),
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
    IReadOnlyList<XeroInvoiceStatusSyncItem> Items);
