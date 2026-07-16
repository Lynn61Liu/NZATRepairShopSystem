using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Workshop.Api.Data;
using Workshop.Api.Models;
using Workshop.Api.Options;

namespace Workshop.Api.Services;

public sealed class PoAutoFollowUpService
{
    private readonly AppDbContext _db;
    private readonly BusinessHoursService _businessHoursService;
    private readonly GmailFollowUpSenderService _gmailFollowUpSenderService;
    private readonly JobPoStateService _jobPoStateService;
    private readonly PoFollowUpOptions _options;
    private readonly ILogger<PoAutoFollowUpService> _logger;

    public PoAutoFollowUpService(
        AppDbContext db,
        BusinessHoursService businessHoursService,
        GmailFollowUpSenderService gmailFollowUpSenderService,
        JobPoStateService jobPoStateService,
        IOptions<PoFollowUpOptions> options,
        ILogger<PoAutoFollowUpService> logger)
    {
        _db = db;
        _businessHoursService = businessHoursService;
        _gmailFollowUpSenderService = gmailFollowUpSenderService;
        _jobPoStateService = jobPoStateService;
        _options = options.Value;
        _logger = logger;
    }

    public int CheckIntervalSeconds => _options.EffectiveCheckIntervalSeconds;
    public bool Enabled => _options.Enabled;

    public async Task RunCycleAsync(CancellationToken ct)
    {
        await _jobPoStateService.EnsureStatesForNeedsPoJobsAsync(ct);

        var candidateStates = await (
                from state in _db.JobPoStates
                join job in _db.Jobs on state.JobId equals job.Id
                where job.NeedsPo
                where state.FollowUpEnabled
                where state.Status == JobPoStateStatus.AwaitingReply || state.Status == JobPoStateStatus.EscalationRequired
                select state
            )
            .OrderBy(x => x.JobId)
            .ToListAsync(ct);

        foreach (var state in candidateStates)
        {
            await _jobPoStateService.SyncStateForJobAsync(state.JobId, ct);
        }

        var dueStates = await (
                from state in _db.JobPoStates
                join job in _db.Jobs on state.JobId equals job.Id
                where job.NeedsPo
                where state.FollowUpEnabled
                where state.Status == JobPoStateStatus.AwaitingReply
                where state.NextFollowUpDueAt.HasValue && state.NextFollowUpDueAt.Value <= DateTime.UtcNow
                select state
            )
            .OrderBy(x => x.NextFollowUpDueAt)
            .ToListAsync(ct);

        foreach (var state in dueStates)
        {
            if (state.FollowUpCount >= Math.Max(1, _options.MaxFollowUps))
            {
                state.Status = JobPoStateStatus.EscalationRequired;
                state.RequiresAdminAttention = true;
                state.AdminAttentionReason = "No supplier reply after 2 follow-ups.";
                state.NextFollowUpDueAt = null;
                state.UpdatedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync(ct);
                continue;
            }

            var sent = await _gmailFollowUpSenderService.SendFollowUpAsync(state, ct);
            if (!sent)
            {
                _logger.LogWarning("Automatic PO follow-up failed for job {JobId}.", state.JobId);
                continue;
            }

            await _jobPoStateService.SyncStateForJobAsync(state.JobId, ct);
        }
    }
}
