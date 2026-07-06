using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Workshop.Api.Data;
using Workshop.Api.Models;
using Workshop.Api.Options;

namespace Workshop.Api.Services;

public sealed class GmailDraftService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly AppDbContext _db;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly GmailTokenService _gmailTokenService;
    private readonly GmailOptions _options;

    public GmailDraftService(
        AppDbContext db,
        IHttpClientFactory httpClientFactory,
        IOptions<GmailOptions> options,
        GmailTokenService gmailTokenService)
    {
        _db = db;
        _httpClientFactory = httpClientFactory;
        _options = options.Value;
        _gmailTokenService = gmailTokenService;
    }

    public async Task<GmailDraftStatusResult> GetPoRequestDraftStatusAsync(string? correlationId, long? gmailAccountId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(correlationId))
            return GmailDraftStatusResult.Fail(400, "CorrelationId is required.");

        var normalizedCorrelationId = correlationId.Trim();
        var jobId = JobPoStateService.TryExtractJobIdFromCorrelationId(normalizedCorrelationId);
        if (!jobId.HasValue)
            return GmailDraftStatusResult.Fail(400, "Invalid correlationId.");

        var job = await _db.Jobs.AsNoTracking()
            .Where(x => x.Id == jobId.Value)
            .Select(x => new
            {
                x.Id,
                x.NeedsPo,
                x.Status,
            })
            .FirstOrDefaultAsync(ct);

        if (job is null)
            return GmailDraftStatusResult.Fail(404, "Job not found.");
        if (IsArchivedStatus(job.Status))
            return GmailDraftStatusResult.Fail(400, "Draft status is not available for archived jobs.");
        if (!job.NeedsPo)
            return GmailDraftStatusResult.Fail(400, "Draft status is only available for PO jobs.");

        var storedDraftId = await GetStoredDraftIdAsync(job.Id, ct);
        if (string.IsNullOrWhiteSpace(storedDraftId))
        {
            return GmailDraftStatusResult.Success(
                "none",
                "",
                "",
                "",
                null,
                null,
                "No Gmail draft has been created yet.");
        }

        var tokenResult = await _gmailTokenService.RefreshAccessTokenAsync(gmailAccountId, ct);
        if (!tokenResult.Ok)
        {
            return GmailDraftStatusResult.Fail(
                tokenResult.StatusCode,
                tokenResult.Error ?? "Failed to refresh Gmail access token.",
                SplitScopes(tokenResult.Scope),
                SplitScopes(_options.Scopes),
                tokenResult.AccountId,
                tokenResult.AccountEmail);
        }

        var client = _httpClientFactory.CreateClient();
        var getDraftResult = await GetDraftAsync(client, tokenResult.AccessToken, storedDraftId, ct);
        if (getDraftResult.Ok)
        {
            var draft = getDraftResult.Draft;
            var draftId = draft?.Id ?? storedDraftId;
            var composeUrl = GmailDraftUrlBuilder.BuildComposeUrl(draftId, tokenResult.AccountEmail);

            return GmailDraftStatusResult.Success(
                "available",
                draftId,
                composeUrl,
                GmailDraftUrlBuilder.BuildSentMailboxUrl(tokenResult.AccountEmail),
                tokenResult.AccountId,
                tokenResult.AccountEmail,
                "Gmail draft is available.");
        }

        if (getDraftResult.StatusCode == (int)HttpStatusCode.NotFound)
        {
            return GmailDraftStatusResult.Success(
                "missing",
                storedDraftId,
                "",
                GmailDraftUrlBuilder.BuildSentMailboxUrl(tokenResult.AccountEmail),
                tokenResult.AccountId,
                tokenResult.AccountEmail,
                "草稿创建过，但当前找不到，可能已经发送或删除。");
        }

        return GmailDraftStatusResult.Fail(
            getDraftResult.StatusCode,
            getDraftResult.Error ?? "Failed to load Gmail draft.",
            getDraftResult.GrantedScopes.Length > 0 ? getDraftResult.GrantedScopes : SplitScopes(tokenResult.Scope),
            getDraftResult.ConfiguredScopes.Length > 0 ? getDraftResult.ConfiguredScopes : SplitScopes(_options.Scopes));
    }

    public async Task<GmailDraftUpsertResult> UpsertPoRequestDraftAsync(GmailPoDraftRequest request, CancellationToken ct)
    {
        if (request is null)
            return GmailDraftUpsertResult.Fail(400, "Missing payload.");

        if (string.IsNullOrWhiteSpace(request.To))
            return GmailDraftUpsertResult.Fail(400, "To is required.");
        if (string.IsNullOrWhiteSpace(request.Subject))
            return GmailDraftUpsertResult.Fail(400, "Subject is required.");
        if (string.IsNullOrWhiteSpace(request.CorrelationId))
            return GmailDraftUpsertResult.Fail(400, "CorrelationId is required.");

        var correlationId = request.CorrelationId.Trim();
        var jobId = JobPoStateService.TryExtractJobIdFromCorrelationId(correlationId);
        if (!jobId.HasValue)
            return GmailDraftUpsertResult.Fail(400, "Invalid correlationId.");

        var job = await _db.Jobs.AsNoTracking()
            .Where(x => x.Id == jobId.Value)
            .Select(x => new
            {
                x.Id,
                x.NeedsPo,
                x.Status,
            })
            .FirstOrDefaultAsync(ct);

        if (job is null)
            return GmailDraftUpsertResult.Fail(404, "Job not found.");
        if (IsArchivedStatus(job.Status))
            return GmailDraftUpsertResult.Fail(400, "Draft generation is not available for archived jobs.");
        if (!job.NeedsPo)
            return GmailDraftUpsertResult.Fail(400, "Draft generation is only available for PO jobs.");

        var hasPaidInvoice = await _db.JobInvoices.AsNoTracking()
            .AnyAsync(x => x.JobId == job.Id && x.ExternalStatus != null && x.ExternalStatus.ToUpper() == "PAID", ct);
        if (hasPaidInvoice)
            return GmailDraftUpsertResult.Fail(400, "PO draft data is locked because the invoice is already marked as Paid in Xero.");

        var existingDraftId = await GetStoredDraftIdAsync(job.Id, ct);
        if (!request.ForceCreate && !string.IsNullOrWhiteSpace(existingDraftId))
        {
            return GmailDraftUpsertResult.Fail(409, "Gmail draft already exists. Open the draft instead of creating another one.");
        }

        var tokenResult = await _gmailTokenService.RefreshAccessTokenAsync(request.GmailAccountId, ct);
        if (!tokenResult.Ok)
            return GmailDraftUpsertResult.Fail(tokenResult.StatusCode, tokenResult.Error ?? "Failed to refresh Gmail access token.");

        var rawMessage = GmailMimeMessageBuilder.BuildRawMessage(
            request.To,
            request.Subject,
            request.Body ?? "",
            request.IsHtmlBody,
            request.HtmlBodyOverride,
            request.ReplyToRfcMessageId,
            request.ReferencesHeader,
            request.Attachments);

        var client = _httpClientFactory.CreateClient();
        var createResult = await CreateDraftAsync(client, tokenResult.AccessToken, rawMessage, ct);
        if (!createResult.Ok)
        {
            return GmailDraftUpsertResult.Fail(
                createResult.StatusCode,
                createResult.Error ?? "Failed to create Gmail draft.",
                createResult.GrantedScopes.Length > 0 ? createResult.GrantedScopes : SplitScopes(tokenResult.Scope),
                createResult.ConfiguredScopes.Length > 0 ? createResult.ConfiguredScopes : SplitScopes(_options.Scopes));
        }

        var draftResponse = createResult.Draft;
        if (draftResponse is null || string.IsNullOrWhiteSpace(draftResponse.Id))
            return GmailDraftUpsertResult.Fail(500, "Failed to parse Gmail draft create response.");

        await UpsertDraftStateAsync(job.Id, correlationId, request.To.Trim(), draftResponse.Id!, ct);

        var composeUrl = GmailDraftUrlBuilder.BuildComposeUrl(draftResponse.Id!, tokenResult.AccountEmail);
        return GmailDraftUpsertResult.Success(
            draftResponse.Id!,
            draftResponse.Message?.Id ?? "",
            composeUrl,
            string.IsNullOrWhiteSpace(existingDraftId) ? "created" : "recreated",
            tokenResult.AccountId,
            tokenResult.AccountEmail,
            tokenResult.Scope,
            tokenResult.ExpiresIn);
    }

    private async Task<string?> GetStoredDraftIdAsync(long jobId, CancellationToken ct)
    {
        return await _db.JobPoStates.AsNoTracking()
            .Where(x => x.JobId == jobId)
            .Select(x => x.GmailDraftId)
            .FirstOrDefaultAsync(ct);
    }

    private async Task UpsertDraftStateAsync(long jobId, string correlationId, string counterpartyEmail, string gmailDraftId, CancellationToken ct)
    {
        var state = await _db.JobPoStates.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (state is null)
        {
            state = new JobPoState
            {
                JobId = jobId,
                CorrelationId = correlationId,
                CreatedAt = DateTime.UtcNow,
            };
            _db.JobPoStates.Add(state);
        }

        state.CorrelationId = correlationId;
        state.CounterpartyEmail = counterpartyEmail;
        state.GmailDraftId = gmailDraftId.Trim();
        state.GmailDraftUpdatedAt = DateTime.UtcNow;
        state.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);
    }

    private async Task<GmailDraftMutationResult> GetDraftAsync(HttpClient client, string accessToken, string draftId, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, $"https://gmail.googleapis.com/gmail/v1/users/me/drafts/{Uri.EscapeDataString(draftId)}");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        using var response = await client.SendAsync(request, ct);
        var payload = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
        {
            return GmailDraftMutationResult.Fail(
                (int)response.StatusCode,
                payload);
        }

        return GmailDraftMutationResult.Success(ParseDraftResponse(payload));
    }

    private async Task<GmailDraftMutationResult> CreateDraftAsync(HttpClient client, string accessToken, string rawMessage, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://gmail.googleapis.com/gmail/v1/users/me/drafts");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        request.Content = JsonContent.Create(new GmailDraftApiUpsertRequest(new GmailDraftMessageRequest(rawMessage)));

        using var response = await client.SendAsync(request, ct);
        var payload = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
        {
            return GmailDraftMutationResult.Fail(
                (int)response.StatusCode,
                payload);
        }

        return GmailDraftMutationResult.Success(ParseDraftResponse(payload));
    }

    private static GmailDraftApiResponse? ParseDraftResponse(string payload)
    {
        if (string.IsNullOrWhiteSpace(payload))
            return null;

        return JsonSerializer.Deserialize<GmailDraftApiResponse>(payload, JsonOptions);
    }

    private static string[] SplitScopes(string? scopes) =>
        string.IsNullOrWhiteSpace(scopes)
            ? []
            : scopes.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    private static bool IsArchivedStatus(string? status)
        => string.Equals(status?.Trim(), "Archived", StringComparison.OrdinalIgnoreCase);

    private sealed record GmailDraftApiUpsertRequest(
        [property: JsonPropertyName("message")] GmailDraftMessageRequest Message);

    private sealed record GmailDraftMessageRequest(
        [property: JsonPropertyName("raw")] string Raw);

}

