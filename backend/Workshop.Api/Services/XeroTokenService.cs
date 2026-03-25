using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;

namespace Workshop.Api.Services;

public sealed class XeroTokenService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly SemaphoreSlim _refreshLock = new(1, 1);

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly XeroTokenStore _xeroTokenStore;
    private readonly XeroTokenConfiguration _configuration;

    public XeroTokenService(
        IHttpClientFactory httpClientFactory,
        XeroTokenStore xeroTokenStore,
        XeroTokenConfiguration configuration)
    {
        _httpClientFactory = httpClientFactory;
        _xeroTokenStore = xeroTokenStore;
        _configuration = configuration;
    }

    public async Task<XeroTokenRefreshResult> RefreshAccessTokenAsync(CancellationToken ct)
    {
        await _refreshLock.WaitAsync(ct);
        try
        {
            var state = await _xeroTokenStore.GetEffectiveAsync(ct);
            var missing = new List<string>();
            if (string.IsNullOrWhiteSpace(_configuration.ClientId)) missing.Add("Xero:ClientId");
            if (string.IsNullOrWhiteSpace(_configuration.ClientSecret)) missing.Add("Xero:ClientSecret");
            if (string.IsNullOrWhiteSpace(state.RefreshToken)) missing.Add("Xero:RefreshToken");

            if (missing.Count > 0)
            {
                return XeroTokenRefreshResult.Fail(
                    400,
                    $"Missing configuration: {string.Join(", ", missing)}");
            }

            if (!string.IsNullOrWhiteSpace(state.AccessToken)
                && state.AccessTokenExpiresAt.HasValue
                && state.AccessTokenExpiresAt.Value > DateTime.UtcNow.AddMinutes(2))
            {
                return XeroTokenRefreshResult.Success(
                    state.AccessToken,
                    state.RefreshToken,
                    Math.Max(0, (int)(state.AccessTokenExpiresAt.Value - DateTime.UtcNow).TotalSeconds),
                    state.Scope ?? "",
                    refreshTokenUpdated: false);
            }

            var client = _httpClientFactory.CreateClient();
            using var request = new HttpRequestMessage(HttpMethod.Post, "https://identity.xero.com/connect/token");
            var basic = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{_configuration.ClientId}:{_configuration.ClientSecret}"));
            request.Headers.Authorization = new AuthenticationHeaderValue("Basic", basic);
            request.Content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["grant_type"] = "refresh_token",
                ["refresh_token"] = state.RefreshToken,
            });

            using var response = await client.SendAsync(request, ct);
            var payload = await response.Content.ReadAsStringAsync(ct);
            if (!response.IsSuccessStatusCode)
                return XeroTokenRefreshResult.Fail((int)response.StatusCode, BuildFriendlyError(payload));

            var token = JsonSerializer.Deserialize<RefreshTokenResponse>(payload, JsonOptions);
            if (token is null || string.IsNullOrWhiteSpace(token.AccessToken))
                return XeroTokenRefreshResult.Fail(502, "Refresh token response was empty or invalid.");

            await _xeroTokenStore.SaveRefreshResultAsync(
                state.RecordId,
                token.RefreshToken,
                token.AccessToken,
                token.ExpiresIn,
                token.Scope,
                state.TenantId,
                state.TenantName,
                ct);

            return XeroTokenRefreshResult.Success(
                token.AccessToken,
                token.RefreshToken,
                token.ExpiresIn,
                token.Scope,
                refreshTokenUpdated: !string.Equals(token.RefreshToken, state.RefreshToken, StringComparison.Ordinal));
        }
        finally
        {
            _refreshLock.Release();
        }
    }

    private static string BuildFriendlyError(string payload)
    {
        if (string.IsNullOrWhiteSpace(payload))
            return "Xero token refresh failed.";

        try
        {
            var error = JsonSerializer.Deserialize<XeroTokenErrorResponse>(payload, JsonOptions);
            if (string.Equals(error?.Error, "invalid_grant", StringComparison.OrdinalIgnoreCase))
            {
                return "Xero refresh token is invalid or expired. Reconnect Xero via /api/xero/connect and save the new refresh token.";
            }
        }
        catch (JsonException)
        {
        }

        return payload;
    }

    private sealed class RefreshTokenResponse
    {
        [JsonPropertyName("access_token")]
        public string AccessToken { get; set; } = "";

        [JsonPropertyName("refresh_token")]
        public string RefreshToken { get; set; } = "";

        [JsonPropertyName("expires_in")]
        public int ExpiresIn { get; set; }

        [JsonPropertyName("scope")]
        public string Scope { get; set; } = "";
    }

    private sealed class XeroTokenErrorResponse
    {
        [JsonPropertyName("error")]
        public string Error { get; set; } = "";

        [JsonPropertyName("error_description")]
        public string? ErrorDescription { get; set; }
    }
}

public sealed class XeroTokenRefreshResult
{
    public bool Ok { get; private init; }
    public int StatusCode { get; private init; }
    public string? Error { get; private init; }
    public string AccessToken { get; private init; } = "";
    public string RefreshToken { get; private init; } = "";
    public int ExpiresIn { get; private init; }
    public string Scope { get; private init; } = "";
    public bool RefreshTokenUpdated { get; private init; }

    public static XeroTokenRefreshResult Fail(int statusCode, string error) =>
        new()
        {
            Ok = false,
            StatusCode = statusCode,
            Error = error,
        };

    public static XeroTokenRefreshResult Success(
        string accessToken,
        string refreshToken,
        int expiresIn,
        string scope,
        bool refreshTokenUpdated) =>
        new()
        {
            Ok = true,
            StatusCode = 200,
            AccessToken = accessToken,
            RefreshToken = refreshToken,
            ExpiresIn = expiresIn,
            Scope = scope,
            RefreshTokenUpdated = refreshTokenUpdated,
        };
}
