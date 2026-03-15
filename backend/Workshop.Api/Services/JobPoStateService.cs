using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Models;

namespace Workshop.Api.Services;

public sealed class JobPoStateService
{
    private const string EscalationReason = "No supplier reply after 2 follow-ups.";

    private readonly AppDbContext _db;

    public JobPoStateService(AppDbContext db)
    {
        _db = db;
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

        foreach (var job in jobs)
        {
            var correlationId = BuildCorrelationId(job.Id);
            var state = await _db.JobPoStates.FirstOrDefaultAsync(x => x.JobId == job.Id, ct);
            if (state is null)
            {
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
        }

        await _db.SaveChangesAsync(ct);
    }

    public async Task SyncStateForJobAsync(long jobId, CancellationToken ct)
    {
        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == jobId, ct);
        if (job is null || !job.NeedsPo)
            return;

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

        var sentLogs = logs.Where(x => IsSentOrReminder(x.Direction)).ToList();
        var replyLogs = logs.Where(x => string.Equals(x.Direction, "reply", StringComparison.OrdinalIgnoreCase)).ToList();
        var lastReply = replyLogs.OrderByDescending(x => x.InternalDateMs ?? 0).FirstOrDefault();
        var lastFollowUp = logs
            .Where(x => string.Equals(x.Direction, "reminder", StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(x => x.InternalDateMs ?? 0)
            .FirstOrDefault();
        var latestDetectedPo = logs
            .Where(x => !string.IsNullOrWhiteSpace(x.DetectedPoNumber))
            .OrderByDescending(x => x.InternalDateMs ?? 0)
            .Select(x => x.DetectedPoNumber!.Trim())
            .FirstOrDefault();
        var latestCounterpartyEmail = logs
            .Where(x => !string.IsNullOrWhiteSpace(x.CounterpartyEmail))
            .OrderByDescending(x => x.InternalDateMs ?? 0)
            .Select(x => x.CounterpartyEmail.Trim())
            .FirstOrDefault();

        state.CorrelationId = correlationId;
        state.CounterpartyEmail = string.IsNullOrWhiteSpace(latestCounterpartyEmail) ? state.CounterpartyEmail : latestCounterpartyEmail;
        state.ConfirmedPoNumber = string.IsNullOrWhiteSpace(job.PoNumber) ? null : job.PoNumber.Trim();
        state.DetectedPoNumber = string.IsNullOrWhiteSpace(latestDetectedPo) ? null : latestDetectedPo;
        state.FirstRequestSentAt = sentLogs.Count == 0 ? null : NormalizeInternalDate(sentLogs.Min(x => x.InternalDateMs));
        state.LastRequestSentAt = sentLogs.Count == 0 ? null : NormalizeInternalDate(sentLogs.Max(x => x.InternalDateMs));
        state.LastFollowUpSentAt = lastFollowUp is null ? null : NormalizeInternalDate(lastFollowUp.InternalDateMs);
        state.LastSupplierReplyAt = lastReply is null ? null : NormalizeInternalDate(lastReply.InternalDateMs);
        state.LastSupplierReplyMessageId = lastReply?.GmailMessageId;
        state.FollowUpCount = logs.Count(x => string.Equals(x.Direction, "reminder", StringComparison.OrdinalIgnoreCase));
        state.FollowUpEnabled = true;
        state.NextFollowUpDueAt = null;
        state.RequiresAdminAttention = false;
        state.AdminAttentionReason = null;
        state.LastSyncedAt = DateTime.UtcNow;
        state.UpdatedAt = DateTime.UtcNow;

        if (!string.IsNullOrWhiteSpace(state.ConfirmedPoNumber))
        {
            state.Status = JobPoStateStatus.PoConfirmed;
        }
        else if (replyLogs.Count > 0)
        {
            state.Status = JobPoStateStatus.PendingConfirmation;
        }
        else if (sentLogs.Count > 0)
        {
            if (state.FollowUpCount >= 2)
            {
                state.Status = JobPoStateStatus.EscalationRequired;
                state.RequiresAdminAttention = true;
                state.AdminAttentionReason = EscalationReason;
            }
            else
            {
                state.Status = JobPoStateStatus.AwaitingReply;
            }
        }
        else
        {
            state.Status = JobPoStateStatus.Draft;
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
}