public sealed record GmailPoDraftRequest(
    string To,
    string Subject,
    string? Body,
    bool IsHtmlBody,
    string? HtmlBodyOverride,
    string? ReplyToRfcMessageId,
    string? ReferencesHeader,
    long? GmailAccountId,
    string? CorrelationId,
    IReadOnlyList<GmailMessageAttachment>? Attachments = null,
    bool ForceCreate = false);

public sealed record GmailDraftStatusResult(
    bool Ok,
    int StatusCode,
    string? Error,
    string DraftState,
    string DraftId,
    string ComposeUrl,
    string SentMailboxUrl,
    long? GmailAccountId,
    string? GmailAccountEmail,
    string? Message,
    string[] GrantedScopes,
    string[] ConfiguredScopes,
    string? Scope,
    int? AccessTokenExpiresIn)
{
    public static GmailDraftStatusResult Success(
        string draftState,
        string draftId,
        string composeUrl,
        string sentMailboxUrl,
        long? gmailAccountId,
        string? gmailAccountEmail,
        string? message,
        string[]? grantedScopes = null,
        string[]? configuredScopes = null,
        string? scope = null,
        int? accessTokenExpiresIn = null) =>
        new(
            true,
            200,
            null,
            draftState,
            draftId,
            composeUrl,
            sentMailboxUrl,
            gmailAccountId,
            gmailAccountEmail,
            message,
            grantedScopes ?? [],
            configuredScopes ?? [],
            scope,
            accessTokenExpiresIn);

    public static GmailDraftStatusResult Fail(
        int statusCode,
        string error,
        string[]? grantedScopes = null,
        string[]? configuredScopes = null,
        long? gmailAccountId = null,
        string? gmailAccountEmail = null) =>
        new(
            false,
            statusCode,
            error,
            "",
            "",
            "",
            "",
            gmailAccountId,
            gmailAccountEmail,
            null,
            grantedScopes ?? [],
            configuredScopes ?? [],
            null,
            null);
}

