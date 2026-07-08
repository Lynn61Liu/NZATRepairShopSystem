using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Workshop.Api.Services;

public sealed class GmailLabelService
{
    private const string GmailModifyScope = "https://www.googleapis.com/auth/gmail.modify";
    private const string InvoicedLabelName = "invoiced";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly GmailTokenService _gmailTokenService;
    private readonly GmailAccountService _gmailAccountService;

    public GmailLabelService(
        IHttpClientFactory httpClientFactory,
        GmailTokenService gmailTokenService,
        GmailAccountService gmailAccountService)
    {
        _httpClientFactory = httpClientFactory;
        _gmailTokenService = gmailTokenService;
        _gmailAccountService = gmailAccountService;
    }

    public async Task<GmailLabelResult> AddInvoicedLabelAsync(
        long? gmailAccountId,
        string? gmailThreadId,
        string? gmailMessageId,
        CancellationToken ct)
    {
        var normalizedThreadId = gmailThreadId?.Trim();
        var normalizedMessageId = gmailMessageId?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedThreadId) && string.IsNullOrWhiteSpace(normalizedMessageId))
            return GmailLabelResult.Fail(400, "Gmail thread id or message id is required.");

        var tokenResult = await _gmailTokenService.RefreshAccessTokenAsync(gmailAccountId, ct);
        if (!tokenResult.Ok)
            return GmailLabelResult.Fail(tokenResult.StatusCode, tokenResult.Error ?? "Failed to refresh Gmail access token.");

        var storedScope = await GetStoredScopeAsync(tokenResult.AccountId ?? gmailAccountId, ct);
        if (!HasModifyScope(tokenResult.Scope) && !HasModifyScope(storedScope))
        {
            return GmailLabelResult.Fail(
                403,
                $"Gmail account is missing required scope {GmailModifyScope}. Reconnect Gmail with modify access.");
        }

        var client = _httpClientFactory.CreateClient();
        var labelResult = await ResolveInvoicedLabelIdAsync(client, tokenResult.AccessToken, ct);
        if (!labelResult.Ok)
            return labelResult;

        var modifyResult = await AddLabelAsync(
            client,
            tokenResult.AccessToken,
            labelResult.LabelId!,
            normalizedThreadId,
            normalizedMessageId,
            ct);

        return modifyResult.Ok
            ? GmailLabelResult.Success(labelResult.LabelId!)
            : modifyResult;
    }

    private static bool HasModifyScope(string? scopes) =>
        !string.IsNullOrWhiteSpace(scopes) &&
        scopes.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Any(scope => string.Equals(scope, GmailModifyScope, StringComparison.OrdinalIgnoreCase));

    private async Task<string?> GetStoredScopeAsync(long? gmailAccountId, CancellationToken ct)
    {
        if (gmailAccountId.HasValue)
        {
            var account = await _gmailAccountService.GetByIdAsync(gmailAccountId.Value, ct);
            return account?.Scope;
        }

        return (await _gmailAccountService.GetEffectiveAccountAsync(ct))?.Scope;
    }

    private async Task<GmailLabelResult> ResolveInvoicedLabelIdAsync(HttpClient client, string accessToken, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "https://gmail.googleapis.com/gmail/v1/users/me/labels");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        using var response = await client.SendAsync(request, ct);
        var payload = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
            return GmailLabelResult.Fail((int)response.StatusCode, payload);

        var labels = JsonSerializer.Deserialize<GmailLabelsResponse>(payload, JsonOptions);
        var label = (labels?.Labels ?? []).FirstOrDefault(x =>
            string.Equals(x.Name?.Trim(), InvoicedLabelName, StringComparison.OrdinalIgnoreCase));

        if (string.IsNullOrWhiteSpace(label?.Id))
            return GmailLabelResult.Fail(404, "Existing Gmail label 'invoiced' was not found.");

        return GmailLabelResult.Success(label.Id);
    }

    private async Task<GmailLabelResult> AddLabelAsync(
        HttpClient client,
        string accessToken,
        string labelId,
        string? threadId,
        string? messageId,
        CancellationToken ct)
    {
        var endpoint = !string.IsNullOrWhiteSpace(threadId)
            ? $"https://gmail.googleapis.com/gmail/v1/users/me/threads/{Uri.EscapeDataString(threadId)}/modify"
            : $"https://gmail.googleapis.com/gmail/v1/users/me/messages/{Uri.EscapeDataString(messageId!)}/modify";

        using var request = new HttpRequestMessage(HttpMethod.Post, endpoint);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        request.Content = JsonContent.Create(new GmailModifyRequest([labelId]));

        using var response = await client.SendAsync(request, ct);
        var payload = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
            return GmailLabelResult.Fail((int)response.StatusCode, payload);

        return GmailLabelResult.Success(labelId);
    }

    private sealed record GmailLabelsResponse(
        [property: JsonPropertyName("labels")] IReadOnlyList<GmailLabelResponse> Labels);

    private sealed record GmailLabelResponse(
        [property: JsonPropertyName("id")] string? Id,
        [property: JsonPropertyName("name")] string? Name);

    private sealed record GmailModifyRequest(
        [property: JsonPropertyName("addLabelIds")] IReadOnlyList<string> AddLabelIds);
}

public sealed record GmailLabelResult(
    bool Ok,
    int StatusCode,
    string? Error,
    string? LabelId)
{
    public static GmailLabelResult Success(string labelId) =>
        new(true, 200, null, labelId);

    public static GmailLabelResult Fail(int statusCode, string error) =>
        new(false, statusCode, error, null);
}
