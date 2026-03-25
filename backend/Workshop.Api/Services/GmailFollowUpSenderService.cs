using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Models;

namespace Workshop.Api.Services;

public sealed class GmailFollowUpSenderService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly AppDbContext _db;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly GmailTokenService _gmailTokenService;
    private readonly JobPoStateService _jobPoStateService;

    public GmailFollowUpSenderService(
        AppDbContext db,
        IHttpClientFactory httpClientFactory,
        GmailTokenService gmailTokenService,
        JobPoStateService jobPoStateService)
    {
        _db = db;
        _httpClientFactory = httpClientFactory;
        _gmailTokenService = gmailTokenService;
        _jobPoStateService = jobPoStateService;
    }

    public async Task<bool> SendFollowUpAsync(JobPoState state, CancellationToken ct)
    {
        var correlationId = state.CorrelationId?.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(correlationId))
            return false;

        var isInactive = await _db.InactiveGmailCorrelations.AsNoTracking()
            .AnyAsync(x => x.CorrelationId == correlationId, ct);
        if (isInactive)
            return false;

        var currentState = await _db.JobPoStates.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == state.Id, ct);
        if (currentState is null || !currentState.FollowUpEnabled)
            return false;

        if (currentState.Status != JobPoStateStatus.AwaitingReply && currentState.Status != JobPoStateStatus.EscalationRequired)
            return false;

        var jobExists = await _db.Jobs.AsNoTracking()
            .AnyAsync(x => x.Id == currentState.JobId && x.NeedsPo, ct);
        if (!jobExists)
            return false;

        if (string.IsNullOrWhiteSpace(currentState.CounterpartyEmail))
            return false;

        var tokenResult = await _gmailTokenService.RefreshAccessTokenAsync(ct);
        if (!tokenResult.Ok)
            return false;

        var threadLogs = await FilterLogsByAccount(_db.GmailMessageLogs.AsNoTracking(), tokenResult.AccountId)
            .Where(x => x.CorrelationId == correlationId)
            .Select(x => new
            {
                x.Direction,
                x.GmailThreadId,
                x.RfcMessageId,
                x.ReferencesHeader,
                x.Subject,
                x.InternalDateMs,
                x.UpdatedAt,
                x.CreatedAt,
                x.Id,
            })
            .ToListAsync(ct);
        var threadContext = threadLogs
            .OrderByDescending(x => GetEventOccurredAtUtc(x.InternalDateMs, x.UpdatedAt, x.CreatedAt))
            .ThenByDescending(x => x.Id)
            .FirstOrDefault();
        DateTime? latestSentAt = null;
        foreach (var log in threadLogs.Where(x => string.Equals(x.Direction, "sent", StringComparison.OrdinalIgnoreCase)))
        {
            var occurredAt = GetEventOccurredAtUtc(log.InternalDateMs, log.UpdatedAt, log.CreatedAt);
            if (!latestSentAt.HasValue || occurredAt > latestSentAt.Value)
                latestSentAt = occurredAt;
        }

        DateTime? latestReplyAfterLatestSentAt = null;
        if (latestSentAt.HasValue)
        {
            foreach (var log in threadLogs.Where(x => string.Equals(x.Direction, "reply", StringComparison.OrdinalIgnoreCase)))
            {
                var occurredAt = GetEventOccurredAtUtc(log.InternalDateMs, log.UpdatedAt, log.CreatedAt);
                if (occurredAt <= latestSentAt.Value)
                    continue;

                if (!latestReplyAfterLatestSentAt.HasValue || occurredAt > latestReplyAfterLatestSentAt.Value)
                    latestReplyAfterLatestSentAt = occurredAt;
            }
        }
        if (latestReplyAfterLatestSentAt.HasValue)
            return false;

        var rootSubjectCandidates = await FilterLogsByAccount(_db.GmailMessageLogs.AsNoTracking(), tokenResult.AccountId)
            .Where(x => x.CorrelationId == correlationId)
            .Where(x => !string.IsNullOrWhiteSpace(x.Subject))
            .Select(x => new
            {
                x.Subject,
                x.InternalDateMs,
                x.UpdatedAt,
                x.CreatedAt,
                x.Id,
            })
            .ToListAsync(ct);
        var rootSubject = rootSubjectCandidates
            .OrderBy(x => GetEventOccurredAtUtc(x.InternalDateMs, x.UpdatedAt, x.CreatedAt))
            .ThenBy(x => x.Id)
            .Select(x => x.Subject)
            .FirstOrDefault();

        var stillActive = await _db.JobPoStates.AsNoTracking()
            .AnyAsync(
                x => x.Id == currentState.Id
                    && x.FollowUpEnabled
                    && (x.Status == JobPoStateStatus.AwaitingReply || x.Status == JobPoStateStatus.EscalationRequired),
                ct);
        if (!stillActive)
            return false;

        var stillNotInactive = !await _db.InactiveGmailCorrelations.AsNoTracking()
            .AnyAsync(x => x.CorrelationId == correlationId, ct);
        if (!stillNotInactive)
            return false;

        var subject = EnsureReplySubject(rootSubject ?? threadContext?.Subject);
        var body = "Hi,\n\nFollowing up on our PO request. Could you please confirm the PO number for this job when available?\n\nThanks.";
        var rawMessage = BuildRawMessage(
            currentState.CounterpartyEmail!,
            subject,
            body,
            threadContext?.RfcMessageId,
            threadContext?.ReferencesHeader);

        var client = _httpClientFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenResult.AccessToken);
        request.Content = JsonContent.Create(new GmailSendApiRequest(rawMessage, threadContext?.GmailThreadId));

        using var response = await client.SendAsync(request, ct);
        var payload = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
            return false;

        var sendResult = JsonSerializer.Deserialize<GmailSendApiResponse>(payload, JsonOptions);
        var sentMessageId = sendResult?.Id ?? "";
        if (string.IsNullOrWhiteSpace(sentMessageId))
            return false;

        var sentDetails = await LoadMessageDetailsAsync(client, tokenResult.AccessToken, sentMessageId, ct);

        await UpsertReminderLogAsync(
            sentMessageId,
            sendResult?.ThreadId,
            sendResult?.InternalDate,
            tokenResult.AccountId,
            tokenResult.AccountEmail,
            currentState.CounterpartyEmail!,
            subject,
            body,
            correlationId,
            sentDetails?.RfcMessageId,
            sentDetails?.ReferencesHeader,
            ct);

        await _jobPoStateService.SyncStateForJobAsync(currentState.JobId, ct);
        return true;
    }

    private async Task UpsertReminderLogAsync(
        string gmailMessageId,
        string? gmailThreadId,
        long? internalDateMs,
        long? gmailAccountId,
        string? gmailAccountEmail,
        string counterpartyEmail,
        string subject,
        string body,
        string correlationId,
        string? rfcMessageId,
        string? referencesHeader,
        CancellationToken ct)
    {
        var existing = await _db.GmailMessageLogs.FirstOrDefaultAsync(
            x => x.GmailMessageId == gmailMessageId && x.GmailAccountId == gmailAccountId,
            ct);
        if (existing is null)
        {
            existing = new GmailMessageLog
            {
                GmailMessageId = gmailMessageId,
                CreatedAt = DateTime.UtcNow,
            };
            _db.GmailMessageLogs.Add(existing);
        }

        existing.GmailAccountId = gmailAccountId;
        existing.GmailAccountEmail = gmailAccountEmail;
        existing.GmailThreadId = gmailThreadId;
        existing.InternalDateMs = internalDateMs;
        existing.Direction = "reminder";
        existing.CounterpartyEmail = counterpartyEmail;
        existing.ToAddress = counterpartyEmail;
        existing.Subject = subject;
        existing.Body = body;
        existing.Snippet = body.Length > 240 ? body[..240] : body;
        existing.CorrelationId = correlationId;
        existing.RfcMessageId = rfcMessageId;
        existing.ReferencesHeader = referencesHeader;
        existing.HasAttachments = false;
        existing.AttachmentsJson = null;
        existing.DetectedPoNumber = null;
        existing.IsSystemInitiated = true;
        existing.IsRead = true;
        existing.ReadAt = DateTime.UtcNow;
        existing.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);
    }

    private static string EnsureReplySubject(string? value)
    {
        var trimmed = value?.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
            return "PO Follow-up";

        return trimmed.StartsWith("Re:", StringComparison.OrdinalIgnoreCase) ? trimmed : $"Re: {trimmed}";
    }

    private static string BuildRawMessage(
        string to,
        string subject,
        string body,
        string? replyToRfcMessageId,
        string? referencesHeader)
    {
        var headers = new List<string>
        {
            $"To: {to}",
            $"Subject: {EncodeMimeHeader(subject)}",
            "Content-Type: text/plain; charset=utf-8",
            "MIME-Version: 1.0",
        };

        if (!string.IsNullOrWhiteSpace(replyToRfcMessageId))
            headers.Add($"In-Reply-To: {replyToRfcMessageId.Trim()}");

        var normalizedReferences = BuildReferencesHeader(referencesHeader, replyToRfcMessageId);
        if (!string.IsNullOrWhiteSpace(normalizedReferences))
            headers.Add($"References: {normalizedReferences}");

        headers.Add("");
        headers.Add(body);

        var mime = string.Join("\r\n", headers);
        var bytes = Encoding.UTF8.GetBytes(mime);
        return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    private static string? BuildReferencesHeader(string? referencesHeader, string? replyToRfcMessageId)
    {
        var values = new List<string>();
        if (!string.IsNullOrWhiteSpace(referencesHeader))
            values.AddRange(referencesHeader.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
        if (!string.IsNullOrWhiteSpace(replyToRfcMessageId))
            values.Add(replyToRfcMessageId.Trim());

        var normalized = values
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        return normalized.Length == 0 ? null : string.Join(" ", normalized);
    }

    private static string EncodeMimeHeader(string value)
    {
        var base64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(value));
        return $"=?UTF-8?B?{base64}?=";
    }

    private static DateTime GetEventOccurredAtUtc(long? internalDateMs, DateTime updatedAt, DateTime createdAt)
    {
        if (internalDateMs.HasValue && internalDateMs.Value > 0)
        {
            try
            {
                return DateTimeOffset.FromUnixTimeMilliseconds(internalDateMs.Value).UtcDateTime;
            }
            catch
            {
            }
        }

        return updatedAt != default ? updatedAt : createdAt;
    }

    private async Task<GmailMessageDetailContext?> LoadMessageDetailsAsync(
        HttpClient client,
        string accessToken,
        string gmailMessageId,
        CancellationToken ct)
    {
        using var messageRequest = new HttpRequestMessage(
            HttpMethod.Get,
            $"https://gmail.googleapis.com/gmail/v1/users/me/messages/{Uri.EscapeDataString(gmailMessageId)}?format=full");
        messageRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        using var messageResponse = await client.SendAsync(messageRequest, ct);
        if (!messageResponse.IsSuccessStatusCode)
            return null;

        var payload = await messageResponse.Content.ReadAsStringAsync(ct);
        var message = JsonSerializer.Deserialize<GmailMessageResponse>(payload, JsonOptions);
        if (message is null)
            return null;

        return new GmailMessageDetailContext(
            GetHeader(message.Payload, "Message-Id"),
            GetHeader(message.Payload, "References"));
    }

    private static string GetHeader(GmailMessagePart? payload, string name)
    {
        if (payload?.Headers is null) return "";
        return payload.Headers.FirstOrDefault(x => string.Equals(x.Name, name, StringComparison.OrdinalIgnoreCase))?.Value ?? "";
    }

    private static IQueryable<GmailMessageLog> FilterLogsByAccount(IQueryable<GmailMessageLog> query, long? gmailAccountId) =>
        gmailAccountId.HasValue
            ? query.Where(x => x.GmailAccountId == gmailAccountId.Value)
            : query.Where(x => x.GmailAccountId == null);

    private sealed record GmailSendApiRequest(string Raw, string? ThreadId);
    private sealed record GmailSendApiResponse(string? Id, string? ThreadId, long? InternalDate);
    private sealed record GmailMessageResponse(string? Id, string? ThreadId, long? InternalDate, string? Snippet, GmailMessagePart? Payload);
    private sealed record GmailMessagePart(List<GmailMessageHeader>? Headers);
    private sealed record GmailMessageHeader(string? Name, string? Value);
    private sealed record GmailMessageDetailContext(string RfcMessageId, string ReferencesHeader);
}
