using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Models;

namespace Workshop.Api.Services;

public sealed class WofQueryService
{
    private readonly AppDbContext _db;

    public WofQueryService(AppDbContext db)
    {
        _db = db;
    }

    public IQueryable<WofSnapshot> QuerySnapshots()
    {
        var wofServiceJobIds = (
                from selection in _db.JobServiceSelections.AsNoTracking()
                join catalogItem in _db.ServiceCatalogItems.AsNoTracking() on selection.ServiceCatalogItemId equals catalogItem.Id
                where catalogItem.ServiceType == "wof"
                select selection.JobId
            )
            .Distinct();
        var wofRecords = _db.JobWofRecords.AsNoTracking();
        var wofStates = _db.JobWofStates.AsNoTracking();

        return _db.Jobs.AsNoTracking().Select(job => new WofSnapshot
        {
            JobId = job.Id,
            HasWofService = wofServiceJobIds.Contains(job.Id),
            HasWofRecord = wofRecords.Any(record => record.JobId == job.Id),
            ManualStatus = wofStates
                .Where(state => state.JobId == job.Id)
                .OrderByDescending(state => state.UpdatedAt)
                .ThenByDescending(state => state.Id)
                .Select(state => state.ManualStatus)
                .FirstOrDefault(),
            LatestWofUiState = wofRecords
                .Where(record => record.JobId == job.Id)
                .OrderByDescending(record => record.OccurredAt)
                .ThenByDescending(record => record.Id)
                .Select(record => (WofUiState?)record.WofUiState)
                .FirstOrDefault(),
            LatestOccurredAt = wofRecords
                .Where(record => record.JobId == job.Id)
                .OrderByDescending(record => record.OccurredAt)
                .ThenByDescending(record => record.Id)
                .Select(record => (DateTime?)record.OccurredAt)
                .FirstOrDefault(),
        });
    }

    public Task<WofSnapshot?> GetSnapshotAsync(long jobId, CancellationToken ct)
        => QuerySnapshots().FirstOrDefaultAsync(snapshot => snapshot.JobId == jobId, ct);

    public static string? DeriveWofStatus(bool hasWofService, bool hasWofRecord, string? manualStatus)
    {
        if (hasWofRecord)
            return "Recorded";

        if (!hasWofService)
            return null;

        return string.Equals(manualStatus, "Checked", StringComparison.OrdinalIgnoreCase)
            ? "Checked"
            : "Todo";
    }
}

public sealed class WofSnapshot
{
    public long JobId { get; init; }
    public bool HasWofService { get; init; }
    public bool HasWofRecord { get; init; }
    public string? ManualStatus { get; init; }
    public WofUiState? LatestWofUiState { get; init; }
    public DateTime? LatestOccurredAt { get; init; }

    public string? DerivedStatus => WofQueryService.DeriveWofStatus(HasWofService, HasWofRecord, ManualStatus);
}
