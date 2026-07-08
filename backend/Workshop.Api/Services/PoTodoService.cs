using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Models;

namespace Workshop.Api.Services;

public sealed class PoTodoService
{
    private readonly AppDbContext _db;

    public PoTodoService(
        AppDbContext db,
        GmailThreadSyncService? gmailThreadSyncService,
        JobPoStateService? jobPoStateService,
        GmailLabelService? gmailLabelService,
        JobInvoiceService? jobInvoiceService,
        ILogger<PoTodoService>? logger)
    {
        _db = db;
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
}

public sealed record PoTodoActionResult(bool Success, string? Error)
{
    public static PoTodoActionResult Ok() => new(true, null);
    public static PoTodoActionResult Fail(string error) => new(false, error);
}

public sealed record PoTodoCompleteResult(int Updated, int Skipped);
