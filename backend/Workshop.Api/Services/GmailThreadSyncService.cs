using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Workshop.Api.Data;
using Workshop.Api.Models;
using Workshop.Api.Options;

namespace Workshop.Api.Services;

public sealed class GmailThreadSyncService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly AppDbContext _db;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly GmailAccountService _gmailAccountService;
    private readonly GmailTokenService _gmailTokenService;
    private readonly GmailSyncOptions _syncOptions;
    private readonly ILogger<GmailThreadSyncService> _logger;
    private readonly JobPoStateService _jobPoStateService;

    public GmailThreadSyncService(
        AppDbContext db,
        IHttpClientFactory httpClientFactory,
        GmailAccountService gmailAccountService,
        GmailTokenService gmailTokenService,
        IOptions<GmailSyncOptions> syncOptions,
        ILogger<GmailThreadSyncService> logger,
        JobPoStateService jobPoStateService)
    {
        _db = db;
        _httpClientFactory = httpClientFactory;
        _gmailAccountService = gmailAccountService;
        _gmailTokenService = gmailTokenService;
        _syncOptions = syncOptions.Value;
        _logger = logger;
        _jobPoStateService = jobPoStateService;
    }

    public async Task<GmailThreadDbSnapshot> GetThreadSnapshotAsync(
        string? counterpartyEmail,
        string? correlationId,
        int limit,
        long? gmailAccountId,
        CancellationToken ct)
    {
        var normalizedCounterpartyEmail = NormalizeCounterpartyEmail(counterpartyEmail);
        var normalizedCorrelationId = NormalizeCorrelationId(correlationId);
        var normalizedLimit = Math.Clamp(limit, 1, 50);
        var effectiveAccount = await ResolveRequestedAccountAsync(gmailAccountId, ct);

        var isInactive = !string.IsNullOrWhiteSpace(normalizedCorrelationId) &&
            await _db.InactiveGmailCorrelations.AsNoTracking()
                .AnyAsync(x => x.CorrelationId == normalizedCorrelationId, ct);

        var logsQuery = FilterLogsByAccount(_db.GmailMessageLogs.AsNoTracking(), effectiveAccount?.Id);
        if (!string.IsNullOrWhiteSpace(normalizedCorrelationId))
        {
            logsQuery = logsQuery.Where(x => x.CorrelationId == normalizedCorrelationId);
        }
        else if (!string.IsNullOrWhiteSpace(normalizedCounterpartyEmail))
        {
            logsQuery = logsQuery.Where(x => x.CounterpartyEmail == normalizedCounterpartyEmail);
        }

        var logs = await logsQuery
            .OrderByDescending(x => x.InternalDateMs ?? 0)
            .ThenByDescending(x => x.Id)
            .Take(normalizedLimit)
            .ToListAsync(ct);

        return new GmailThreadDbSnapshot(
            normalizedCounterpartyEmail,
            normalizedCorrelationId,
            normalizedLimit,
            effectiveAccount?.Id,
            effectiveAccount?.Email,
            logs,
            isInactive,
            logs.Count == 0 ? null : logs.Max(x => x.UpdatedAt));
    }

    public bool ShouldRefresh(GmailThreadDbSnapshot snapshot, bool forceRefresh = false)
    {
        if (snapshot.IsInactive)
            return false;

        if (forceRefresh || snapshot.Logs.Count == 0)
            return true;

        if (!snapshot.LastUpdatedAtUtc.HasValue)
            return true;

        return DateTime.UtcNow - snapshot.LastUpdatedAtUtc.Value >= TimeSpan.FromSeconds(Math.Max(15, _syncOptions.DbFreshForSeconds));
    }

    public async Task<GmailThreadSyncResult> SyncThreadAsync(
        string? counterpartyEmail,
        string? correlationId,
        int limit,
        long? gmailAccountId,
        CancellationToken ct)
    {
        var normalizedCounterpartyEmail = NormalizeCounterpartyEmail(counterpartyEmail);
        var normalizedCorrelationId = NormalizeCorrelationId(correlationId);
        var normalizedLimit = Math.Clamp(limit, 1, 50);

        if (string.IsNullOrWhiteSpace(normalizedCounterpartyEmail) && string.IsNullOrWhiteSpace(normalizedCorrelationId))
            return GmailThreadSyncResult.Failed("counterpartyEmail or correlationId is required.");

        if (!string.IsNullOrWhiteSpace(normalizedCorrelationId))
        {
            var isInactive = await _db.InactiveGmailCorrelations.AsNoTracking()
                .AnyAsync(x => x.CorrelationId == normalizedCorrelationId, ct);
            if (isInactive)
                return GmailThreadSyncResult.SkippedResult("Correlation is inactive. Gmail sync skipped.");
        }

        var tokenResult = await _gmailTokenService.RefreshAccessTokenAsync(gmailAccountId, ct);
        if (!tokenResult.Ok)
        {
            _logger.LogWarning(
                "Gmail sync token refresh failed for {CorrelationId}/{CounterpartyEmail}: {Error}",
                normalizedCorrelationId,
                normalizedCounterpartyEmail,
                tokenResult.Error);
            return GmailThreadSyncResult.Failed(tokenResult.Error ?? "Unable to refresh Gmail access token.");
        }

        var counterpartyEmails = SplitEmailAddresses(normalizedCounterpartyEmail);
        var knownThreadIds = string.IsNullOrWhiteSpace(normalizedCorrelationId)
            ? []
            : await _db.GmailMessageLogs.AsNoTracking()
                .Where(x => x.CorrelationId == normalizedCorrelationId)
                .Where(BuildAccountFilter(tokenResult.AccountId))
                .Where(x => !string.IsNullOrWhiteSpace(x.GmailThreadId))
                .Select(x => x.GmailThreadId!)
                .Distinct()
                .ToListAsync(ct);
        var queryTerms = new List<string>();
        if (counterpartyEmails.Length > 0)
        {
            queryTerms.Add(counterpartyEmails.Length == 1
                ? counterpartyEmails[0]
                : $"({string.Join(" OR ", counterpartyEmails)})");
        }
        if (!string.IsNullOrWhiteSpace(normalizedCorrelationId))
            queryTerms.Add($"\"{normalizedCorrelationId}\"");

        var gmailQuery = string.Join(" ", queryTerms);
        var client = _httpClientFactory.CreateClient();
        var synced = 0;

        if (knownThreadIds.Count > 0)
        {
            foreach (var threadId in knownThreadIds)
            {
                using var threadRequest = new HttpRequestMessage(
                    HttpMethod.Get,
                    $"https://gmail.googleapis.com/gmail/v1/users/me/threads/{Uri.EscapeDataString(threadId)}?format=full");
                threadRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenResult.AccessToken);

                using var threadResponse = await client.SendAsync(threadRequest, ct);
                var threadPayload = await threadResponse.Content.ReadAsStringAsync(ct);
                if (!threadResponse.IsSuccessStatusCode)
                    continue;

                var threadResult = JsonSerializer.Deserialize<GmailThreadResponse>(threadPayload, JsonOptions);
                foreach (var message in threadResult?.Messages ?? [])
                {
                    if (message is null || string.IsNullOrWhiteSpace(message.Id))
                        continue;

                    if (await TryUpsertMatchedMessageAsync(
                            message,
                            counterpartyEmails,
                            normalizedCounterpartyEmail,
                            normalizedCorrelationId,
                            tokenResult.AccountId,
                            tokenResult.AccountEmail,
                            requireCorrelationMatch: false,
                            ct))
                    {
                        synced++;
                    }
                }
            }

            await _jobPoStateService.SyncStateByCorrelationAsync(normalizedCorrelationId, ct);
            return GmailThreadSyncResult.Success(synced);
        }

        var messageRefs = new List<GmailMessageRef>();

        using (var listRequest = new HttpRequestMessage(
                   HttpMethod.Get,
                   $"https://gmail.googleapis.com/gmail/v1/users/me/messages?q={Uri.EscapeDataString(gmailQuery)}&maxResults={normalizedLimit}"))
        {
            listRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenResult.AccessToken);

            using var listResponse = await client.SendAsync(listRequest, ct);
            var listPayload = await listResponse.Content.ReadAsStringAsync(ct);
            if (!listResponse.IsSuccessStatusCode)
            {
                _logger.LogWarning(
                    "Gmail sync query failed for {CorrelationId}/{CounterpartyEmail}: {StatusCode} {Payload}",
                    normalizedCorrelationId,
                    normalizedCounterpartyEmail,
                    (int)listResponse.StatusCode,
                    listPayload);
                return GmailThreadSyncResult.Failed(
                    "Gmail thread sync unavailable. Re-consent with gmail.readonly or gmail.modify to read replies.");
            }

            var listResult = JsonSerializer.Deserialize<GmailMessageListResponse>(listPayload, JsonOptions);
            messageRefs = listResult?.Messages ?? [];
        }

        foreach (var messageRef in messageRefs)
        {
            if (string.IsNullOrWhiteSpace(messageRef.Id))
                continue;

            using var messageRequest = new HttpRequestMessage(
                HttpMethod.Get,
                $"https://gmail.googleapis.com/gmail/v1/users/me/messages/{Uri.EscapeDataString(messageRef.Id)}?format=full");
            messageRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenResult.AccessToken);

            using var messageResponse = await client.SendAsync(messageRequest, ct);
            var messagePayload = await messageResponse.Content.ReadAsStringAsync(ct);
            if (!messageResponse.IsSuccessStatusCode)
                continue;

            var message = JsonSerializer.Deserialize<GmailMessageResponse>(messagePayload, JsonOptions);
            if (message is null)
                continue;

            if (await TryUpsertMatchedMessageAsync(
                    message,
                    counterpartyEmails,
                    normalizedCounterpartyEmail,
                    normalizedCorrelationId,
                    tokenResult.AccountId,
                    tokenResult.AccountEmail,
                    requireCorrelationMatch: true,
                    ct))
            {
                synced++;
            }
        }

        await _jobPoStateService.SyncStateByCorrelationAsync(normalizedCorrelationId, ct);

        return GmailThreadSyncResult.Success(synced);
    }

    private async Task<bool> TryUpsertMatchedMessageAsync(
        GmailMessageResponse message,
        string[] counterpartyEmails,
        string normalizedCounterpartyEmail,
        string? normalizedCorrelationId,
        long? gmailAccountId,
        string? gmailAccountEmail,
        bool requireCorrelationMatch,
        CancellationToken ct)
    {
        var from = GetHeader(message.Payload, "From");
        var to = GetHeader(message.Payload, "To");
        var subject = DecodeMimeWords(GetHeader(message.Payload, "Subject"));
        var body = ExtractBody(message.Payload);
        var snippet = message.Snippet ?? "";
        var rfcMessageId = GetHeader(message.Payload, "Message-Id");
        var referencesHeader = GetHeader(message.Payload, "References");
        var attachments = ExtractAttachments(message.Payload);
        var matchesCounterparty = counterpartyEmails.Length == 0 ||
            counterpartyEmails.Any(email =>
                from.Contains(email, StringComparison.OrdinalIgnoreCase) ||
                to.Contains(email, StringComparison.OrdinalIgnoreCase));
        var matchesCorrelation = string.IsNullOrWhiteSpace(normalizedCorrelationId) ||
            subject.Contains(normalizedCorrelationId, StringComparison.OrdinalIgnoreCase) ||
            body.Contains(normalizedCorrelationId, StringComparison.OrdinalIgnoreCase) ||
            snippet.Contains(normalizedCorrelationId, StringComparison.OrdinalIgnoreCase);

        if (!matchesCounterparty || (requireCorrelationMatch && !matchesCorrelation))
            return false;

        var direction = counterpartyEmails.Any(email => from.Contains(email, StringComparison.OrdinalIgnoreCase))
            ? "reply"
            : "sent";
        var normalizedBody = string.IsNullOrWhiteSpace(body) ? snippet : body;

        await UpsertMessageLogAsync(
            message.Id ?? "",
            message.ThreadId,
            message.InternalDate,
            gmailAccountId,
            gmailAccountEmail,
            direction,
            normalizedCounterpartyEmail,
            from,
            to,
            subject,
            normalizedBody,
            snippet,
            normalizedCorrelationId,
            rfcMessageId,
            referencesHeader,
            attachments,
            isSystemInitiated: false,
            ct);
        return true;
    }

    public async Task<List<GmailThreadSyncTarget>> GetActiveSyncTargetsAsync(CancellationToken ct)
    {
        var effectiveAccount = await _gmailAccountService.GetEffectiveAccountAsync(ct);
        var cutoff = DateTime.UtcNow.AddDays(-Math.Max(1, _syncOptions.ActiveThreadLookbackDays));
        var inactiveCorrelationIds = await _db.InactiveGmailCorrelations.AsNoTracking()
            .Select(x => x.CorrelationId)
            .ToListAsync(ct);

        var targetRows = await FilterLogsByAccount(_db.GmailMessageLogs.AsNoTracking(), effectiveAccount?.Id)
            .Where(x => x.UpdatedAt >= cutoff)
            .Where(x => !string.IsNullOrWhiteSpace(x.CorrelationId))
            .Where(x => !string.IsNullOrWhiteSpace(x.CounterpartyEmail))
            .Where(x => x.Direction == "sent" || x.Direction == "reminder" || x.Direction == "reply")
            .GroupBy(x => new { x.CorrelationId, x.CounterpartyEmail })
            .Select(group => new
            {
                CounterpartyEmail = group.Key.CounterpartyEmail!,
                CorrelationId = group.Key.CorrelationId!,
                LastUpdatedAtUtc = group.Max(x => x.UpdatedAt),
            })
            .OrderByDescending(x => x.LastUpdatedAtUtc)
            .Take(Math.Max(1, _syncOptions.MaxThreadsPerCycle))
            .ToListAsync(ct);

        return targetRows
            .Where(x => !inactiveCorrelationIds.Contains(x.CorrelationId, StringComparer.Ordinal))
            .Select(x => new GmailThreadSyncTarget(
                x.CounterpartyEmail,
                x.CorrelationId,
                x.LastUpdatedAtUtc))
            .ToList();
    }

    public int BackgroundPollIntervalSeconds => Math.Max(30, _syncOptions.PollIntervalSeconds);

    public int BackgroundThreadFetchLimit => Math.Clamp(_syncOptions.ThreadFetchLimit, 1, 50);

    public bool BackgroundSyncEnabled => _syncOptions.Enabled;

    private async Task UpsertMessageLogAsync(
        string gmailMessageId,
        string? gmailThreadId,
        long? internalDateMs,
        long? gmailAccountId,
        string? gmailAccountEmail,
        string direction,
        string counterpartyEmail,
        string? fromAddress,
        string? toAddress,
        string? subject,
        string? body,
        string? snippet,
        string? correlationId,
        string? rfcMessageId,
        string? referencesHeader,
        List<GmailAttachmentDescriptor> attachments,
        bool isSystemInitiated,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(gmailMessageId))
            return;

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
        existing.GmailAccountEmail = NullIfBlank(gmailAccountEmail);
        existing.GmailThreadId = NullIfBlank(gmailThreadId);
        existing.InternalDateMs = internalDateMs;
        var normalizedDirection = direction.Trim();
        existing.Direction =
            string.Equals(existing.Direction, "reminder", StringComparison.OrdinalIgnoreCase) &&
            string.Equals(normalizedDirection, "sent", StringComparison.OrdinalIgnoreCase)
                ? "reminder"
                : normalizedDirection;
        existing.CounterpartyEmail = counterpartyEmail.Trim();
        existing.FromAddress = NullIfBlank(fromAddress);
        existing.ToAddress = NullIfBlank(toAddress);
        existing.Subject = NullIfBlank(subject);
        existing.Body = NullIfBlank(body);
        existing.Snippet = NullIfBlank(snippet);
        existing.CorrelationId = NullIfBlank(correlationId);
        existing.RfcMessageId = NullIfBlank(rfcMessageId);
        existing.ReferencesHeader = NullIfBlank(referencesHeader);
        existing.HasAttachments = attachments.Count > 0;
        existing.AttachmentsJson = attachments.Count > 0
            ? JsonSerializer.Serialize(MergeAttachmentMetadata(existing.AttachmentsJson, attachments), JsonOptions)
            : null;
        existing.DetectedPoNumber = ExtractPoNumber(correlationId, subject, body, snippet);
        existing.IsSystemInitiated = isSystemInitiated || existing.IsSystemInitiated;
        if (existing.Id == 0)
        {
            existing.IsRead = !string.Equals(direction, "reply", StringComparison.OrdinalIgnoreCase);
            existing.ReadAt = existing.IsRead ? DateTime.UtcNow : null;
        }
        existing.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);
    }

    private static string NormalizeCounterpartyEmail(string? counterpartyEmail) =>
        string.IsNullOrWhiteSpace(counterpartyEmail) ? "" : counterpartyEmail.Trim();

    private static string? NormalizeCorrelationId(string? correlationId) =>
        string.IsNullOrWhiteSpace(correlationId) ? null : correlationId.Trim();

    private static string[] SplitEmailAddresses(string? value) =>
        (value ?? "")
            .Split(new[] { ',', ';', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

    private static string GetHeader(GmailMessagePart? payload, string name)
    {
        if (payload?.Headers is null)
            return "";

        return payload.Headers.FirstOrDefault(x => string.Equals(x.Name, name, StringComparison.OrdinalIgnoreCase))?.Value ?? "";
    }

    private static string ExtractBody(GmailMessagePart? payload)
    {
        if (payload is null)
            return "";

        if (string.Equals(payload.MimeType, "text/plain", StringComparison.OrdinalIgnoreCase) &&
            !string.IsNullOrWhiteSpace(payload.Body?.Data))
            return DecodeBase64Url(payload.Body.Data);

        foreach (var part in payload.Parts ?? [])
        {
            var body = ExtractBody(part);
            if (!string.IsNullOrWhiteSpace(body))
                return body;
        }

        if (!string.IsNullOrWhiteSpace(payload.Body?.Data))
            return DecodeBase64Url(payload.Body.Data);

        return "";
    }

    private static List<GmailAttachmentDescriptor> ExtractAttachments(GmailMessagePart? payload)
    {
        var attachments = new List<GmailAttachmentDescriptor>();
        AppendAttachments(payload, attachments);
        return attachments;
    }

    private static void AppendAttachments(GmailMessagePart? payload, List<GmailAttachmentDescriptor> attachments)
    {
        if (payload is null)
            return;

        if (!string.IsNullOrWhiteSpace(payload.Filename) || !string.IsNullOrWhiteSpace(payload.Body?.AttachmentId))
        {
            attachments.Add(new GmailAttachmentDescriptor(
                payload.Filename ?? "attachment",
                payload.MimeType ?? "application/octet-stream",
                payload.Body?.Size,
                payload.Body?.AttachmentId));
        }

        foreach (var part in payload.Parts ?? [])
            AppendAttachments(part, attachments);
    }

    private static string DecodeBase64Url(string value)
    {
        var bytes = DecodeBase64UrlToBytes(value);
        if (bytes.Length == 0)
            return "";

        try
        {
            return Encoding.UTF8.GetString(bytes);
        }
        catch
        {
            return "";
        }
    }

    private static byte[] DecodeBase64UrlToBytes(string value)
    {
        var normalized = value.Replace('-', '+').Replace('_', '/');
        normalized = normalized.PadRight(normalized.Length + ((4 - normalized.Length % 4) % 4), '=');
        try
        {
            return Convert.FromBase64String(normalized);
        }
        catch
        {
            return [];
        }
    }

    private static string? ExtractPoNumber(string? excludedValue, params string?[] values)
    {
        foreach (var value in values)
        {
            if (string.IsNullOrWhiteSpace(value))
                continue;

            foreach (var match in ExtractPoMatches(value))
            {
                if (IsExcludedPoMatch(match.NormalizedPoNumber, excludedValue))
                    continue;

                return match.PoNumber.Trim();
            }
        }

        return null;
    }

    private static List<PoMatch> ExtractPoMatches(string text)
    {
        var results = new List<PoMatch>();
        if (string.IsNullOrWhiteSpace(text))
            return results;

        var patterns = new[]
        {
            @"\bP(?:\.|\s*)?O(?:\.|\s*)?#?\s*[:\-]?\s*(?=[A-Z0-9\-\/]*\d)[A-Z0-9][A-Z0-9\-\/]{1,30}\b",
            @"\bPurchase\s+Order\s*[:#-]?\s*(?=[A-Z0-9\-\/]*\d)[A-Z0-9][A-Z0-9\-\/]{1,30}\b",
        };

        foreach (var pattern in patterns)
        {
            foreach (System.Text.RegularExpressions.Match regexMatch in System.Text.RegularExpressions.Regex.Matches(
                         text,
                         pattern,
                         System.Text.RegularExpressions.RegexOptions.IgnoreCase))
            {
                if (!regexMatch.Success)
                    continue;

                var raw = NormalizePoDisplay(regexMatch.Value);
                var normalized = NormalizePoKey(raw);
                if (string.IsNullOrWhiteSpace(raw) || string.IsNullOrWhiteSpace(normalized))
                    continue;

                results.Add(new PoMatch(raw, normalized));
            }
        }

        return results
            .GroupBy(x => x.NormalizedPoNumber)
            .Select(group => group.First())
            .ToList();
    }

    private static string NormalizePoDisplay(string value)
    {
        var trimmed = value.Trim();
        trimmed = System.Text.RegularExpressions.Regex.Replace(trimmed, @"\s+", " ");
        trimmed = System.Text.RegularExpressions.Regex.Replace(trimmed, @"^(Purchase\s+Order)\s*", "PO ", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        trimmed = System.Text.RegularExpressions.Regex.Replace(trimmed, @"^P\s*\.?\s*O\s*\.?\s*", "PO ", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        trimmed = System.Text.RegularExpressions.Regex.Replace(trimmed, @"^PO\s*#\s*", "PO ", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        trimmed = System.Text.RegularExpressions.Regex.Replace(trimmed, @"^PO\s*:\s*", "PO ", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        return trimmed.Trim();
    }

    private static string NormalizePoKey(string value) =>
        System.Text.RegularExpressions.Regex.Replace(value, @"[^A-Z0-9]+", "", System.Text.RegularExpressions.RegexOptions.IgnoreCase)
            .ToUpperInvariant();

    private static bool IsExcludedPoMatch(string normalizedPoNumber, string? excludedValue)
    {
        if (string.IsNullOrWhiteSpace(normalizedPoNumber) || string.IsNullOrWhiteSpace(excludedValue))
            return false;

        return string.Equals(normalizedPoNumber, NormalizePoKey(excludedValue), StringComparison.OrdinalIgnoreCase);
    }

    private static string DecodeMimeWords(string value)
    {
        if (string.IsNullOrWhiteSpace(value) || !value.Contains("=?"))
            return value;

        try
        {
            var pattern = @"=\?([^?]+)\?([bBqQ])\?([^?]+)\?=";
            return System.Text.RegularExpressions.Regex.Replace(value, pattern, match =>
            {
                var charset = match.Groups[1].Value;
                var encoding = match.Groups[2].Value;
                var text = match.Groups[3].Value;
                var bytes = encoding.Equals("B", StringComparison.OrdinalIgnoreCase)
                    ? Convert.FromBase64String(text)
                    : Encoding.UTF8.GetBytes(text.Replace('_', ' '));
                return Encoding.GetEncoding(charset).GetString(bytes);
            });
        }
        catch
        {
            return value;
        }
    }

    private static string? NullIfBlank(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static List<GmailAttachmentDescriptor> MergeAttachmentMetadata(
        string? existingAttachmentsJson,
        List<GmailAttachmentDescriptor> incomingAttachments)
    {
        if (incomingAttachments.Count == 0)
            return incomingAttachments;

        var existingByKey = DeserializeAttachments(existingAttachmentsJson)
            .GroupBy(BuildAttachmentMergeKey)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);

        return incomingAttachments
            .GroupBy(BuildAttachmentMergeKey)
            .Select(group => group.First())
            .Select(item =>
            {
                if (!existingByKey.TryGetValue(BuildAttachmentMergeKey(item), out var existing))
                    return item;

                return item with
                {
                    CachedRelativePath = item.CachedRelativePath ?? existing.CachedRelativePath,
                    CachedAtUtc = item.CachedAtUtc ?? existing.CachedAtUtc,
                    OcrText = item.OcrText ?? existing.OcrText,
                    OcrExtractedAtUtc = item.OcrExtractedAtUtc ?? existing.OcrExtractedAtUtc,
                };
            })
            .ToList();
    }

    private static string BuildAttachmentMergeKey(GmailAttachmentDescriptor attachment) =>
        $"{attachment.AttachmentId ?? ""}|{attachment.FileName}|{attachment.MimeType}|{attachment.Size?.ToString(CultureInfo.InvariantCulture) ?? ""}";

    private static List<GmailAttachmentDescriptor> DeserializeAttachments(string? attachmentsJson)
    {
        if (string.IsNullOrWhiteSpace(attachmentsJson))
            return [];

        try
        {
            return JsonSerializer.Deserialize<List<GmailAttachmentDescriptor>>(attachmentsJson, JsonOptions) ?? [];
        }
        catch
        {
            return [];
        }
    }

    public sealed record GmailThreadDbSnapshot(
        string CounterpartyEmail,
        string? CorrelationId,
        int Limit,
        long? GmailAccountId,
        string? GmailAccountEmail,
        List<GmailMessageLog> Logs,
        bool IsInactive,
        DateTime? LastUpdatedAtUtc);

    public sealed record GmailThreadSyncTarget(
        string CounterpartyEmail,
        string CorrelationId,
        DateTime LastUpdatedAtUtc);

    public sealed class GmailThreadSyncResult
    {
        public bool Ok { get; private init; }
        public bool Skipped { get; private init; }
        public int SyncedCount { get; private init; }
        public string? Warning { get; private init; }

        public static GmailThreadSyncResult Success(int syncedCount) =>
            new()
            {
                Ok = true,
                SyncedCount = syncedCount,
            };

        public static GmailThreadSyncResult Failed(string warning) =>
            new()
            {
                Ok = false,
                Warning = warning,
            };

        public static GmailThreadSyncResult SkippedResult(string warning) =>
            new()
            {
                Ok = true,
                Skipped = true,
                Warning = warning,
            };
    }

    private async Task<GmailAccount?> ResolveRequestedAccountAsync(long? gmailAccountId, CancellationToken ct)
    {
        if (gmailAccountId.HasValue)
            return await _gmailAccountService.GetByIdAsync(gmailAccountId.Value, ct);

        return await _gmailAccountService.GetEffectiveAccountAsync(ct);
    }

    private static IQueryable<GmailMessageLog> FilterLogsByAccount(IQueryable<GmailMessageLog> query, long? gmailAccountId) =>
        gmailAccountId.HasValue
            ? query.Where(x => x.GmailAccountId == gmailAccountId.Value)
            : query.Where(x => x.GmailAccountId == null);

    private static System.Linq.Expressions.Expression<Func<GmailMessageLog, bool>> BuildAccountFilter(long? gmailAccountId) =>
        gmailAccountId.HasValue
            ? x => x.GmailAccountId == gmailAccountId.Value
            : x => x.GmailAccountId == null;

    private sealed class GmailMessageListResponse
    {
        [JsonPropertyName("messages")]
        public List<GmailMessageRef>? Messages { get; set; }
    }

    private sealed class GmailMessageRef
    {
        [JsonPropertyName("id")]
        public string? Id { get; set; }
    }

    private sealed class GmailMessageResponse
    {
        [JsonPropertyName("id")]
        public string? Id { get; set; }

        [JsonPropertyName("threadId")]
        public string? ThreadId { get; set; }

        [JsonPropertyName("internalDate")]
        [JsonNumberHandling(JsonNumberHandling.AllowReadingFromString)]
        public long? InternalDate { get; set; }

        [JsonPropertyName("snippet")]
        public string? Snippet { get; set; }

        [JsonPropertyName("payload")]
        public GmailMessagePart? Payload { get; set; }
    }

    private sealed class GmailThreadResponse
    {
        [JsonPropertyName("messages")]
        public List<GmailMessageResponse>? Messages { get; set; }
    }

    private sealed class GmailMessagePart
    {
        [JsonPropertyName("mimeType")]
        public string? MimeType { get; set; }

        [JsonPropertyName("filename")]
        public string? Filename { get; set; }

        [JsonPropertyName("headers")]
        public List<GmailHeader>? Headers { get; set; }

        [JsonPropertyName("parts")]
        public List<GmailMessagePart>? Parts { get; set; }

        [JsonPropertyName("body")]
        public GmailMessageBody? Body { get; set; }
    }

    private sealed class GmailHeader
    {
        [JsonPropertyName("name")]
        public string? Name { get; set; }

        [JsonPropertyName("value")]
        public string? Value { get; set; }
    }

    private sealed class GmailMessageBody
    {
        [JsonPropertyName("data")]
        public string? Data { get; set; }

        [JsonPropertyName("attachmentId")]
        public string? AttachmentId { get; set; }

        [JsonPropertyName("size")]
        public int? Size { get; set; }
    }

    private sealed record GmailAttachmentDescriptor(
        string FileName,
        string MimeType,
        int? Size,
        string? AttachmentId,
        string? CachedRelativePath = null,
        DateTime? CachedAtUtc = null,
        string? OcrText = null,
        DateTime? OcrExtractedAtUtc = null);

    private sealed record PoMatch(
        string PoNumber,
        string NormalizedPoNumber);
}