public sealed record GmailDraftUpsertResult(
    bool Ok,
    int StatusCode,
    string? Error,
    string DraftId,
    string DraftMessageId,
    string ComposeUrl,
    string DraftStatus,
    long? GmailAccountId,
    string? GmailAccountEmail,
    string[] GrantedScopes,
    string[] ConfiguredScopes,
    string? Scope,
    int? AccessTokenExpiresIn)
{
    public static GmailDraftUpsertResult Success(
        string draftId,
        string draftMessageId,
        string composeUrl,
        string draftStatus,
        long? gmailAccountId,
        string? gmailAccountEmail,
        string? scope,
        int? accessTokenExpiresIn,
        string[]? grantedScopes = null,
        string[]? configuredScopes = null) =>
        new(
            true,
            200,
            null,
            draftId,
            draftMessageId,
            composeUrl,
            draftStatus,
            gmailAccountId,
            gmailAccountEmail,
            grantedScopes ?? [],
            configuredScopes ?? [],
            scope,
            accessTokenExpiresIn);

    public static GmailDraftUpsertResult Fail(
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
            grantedScopes ?? [],
            configuredScopes ?? [],
            null,
            null);
}

public static class GmailDraftUrlBuilder
{
    public static string BuildComposeUrl(string draftId, string? accountEmail)
    {
        var normalizedDraftId = draftId.Trim();
        var encodedDraftId = Uri.EscapeDataString(normalizedDraftId);
        if (!string.IsNullOrWhiteSpace(accountEmail))
        {
            return $"https://mail.google.com/mail/u/?authuser={Uri.EscapeDataString(accountEmail.Trim())}#drafts?compose={encodedDraftId}";
        }

        return $"https://mail.google.com/mail/u/0/#drafts?compose={encodedDraftId}";
    }

