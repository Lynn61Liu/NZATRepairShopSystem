using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using Workshop.Api.Models;
using Workshop.Api.Options;

namespace Workshop.Api.Services;

public sealed class GmailTokenService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly GmailOptions _options;
    private readonly GmailAccountService _gmailAccountService;

    public GmailTokenService(
        IHttpClientFactory httpClientFactory,
        IOptions<GmailOptions> options,
        GmailAccountService gmailAccountService)
    {
        _httpClientFactory = httpClientFactory;
        _options = options.Value;
        _gmailAccountService = gmailAccountService;
    }

    public Task<GmailTokenRefreshResult> RefreshAccessTokenAsync(CancellationToken ct) =>
        RefreshAccessTokenAsync(accountId: null, ct);

    public async Task<GmailTokenRefreshResult> RefreshAccessTokenAsync(long? accountId, CancellationToken ct)
    {
        var missing = new List<string>();
        if (string.IsNullOrWhiteSpace(_options.ClientId)) missing.Add("Gmail:ClientId");
        if (string.IsNullOrWhiteSpace(_options.ClientSecret)) missing.Add("Gmail:ClientSecret");

        GmailAccount? account = null;
        if (accountId.HasValue)
        {
            account = await _gmailAccountService.GetByIdAsync(accountId.Value, ct);
            if (account is null || !account.IsActive)
            {
                return GmailTokenRefreshResult.Fail(
                    404,
                    "Gmail account not found or inactive.");
            }
        }
        else
        {
            account = await _gmailAccountService.GetEffectiveAccountAsync(ct);
        }

        var refreshToken = account?.RefreshToken;
        if (string.IsNullOrWhiteSpace(refreshToken)) missing.Add("Gmail:RefreshToken");

        if (missing.Count > 0)
        {
            return GmailTokenRefreshResult.Fail(
                400,
                $"Missing configuration: {string.Join(", ", missing)}");
        }

        var client = _httpClientFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://oauth2.googleapis.com/token");
        request.Content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["client_id"] = _options.ClientId,
            ["client_secret"] = _options.ClientSecret,
            ["refresh_token"] = refreshToken!,
            ["grant_type"] = "refresh_token",
        });

        HttpResponseMessage response;
        string payload;
        try
        {
            response = await client.SendAsync(request, ct);
            payload = await response.Content.ReadAsStringAsync(ct);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            return GmailTokenRefreshResult.Fail(504, "Gmail token refresh timed out.");
        }

        if (!response.IsSuccessStatusCode)
            return GmailTokenRefreshResult.Fail((int)response.StatusCode, payload);

        var token = JsonSerializer.Deserialize<RefreshTokenResponse>(payload, JsonOptions);
        if (token is null || string.IsNullOrWhiteSpace(token.AccessToken))
            return GmailTokenRefreshResult.Fail(502, "Refresh token response was empty or invalid.");

        if (account is not null)
        {
            await _gmailAccountService.TouchAccessTokenAsync(
                account.Id,
                token.AccessToken,
                token.ExpiresIn,
                token.Scope,
                ct);
        }

        return GmailTokenRefreshResult.Success(
            token.AccessToken,
            token.ExpiresIn,
            token.Scope ?? "",
            account?.Id,
            account?.Email,
            "account");
    }

    private sealed class RefreshTokenResponse
    {
        [JsonPropertyName("access_token")]
        public string AccessToken { get; set; } = "";

        [JsonPropertyName("expires_in")]
        public int ExpiresIn { get; set; }

        [JsonPropertyName("scope")]
        public string? Scope { get; set; }
    }
}

public sealed class GmailTokenRefreshResult
{
    public bool Ok { get; private init; }
    public int StatusCode { get; private init; }
    public string? Error { get; private init; }
    public string AccessToken { get; private init; } = "";
    public int ExpiresIn { get; private init; }
    public string Scope { get; private init; } = "";
    public long? AccountId { get; private init; }
    public string? AccountEmail { get; private init; }
    public string Source { get; private init; } = "";

    public static GmailTokenRefreshResult Fail(int statusCode, string error) =>
        new()
        {
            Ok = false,
            StatusCode = statusCode,
            Error = error,
        };

    public static GmailTokenRefreshResult Success(
        string accessToken,
        int expiresIn,
        string scope,
        long? accountId,
        string? accountEmail,
        string source) =>
        new()
        {
            Ok = true,
            StatusCode = 200,
            AccessToken = accessToken,
            ExpiresIn = expiresIn,
            Scope = scope,
            AccountId = accountId,
            AccountEmail = accountEmail,
            Source = source,
        };
}
