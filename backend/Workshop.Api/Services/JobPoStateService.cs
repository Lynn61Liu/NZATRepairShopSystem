using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Models;
using Workshop.Api.Options;
using Microsoft.Extensions.Options;

namespace Workshop.Api.Services;

public sealed class JobPoStateService
{
    private const string EscalationReason = "No supplier reply after 2 follow-ups.";

    private readonly AppDbContext _db;
    private readonly BusinessHoursService _businessHoursService;
    private readonly PoFollowUpOptions _options;

    public JobPoStateService(AppDbContext db, BusinessHoursService businessHoursService, IOptions<PoFollowUpOptions> options)
    {
        _db = db;
        _businessHoursService = businessHoursService;
        _options = options.Value;
    }

    public async Task EnsureStatesForNeedsPoJobsAsync(CancellationToken ct)
    {
        var jobs = await _db.Jobs
            .Where(x => x.NeedsPo)
            .Select(x => new
            {
                x.Id,
                x.NeedsPo,
                x.PoNumber,
            })
            .ToListAsync(ct);

        var jobIds = jobs.Select(x => x.Id).ToArray();
        var existingJobIds = jobIds.Length == 0
            ? new HashSet<long>()
            : (await _db.JobPoStates.AsNoTracking()
                .Where(x => jobIds.Contains(x.JobId))
                .Select(x => x.JobId)
                .ToListAsync(ct))
                .ToHashSet();

        foreach (var job in jobs)
        {
            if (existingJobIds.Contains(job.Id))
                continue;

            var correlationId = BuildCorrelationId(job.Id);
            _db.JobPoStates.Add(new JobPoState
            {
                JobId = job.Id,
                CorrelationId = correlationId,
                Status = string.IsNullOrWhiteSpace(job.PoNumber) ? JobPoStateStatus.Draft : JobPoStateStatus.PoConfirmed,
                ConfirmedPoNumber = string.IsNullOrWhiteSpace(job.PoNumber) ? null : job.PoNumber.Trim(),
                FollowUpEnabled = true,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                LastSyncedAt = DateTime.UtcNow,
            });
        }

        await _db.SaveChangesAsync(ct);
    }

    public async Task SyncStateForJobAsync(long jobId, CancellationToken ct)
    {
        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == jobId, ct);
        if (job is null || !job.NeedsPo)
        {
            await _db.JobPoStates.Where(x => x.JobId == jobId).ExecuteDeleteAsync(ct);
            return;
        }

        var correlationId = BuildCorrelationId(job.Id);
        var logs = await _db.GmailMessageLogs.AsNoTracking()
            .Where(x => x.CorrelationId == correlationId)
            .OrderBy(x => x.InternalDateMs ?? 0)
            .ThenBy(x => x.Id)
            .ToListAsync(ct);

        var state = await _db.JobPoStates.FirstOrDefaultAsync(x => x.JobId == job.Id, ct);
        if (state is null)
        {
            state = new JobPoState
            {
                JobId = job.Id,
                CorrelationId = correlationId,
                CreatedAt = DateTime.UtcNow,
            };
            _db.JobPoStates.Add(state);
        }

        var sentLogs = logs
            .Where(x => string.Equals(x.Direction, "sent", StringComparison.OrdinalIgnoreCase))
            .ToList();
        var replyLogs = logs.Where(x => string.Equals(x.Direction, "reply", StringComparison.OrdinalIgnoreCase)).ToList();
        var lastSentLog = sentLogs
            .OrderByDescending(GetEventOccurredAtUtc)
            .ThenByDescending(x => x.Id)
            .FirstOrDefault();
        var lastReply = replyLogs.OrderByDescending(GetEventOccurredAtUtc).FirstOrDefault();
        var lastReplyAt = GetEventOccurredAtUtc(lastReply);
        var lastSentAt = GetEventOccurredAtUtc(lastSentLog);

        var reminderLogsAfterLatestSent = logs
            .Where(x => string.Equals(x.Direction, "reminder", StringComparison.OrdinalIgnoreCase))
            .Where(x =>
            {
                if (!lastSentAt.HasValue)
                    return false;

                var reminderAt = GetEventOccurredAtUtc(x);
                return reminderAt.HasValue && reminderAt.Value > lastSentAt.Value;
            })
            .ToList();
        var replyAfterLatestSent = replyLogs
            .Where(x =>
            {
                if (!lastSentAt.HasValue)
                    return false;

                var replyAt = GetEventOccurredAtUtc(x);
                return replyAt.HasValue && replyAt.Value > lastSentAt.Value;
            })
            .OrderByDescending(GetEventOccurredAtUtc)
            .FirstOrDefault();
        var lastReplyAfterLatestSentAt = GetEventOccurredAtUtc(replyAfterLatestSent);
        var reminderLogsInCurrentRound = reminderLogsAfterLatestSent
            .Where(x =>
            {
                if (!lastReplyAfterLatestSentAt.HasValue)
                    return true;

                var reminderAt = GetEventOccurredAtUtc(x);
                return reminderAt.HasValue && reminderAt.Value < lastReplyAfterLatestSentAt.Value;
            })
            .ToList();
        var lastFollowUp = reminderLogsInCurrentRound
            .OrderByDescending(GetEventOccurredAtUtc)
            .FirstOrDefault();
        var latestDetectedPo = logs
            .Where(x => !string.IsNullOrWhiteSpace(x.DetectedPoNumber))
            .OrderByDescending(GetEventOccurredAtUtc)
            .Select(x => x.DetectedPoNumber!.Trim())
            .FirstOrDefault();
        var latestCounterpartyEmail = logs
            .Where(x => !string.IsNullOrWhiteSpace(x.CounterpartyEmail))
            .OrderByDescending(GetEventOccurredAtUtc)
            .Select(x => x.CounterpartyEmail.Trim())
            .FirstOrDefault();