    public static string BuildSentMailboxUrl(string? accountEmail)
    {
        if (!string.IsNullOrWhiteSpace(accountEmail))
        {
            return $"https://mail.google.com/mail/u/?authuser={Uri.EscapeDataString(accountEmail.Trim())}#sent";
        }

        return "https://mail.google.com/mail/u/0/#sent";
    }
}

internal sealed record GmailDraftMutationResult(
    bool Ok,
    int StatusCode,
    string? Error,
    GmailDraftApiResponse? Draft,
    string[] GrantedScopes,
    string[] ConfiguredScopes)
{
    public static GmailDraftMutationResult Success(GmailDraftApiResponse? draft) => new(true, 200, null, draft, [], []);

    public static GmailDraftMutationResult Fail(int statusCode, string error, string[]? grantedScopes = null, string[]? configuredScopes = null) =>
        new(false, statusCode, error, null, grantedScopes ?? [], configuredScopes ?? []);
}

internal sealed class GmailDraftApiResponse
{
    [JsonPropertyName("id")]
    public string? Id { get; set; }

    [JsonPropertyName("message")]
    public GmailDraftMessageResponse? Message { get; set; }
}

internal sealed class GmailDraftMessageResponse
{
    [JsonPropertyName("id")]
    public string? Id { get; set; }

    [JsonPropertyName("threadId")]
    public string? ThreadId { get; set; }
}
