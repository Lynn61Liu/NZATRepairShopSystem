using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Models;

namespace Workshop.Api.Services;

public sealed class JobLifecycleService
{
    private const string JobsListVersionCacheKey = "jobs:list:version:v1";
    private const string PaintBoardCacheKey = "jobs:paint-board:v1";
    private const string WofScheduleCacheKey = "jobs:wof-schedule:v1";
    private const string PartsFlowCacheKey = "parts-flow:v1";

    private readonly AppDbContext _db;
    private readonly WofQueryService _wofQueryService;
    private readonly IAppCache _cache;

    public JobLifecycleService(AppDbContext db, WofQueryService wofQueryService, IAppCache cache)
    {
        _db = db;
        _wofQueryService = wofQueryService;
        _cache = cache;
    }

    public async Task<JobLifecycleResult?> EvaluateAsync(long jobId, CancellationToken ct)
    {
        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == jobId, ct);
        if (job is null)
            return null;

        var workflowStatus = await _db.JobMechWorkflows.AsNoTracking()
            .Where(x => x.JobId == jobId)
            .Select(x => x.Status)
            .FirstOrDefaultAsync(ct);
        var paintStatus = await _db.JobPaintServices.AsNoTracking()
            .Where(x => x.JobId == jobId)
            .OrderByDescending(x => x.UpdatedAt)
            .ThenByDescending(x => x.Id)
            .Select(x => x.Status)
            .FirstOrDefaultAsync(ct);

        var automaticallyOnYard =
            !string.Equals(workflowStatus, MechWorkflowStatus.Delivered, StringComparison.OrdinalIgnoreCase)
            && !string.Equals(paintStatus, "delivered", StringComparison.OrdinalIgnoreCase);
        var isArchived = string.Equals(job.Status, "Archived", StringComparison.OrdinalIgnoreCase);
        var isOnYard = !isArchived && (job.IsOnYardOverride ?? automaticallyOnYard);

        var invoiceStatus = await _db.JobInvoices.AsNoTracking()
            .Where(x => x.JobId == jobId)
            .OrderByDescending(x => x.UpdatedAt)
            .ThenByDescending(x => x.Id)
            .Select(x => x.ExternalStatus)
            .FirstOrDefaultAsync(ct);
        var normalizedInvoiceStatus = invoiceStatus?.Trim().ToUpperInvariant() ?? "";

        var shouldArchive = normalizedInvoiceStatus == "PAID";
        if (!shouldArchive && normalizedInvoiceStatus == "AUTHORISED")
        {
            var wof = await _wofQueryService.GetSnapshotAsync(jobId, ct);
            var hasWof = wof?.HasWofService == true;
            var wofComplete = !hasWof
                || wof!.HasWofRecord
                || string.Equals(wof.ManualStatus, "Checked", StringComparison.OrdinalIgnoreCase);

            var hasMech = await HasServiceAsync(jobId, "mech", ct)
                || await _db.JobMechServices.AsNoTracking().AnyAsync(x => x.JobId == jobId, ct);
            var mechComplete = !hasMech
                || string.Equals(workflowStatus, MechWorkflowStatus.Delivered, StringComparison.OrdinalIgnoreCase);

            var hasPaint = paintStatus is not null || await HasServiceAsync(jobId, "paint", ct);
            var paintComplete = !hasPaint
                || string.Equals(paintStatus, "delivered", StringComparison.OrdinalIgnoreCase);

            var hasTrackedWork = hasWof || hasMech || hasPaint;
            shouldArchive = hasTrackedWork && wofComplete && mechComplete && paintComplete;
        }

        var archivedNow = false;
        if (shouldArchive && !string.Equals(job.Status, "Archived", StringComparison.OrdinalIgnoreCase))
        {
            job.Status = "Archived";
            job.IsOnYardOverride = null;
            job.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);
            archivedNow = true;
            await InvalidateAsync(jobId, ct);
        }

        return new JobLifecycleResult(
            IsOnYard: isOnYard,
            YardSource: isArchived ? "automatic" : job.IsOnYardOverride.HasValue ? "manual" : "automatic",
            ArchivedNow: archivedNow);
    }

    public async Task<JobLifecycleResult?> SetYardOverrideAsync(long jobId, bool? isOnYard, CancellationToken ct)
    {
        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == jobId, ct);
        if (job is null)
            return null;

        job.IsOnYardOverride = string.Equals(job.Status, "Archived", StringComparison.OrdinalIgnoreCase)
            ? null
            : isOnYard;
        job.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        await InvalidateAsync(jobId, ct);
        return await EvaluateAsync(jobId, ct);
    }

    public async Task<JobLifecycleBatchResult> SetYardOverrideBatchAsync(
        IReadOnlyCollection<long> jobIds,
        bool? isOnYard,
        CancellationToken ct)
    {
        var distinctJobIds = jobIds.Where(x => x > 0).Distinct().ToArray();
        if (distinctJobIds.Length == 0)
            return new JobLifecycleBatchResult(0, 0);

        var now = DateTime.UtcNow;
        var updated = await _db.Jobs
            .Where(x => distinctJobIds.Contains(x.Id)
                && !EF.Functions.ILike(x.Status ?? "", "archived"))
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(x => x.IsOnYardOverride, isOnYard)
                    .SetProperty(x => x.UpdatedAt, now),
                ct);

        foreach (var jobId in distinctJobIds)
            await _cache.RemoveAsync($"job:detail:{jobId}:v1", ct);

        await _cache.RemoveAsync(PaintBoardCacheKey, ct);
        await _cache.RemoveAsync(WofScheduleCacheKey, ct);
        await _cache.RemoveAsync(PartsFlowCacheKey, ct);
        await _cache.SetStringAsync(
            JobsListVersionCacheKey,
            now.Ticks.ToString(System.Globalization.CultureInfo.InvariantCulture),
            TimeSpan.FromDays(30),
            ct);

        return new JobLifecycleBatchResult(updated, distinctJobIds.Length - updated);
    }

    private async Task<bool> HasServiceAsync(long jobId, string serviceType, CancellationToken ct) =>
        await (
            from selection in _db.JobServiceSelections.AsNoTracking()
            join item in _db.ServiceCatalogItems.AsNoTracking()
                on selection.ServiceCatalogItemId equals item.Id
            where selection.JobId == jobId && item.ServiceType == serviceType
            select selection.Id
        ).AnyAsync(ct);

    private async Task InvalidateAsync(long jobId, CancellationToken ct)
    {
        await _cache.RemoveAsync($"job:detail:{jobId}:v1", ct);
        await _cache.RemoveAsync(PaintBoardCacheKey, ct);
        await _cache.RemoveAsync(WofScheduleCacheKey, ct);
        await _cache.RemoveAsync(PartsFlowCacheKey, ct);
        await _cache.SetStringAsync(
            JobsListVersionCacheKey,
            DateTime.UtcNow.Ticks.ToString(System.Globalization.CultureInfo.InvariantCulture),
            TimeSpan.FromDays(30),
            ct);
    }
}

public sealed record JobLifecycleResult(bool IsOnYard, string YardSource, bool ArchivedNow);
public sealed record JobLifecycleBatchResult(int Updated, int Skipped);
