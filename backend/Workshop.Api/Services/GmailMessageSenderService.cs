using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Workshop.Api.Data;
using Workshop.Api.Options;

namespace Workshop.Api.Services;

public sealed class GmailMessageSenderService
{
    private static readonly TimeSpan DuplicateSendWindow = TimeSpan.FromMinutes(5);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly AppDbContext _db;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly GmailOptions _options;
    private readonly GmailTokenService _gmailTokenService;
    private readonly JobPoStateService _jobPoStateService;

    public GmailMessageSenderService(
        AppDbContext db,
        IHttpClientFactory httpClientFactory,
        IOptions<GmailOptions> options,
        GmailTokenService gmailTokenService,
        JobPoStateService jobPoStateService)
    {
        _db = db;
        _httpClientFactory = httpClientFactory;
        _options = options.Value;
        _gmailTokenService = gmailTokenService;
        _jobPoStateService = jobPoStateService;
    }

    public async Task<GmailMessageSendResult> SendAsync(GmailMessageSendRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.To))
            return GmailMessageSendResult.Fail(400, "To is required.");
        if (string.IsNullOrWhiteSpace(request.Subject))
            return GmailMessageSendResult.Fail(400, "Subject is required.");

        var correlatedJobId = JobPoStateService.TryExtractJobIdFromCorrelationId(request.CorrelationId?.Trim());
        if (correlatedJobId.HasValue)
        {
            var hasPaidInvoice = await _db.JobInvoices.AsNoTracking()
                .AnyAsync(x => x.JobId == correlatedJobId.Value && x.ExternalStatus != null && x.ExternalStatus.ToUpper() == "PAID", ct);
            if (hasPaidInvoice)
                return GmailMessageSendResult.Fail(400, "PO Request data is locked because the invoice is already marked as Paid in Xero.");
        }

        var recipients = NormalizeRecipientAddresses(request.To);
        if (recipients.Length == 0)
            return GmailMessageSendResult.Fail(400, "At least one valid recipient email is required.");

        var normalizedCorrelationId = request.CorrelationId?.Trim();
        var normalizedSubject = request.Subject.Trim();
        var normalizedRecipientList = NormalizeRecipientListForComparison(recipients);
        if (!request.BypassDuplicateProtection && !string.IsNullOrWhiteSpace(normalizedCorrelationId))
        {
            var duplicateThreshold = DateTime.UtcNow.Subtract(DuplicateSendWindow);
            var recentSentLogs = await _db.GmailMessageLogs.AsNoTracking()
                .Where(x => x.Direction == "sent")
                .Where(x => x.CorrelationId == normalizedCorrelationId)
                .Where(x => x.CreatedAt >= duplicateThreshold)
                .Select(x => new
                {
                    x.Subject,
                    x.ToAddress,
                    x.CreatedAt,
                })
                .ToListAsync(ct);

            var recentDuplicate = recentSentLogs.FirstOrDefault(x =>
                string.Equals((x.Subject ?? "").Trim(), normalizedSubject, StringComparison.OrdinalIgnoreCase) &&
                string.Equals(NormalizeRecipientListForComparison(x.ToAddress), normalizedRecipientList, StringComparison.OrdinalIgnoreCase));
            if (recentDuplicate is not null)
            {
                return GmailMessageSendResult.Fail(
                    409,
                    $"Duplicate PO request blocked. The same email was already sent at {recentDuplicate.CreatedAt:yyyy-MM-dd HH:mm:ss} UTC.");
            }
        }

        var tokenResult = await _gmailTokenService.RefreshAccessTokenAsync(request.GmailAccountId, ct);
        if (!tokenResult.Ok)
            return GmailMessageSendResult.Fail(tokenResult.StatusCode, tokenResult.Error ?? "Failed to refresh Gmail access token.");

        var rawMessage = BuildRawMessage(
            string.Join(", ", recipients),
            normalizedSubject,
            request.Body ?? "",
            request.IsHtmlBody,
            request.HtmlBodyOverride,
            request.ReplyToRfcMessageId,
            request.ReferencesHeader);

        var client = _httpClientFactory.CreateClient();
        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
        httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenResult.AccessToken);
        httpRequest.Content = JsonContent.Create(new GmailSendApiRequest(rawMessage, request.ThreadId?.Trim()));

        using var response = await client.SendAsync(httpRequest, ct);
        var payload = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
        {
            return GmailMessageSendResult.Fail(
                (int)response.StatusCode,
                payload,
                SplitScopes(tokenResult.Scope),
                SplitScopes(_options.Scopes));
        }

        var sendResult = JsonSerializer.Deserialize<GmailSendApiResponse>(payload, JsonOptions);
        var sentMessageId = sendResult?.Id ?? "";
        var body = request.Body ?? "";
        string? sentRfcMessageId = null;
        string? sentReferencesHeader = null;
        DateTime sentAt = DateTime.UtcNow;

        if (!string.IsNullOrWhiteSpace(sentMessageId))
        {
            sentAt = ResolveOccurredAtUtc(sendResult?.InternalDate) ?? sentAt;
            var sentDetails = await LoadMessageDetailsAsync(client, tokenResult.AccessToken, sentMessageId, ct);
            sentRfcMessageId = sentDetails?.RfcMessageId;
            sentReferencesHeader = sentDetails?.ReferencesHeader;

            await UpsertMessageLogAsync(
                gmailMessageId: sentMessageId,
                gmailThreadId: sendResult?.ThreadId,
                internalDateMs: sendResult?.InternalDate,
                gmailAccountId: tokenResult.AccountId,
                gmailAccountEmail: tokenResult.AccountEmail,
                direction: "sent",
                counterpartyEmail: string.Join(", ", recipients),
                fromAddress: null,
                toAddress: string.Join(", ", recipients),
                subject: normalizedSubject,
                body: body,
                snippet: body.Length > 240 ? body[..240] : body,
                correlationId: normalizedCorrelationId,
                rfcMessageId: sentRfcMessageId,
                referencesHeader: sentReferencesHeader,
                isSystemInitiated: true,
                ct: ct);

            await _jobPoStateService.SyncStateByCorrelationAsync(normalizedCorrelationId, ct);
        }

        return GmailMessageSendResult.Success(
            sentMessageId,
            sendResult?.ThreadId ?? "",
            sentRfcMessageId ?? "",
            sentReferencesHeader ?? "",
            tokenResult.AccountId,
            tokenResult.AccountEmail,
            tokenResult.Scope,
            tokenResult.ExpiresIn,
            sentAt,
            normalizedSubject,
            body,
            string.Join(", ", recipients));
    }

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
            existing = new Models.GmailMessageLog
            {
                GmailMessageId = gmailMessageId,
                CreatedAt = DateTime.UtcNow,
            };
            _db.GmailMessageLogs.Add(existing);
        }

        existing.GmailAccountId = gmailAccountId;
        existing.GmailAccountEmail = NullIfBlank(gmailAccountEmail);
        existing.GmailThreadId = gmailThreadId?.Trim();
        existing.InternalDateMs = internalDateMs;
        existing.Direction = direction.Trim();
        existing.CounterpartyEmail = counterpartyEmail.Trim();
        existing.FromAddress = NullIfBlank(fromAddress);
        existing.ToAddress = NullIfBlank(toAddress);
        existing.Subject = NullIfBlank(subject);
        existing.Body = NullIfBlank(body);
        existing.Snippet = NullIfBlank(snippet);
        existing.CorrelationId = NullIfBlank(correlationId);
        existing.RfcMessageId = NullIfBlank(rfcMessageId);
        existing.ReferencesHeader = NullIfBlank(referencesHeader);
        existing.HasAttachments = false;
        existing.AttachmentsJson = null;
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

    private static string? ExtractPoNumber(string? excludedValue, params string?[] values)
    {
        foreach (var value in values)
        {
            if (string.IsNullOrWhiteSpace(value))
                continue;

            foreach (var match in System.Text.RegularExpressions.Regex.Matches(
                         value,
                         @"\bP(?:\.|\s*)?O(?:\.|\s*)?#?\s*[:\-]?\s*(?=[A-Z0-9\-\/]*\d)[A-Z0-9][A-Z0-9\-\/]{1,30}\b",
                         System.Text.RegularExpressions.RegexOptions.IgnoreCase).Cast<System.Text.RegularExpressions.Match>())
            {
                var normalized = NormalizePoKey(match.Value);
                if (IsExcludedPoMatch(normalized, excludedValue))
                    continue;

                return match.Value.Trim();
            }
        }

        return null;
    }

    private static bool IsExcludedPoMatch(string normalizedPoNumber, string? excludedValue)
    {
        if (string.IsNullOrWhiteSpace(normalizedPoNumber) || string.IsNullOrWhiteSpace(excludedValue))
            return false;

        return string.Equals(normalizedPoNumber, NormalizePoKey(excludedValue), StringComparison.OrdinalIgnoreCase);
    }

    private static string NormalizePoKey(string value) =>
        System.Text.RegularExpressions.Regex.Replace(value, @"[^A-Z0-9]+", "", System.Text.RegularExpressions.RegexOptions.IgnoreCase)
            .ToUpperInvariant();

    private static string? NullIfBlank(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string[] SplitScopes(string? scopes) =>
        (scopes ?? "")
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Distinct(StringComparer.Ordinal)
            .ToArray();

    private static string[] SplitEmailAddresses(string? value) =>
        (value ?? "")
            .Split(new[] { ',', ';', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

    private static string[] NormalizeRecipientAddresses(string? value) =>
        SplitEmailAddresses(value)
            .Select(item =>
            {
                var angleMatch = System.Text.RegularExpressions.Regex.Match(item, "<([^>]+)>");
                return angleMatch.Success ? angleMatch.Groups[1].Value.Trim() : item.Trim();
            })
            .Where(item => System.Text.RegularExpressions.Regex.IsMatch(
                item,
                @"^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

    private static string NormalizeRecipientListForComparison(IEnumerable<string> recipients) =>
        string.Join(
            ",",
            recipients
                .Select(item => item.Trim().ToLowerInvariant())
                .Where(item => !string.IsNullOrWhiteSpace(item))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(item => item, StringComparer.OrdinalIgnoreCase));

    private static string NormalizeRecipientListForComparison(string? value) =>
        NormalizeRecipientListForComparison(NormalizeRecipientAddresses(value));

    private static string BuildRawMessage(
        string to,
        string subject,
        string body,
        bool isHtmlBody,
        string? htmlBodyOverride,
        string? replyToRfcMessageId,
        string? referencesHeader)
    {
        var normalizedBody = !string.IsNullOrWhiteSpace(htmlBodyOverride)
            ? htmlBodyOverride
            : isHtmlBody
                ? body
                : ConvertPlainTextToHtml(body);

        var headers = new List<string>
        {
            $"To: {to}",
            $"Subject: {EncodeMimeHeader(subject)}",
            "Content-Type: text/html; charset=utf-8",
            "Content-Transfer-Encoding: 8bit",
            "MIME-Version: 1.0",
        };

        if (!string.IsNullOrWhiteSpace(replyToRfcMessageId))
            headers.Add($"In-Reply-To: {replyToRfcMessageId.Trim()}");

        var normalizedReferences = BuildReferencesHeader(referencesHeader, replyToRfcMessageId);
        if (!string.IsNullOrWhiteSpace(normalizedReferences))
            headers.Add($"References: {normalizedReferences}");

        headers.Add("");
        headers.Add(normalizedBody);

        var mime = string.Join("\r\n", headers);
        var bytes = Encoding.UTF8.GetBytes(mime);
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
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

    private static string ConvertPlainTextToHtml(string value)
    {
        var normalized = (value ?? string.Empty).Replace("\r\n", "\n").Replace('\r', '\n');
        var blocks = normalized
            .Split("\n\n", StringSplitOptions.None)
            .Select(block => block.Trim('\n'))
            .Where(block => !string.IsNullOrWhiteSpace(block))
            .Select(block =>
            {
                var escaped = System.Net.WebUtility.HtmlEncode(block);
                var withLineBreaks = escaped.Replace("\n", "<br>");
                return $"<p style=\"margin:0 0 16px; line-height:1.6;\">{withLineBreaks}</p>";
            })
            .ToList();

        if (blocks.Count == 0)
            blocks.Add("<p style=\"margin:0; line-height:1.6;\"></p>");

        return $"""
<!doctype html>
<html>
  <body style="margin:0; font-family:Arial, sans-serif; font-size:14px; color:#222;">
    {string.Join("", blocks)}
  </body>
</html>
""";
    }

    private static string GetHeader(GmailMessagePart? payload, string name)
    {
        if (payload?.Headers is null)
            return "";

        return payload.Headers.FirstOrDefault(x => string.Equals(x.Name, name, StringComparison.OrdinalIgnoreCase))?.Value ?? "";
    }

    private static DateTime? ResolveOccurredAtUtc(long? internalDateMs)
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

    private sealed record GmailSendApiRequest(
        [property: JsonPropertyName("raw")] string Raw,
        [property: JsonPropertyName("threadId")] string? ThreadId);

    private sealed class GmailSendApiResponse
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = "";

        [JsonPropertyName("threadId")]
        public string ThreadId { get; set; } = "";

        [JsonPropertyName("internalDate")]
        [JsonNumberHandling(JsonNumberHandling.AllowReadingFromString)]
        public long? InternalDate { get; set; }
    }

    private sealed class GmailMessageResponse
    {
        [JsonPropertyName("payload")]
        public GmailMessagePart? Payload { get; set; }
    }

    private sealed class GmailMessagePart
    {
        [JsonPropertyName("headers")]
        public List<GmailHeader>? Headers { get; set; }
    }

    private sealed class GmailHeader
    {
        [JsonPropertyName("name")]
        public string? Name { get; set; }

        [JsonPropertyName("value")]
        public string? Value { get; set; }
    }

    private sealed record GmailMessageDetailContext(string RfcMessageId, string ReferencesHeader);
}

public sealed record GmailMessageSendRequest(
    string To,
    string Subject,
    string? Body,
    string? CorrelationId,
    string? ThreadId,
    string? ReplyToRfcMessageId,
    string? ReferencesHeader,
    long? GmailAccountId,
    bool IsHtmlBody = false,
    string? HtmlBodyOverride = null,
    bool BypassDuplicateProtection = false);

public sealed record GmailMessageSendResult(
    bool Ok,
    int StatusCode,
    string? Error,
    string MessageId,
    string ThreadId,
    string RfcMessageId,
    string ReferencesHeader,
    long? GmailAccountId,
    string? GmailAccountEmail,
    string? Scope,
    int? AccessTokenExpiresIn,
    DateTime? SentAtUtc,
    string Subject,
    string Body,
    string RecipientEmail,
    string[] GrantedScopes,
    string[] ConfiguredScopes)
{
    public static GmailMessageSendResult Success(
        string messageId,
        string threadId,
        string rfcMessageId,
        string referencesHeader,
        long? gmailAccountId,
        string? gmailAccountEmail,
        string? scope,
        int? accessTokenExpiresIn,
        DateTime sentAtUtc,
        string subject,
        string body,
        string recipientEmail) =>
        new(
            true,
            200,
            null,
            messageId,
            threadId,
            rfcMessageId,
            referencesHeader,
            gmailAccountId,
            gmailAccountEmail,
            scope,
            accessTokenExpiresIn,
            sentAtUtc,
            subject,
            body,
            recipientEmail,
            [],
            []);

    public static GmailMessageSendResult Fail(
        int statusCode,
        string error,
        string[]? grantedScopes = null,
        string[]? configuredScopes = null) =>
        new(
            false,
            statusCode,
            error,
            "",
            "",
            "",
            "",
            null,
            null,
            null,
            null,
            null,
            "",
            "",
            "",
            grantedScopes ?? [],
            configuredScopes ?? []);
}