        state.CorrelationId = correlationId;
        state.CounterpartyEmail = string.IsNullOrWhiteSpace(latestCounterpartyEmail) ? state.CounterpartyEmail : latestCounterpartyEmail;
        state.ConfirmedPoNumber = string.IsNullOrWhiteSpace(job.PoNumber) ? null : job.PoNumber.Trim();
        state.DetectedPoNumber = string.IsNullOrWhiteSpace(latestDetectedPo) ? null : latestDetectedPo;
        state.FirstRequestSentAt = sentLogs.Count == 0 ? null : sentLogs.Select(GetEventOccurredAtUtc).Where(x => x.HasValue).Min();
        state.LastRequestSentAt = lastSentAt;
        state.LastFollowUpSentAt = GetEventOccurredAtUtc(lastFollowUp);
        state.LastSupplierReplyAt = lastReplyAt;
        state.LastSupplierReplyMessageId = lastReply?.GmailMessageId;
        state.FollowUpCount = reminderLogsInCurrentRound.Count;
        state.NextFollowUpDueAt = null;
        state.RequiresAdminAttention = false;
        state.AdminAttentionReason = null;
        state.LastSyncedAt = DateTime.UtcNow;
        state.UpdatedAt = DateTime.UtcNow;

        var hasDetectedPo = !string.IsNullOrWhiteSpace(state.DetectedPoNumber);

        if (!string.IsNullOrWhiteSpace(state.ConfirmedPoNumber))
        {
            state.Status = JobPoStateStatus.PoConfirmed;
            state.FollowUpEnabled = false;
            state.FollowUpCount = 0;
            state.NextFollowUpDueAt = null;
        }
        else if (hasDetectedPo)
        {
            state.Status = JobPoStateStatus.PendingConfirmation;
            state.FollowUpCount = 0;
            state.LastFollowUpSentAt = null;
            state.NextFollowUpDueAt = null;
        }
        else if (lastSentAt.HasValue)
        {
            if (lastReplyAfterLatestSentAt.HasValue)
            {
                // Once the supplier has replied in the current round, stop scheduling
                // automatic follow-ups until a new first-send round is started explicitly.
                state.Status = JobPoStateStatus.AwaitingReply;
                state.FollowUpCount = 0;
                state.LastFollowUpSentAt = null;
                state.NextFollowUpDueAt = null;
            }
            else if (state.FollowUpCount >= Math.Max(1, _options.MaxFollowUps))
            {
                state.Status = JobPoStateStatus.EscalationRequired;
                state.RequiresAdminAttention = true;
                state.AdminAttentionReason = EscalationReason;
            }
            else
            {
                state.Status = JobPoStateStatus.AwaitingReply;
                if (state.FollowUpEnabled)
                {
                    var anchorTime = lastReplyAfterLatestSentAt ?? state.LastFollowUpSentAt ?? lastSentAt;
                    state.NextFollowUpDueAt = _businessHoursService.CalculateNextFollowUpDueAtUtc(anchorTime.Value);
                }
            }
        }
        else
        {
            state.Status = JobPoStateStatus.Draft;
            state.FollowUpCount = 0;
            state.LastFollowUpSentAt = null;
            state.NextFollowUpDueAt = null;
        }

        await _db.SaveChangesAsync(ct);
    }

    public async Task SyncStateByCorrelationAsync(string? correlationId, CancellationToken ct)
    {
        var jobId = TryExtractJobIdFromCorrelationId(correlationId);
        if (!jobId.HasValue)
            return;

        await SyncStateForJobAsync(jobId.Value, ct);
    }

    public static string BuildCorrelationId(long jobId)
    {
        const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        var seed = jobId.ToString(CultureInfo.InvariantCulture);
        uint hash = 0;
        foreach (var ch in seed)
            hash = (hash * 31) + ch;

        var suffixChars = new char[4];
        var value = hash == 0 ? 1u : hash;
        for (var index = 0; index < suffixChars.Length; index++)
        {
            suffixChars[index] = alphabet[(int)(value % (uint)alphabet.Length)];
            value = value / (uint)alphabet.Length;
            if (value == 0)
                value = hash + (uint)index + 7;
        }

        return $"PO-{jobId.ToString(CultureInfo.InvariantCulture)}-{new string(suffixChars)}";
    }

    public static long? TryExtractJobIdFromCorrelationId(string? correlationId)
    {
        if (string.IsNullOrWhiteSpace(correlationId))
            return null;

        var parts = correlationId.Split('-', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length < 3 || !string.Equals(parts[0], "PO", StringComparison.OrdinalIgnoreCase))
            return null;

        return long.TryParse(parts[1], NumberStyles.None, CultureInfo.InvariantCulture, out var jobId)
            ? jobId
            : null;
    }

    private static bool IsSentOrReminder(string? direction) =>
        string.Equals(direction, "sent", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(direction, "reminder", StringComparison.OrdinalIgnoreCase);

    private static DateTime? NormalizeInternalDate(long? internalDateMs)
    {
        if (!internalDateMs.HasValue || internalDateMs.Value <= 0)
            return null;

        try
        {
            return DateTimeOffset.FromUnixTimeMilliseconds(internalDateMs.Value).UtcDateTime;
        }
        catch
        {
            return null;
        }
    }

    private static DateTime? GetEventOccurredAtUtc(GmailMessageLog? log)
    {
        if (log is null)
            return null;

        var normalized = NormalizeInternalDate(log.InternalDateMs);
        if (normalized.HasValue)
            return normalized.Value;

        return log.UpdatedAt != default ? log.UpdatedAt : log.CreatedAt;
    }
}
