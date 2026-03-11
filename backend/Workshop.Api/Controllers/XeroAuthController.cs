using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using Workshop.Api.Options;
using Workshop.Api.Services;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/xero")]
public class XeroAuthController : ControllerBase
{
    private const string StateCachePrefix = "xero-oauth-state:";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IMemoryCache _cache;
    private readonly XeroOptions _options;
    private readonly XeroTokenService _xeroTokenService;

    public XeroAuthController(
        IHttpClientFactory httpClientFactory,
        IMemoryCache cache,
        IOptions<XeroOptions> options,
        XeroTokenService xeroTokenService)
    {
        _httpClientFactory = httpClientFactory;
        _cache = cache;
        _options = options.Value;
        _xeroTokenService = xeroTokenService;
    }

    [HttpGet("connect")]
    public IActionResult Connect([FromQuery] bool redirect = false, [FromQuery] string? scopes = null)
    {
        var validationError = ValidateConfiguration();
        if (validationError is not null)
            return BadRequest(new { error = validationError });

        var resolvedScopes = ResolveScopes(scopes);
        var state = Guid.NewGuid().ToString("N");
        _cache.Set(StateCachePrefix + state, true, TimeSpan.FromMinutes(15));

        var authUrl = BuildAuthorizeUrl(state, resolvedScopes);
        if (redirect)
            return Redirect(authUrl);

        return Ok(new
        {
            authorizeUrl = authUrl,
            callbackUrl = _options.RedirectUri,
            scopes = SplitScopes(resolvedScopes),
            scopesSource = string.IsNullOrWhiteSpace(scopes) ? "configuration" : "query",
        });
    }

    [HttpGet("callback")]
    public async Task<IActionResult> Callback(
        [FromQuery] string? code,
        [FromQuery] string? state,
        [FromQuery] string? error,
        [FromQuery(Name = "error_description")] string? errorDescription,
        CancellationToken ct)
    {
        if (!string.IsNullOrWhiteSpace(error))
        {
            return BadRequest(new
            {
                error,
                errorDescription,
            });
        }

        if (string.IsNullOrWhiteSpace(code))
            return BadRequest(new { error = "Missing authorization code." });

        if (string.IsNullOrWhiteSpace(state) || !_cache.TryGetValue(StateCachePrefix + state, out _))
            return BadRequest(new { error = "Missing or invalid OAuth state." });

        _cache.Remove(StateCachePrefix + state);

        var tokenResult = await ExchangeCodeForTokenAsync(code, ct);
        if (!tokenResult.ok)
            return StatusCode(tokenResult.statusCode, new { error = tokenResult.error });

        var connectionsResult = await LoadConnectionsAsync(tokenResult.accessToken!, ct);
        if (!connectionsResult.ok)
        {
            return StatusCode(connectionsResult.statusCode, new
            {
                error = connectionsResult.error,
                refreshToken = tokenResult.refreshToken,
                accessTokenExpiresIn = tokenResult.expiresIn,
            });
        }

        var hasOfflineAccess = SplitScopes(tokenResult.scope).Contains("offline_access", StringComparer.Ordinal);

        return Ok(new
        {
            message = hasOfflineAccess
                ? "Xero authorization completed. Save the refreshToken and target tenantId into backend configuration."
                : "Xero authorization completed. No refreshToken was requested because offline_access was not included.",
            refreshToken = tokenResult.refreshToken,
            accessTokenExpiresIn = tokenResult.expiresIn,
            scope = tokenResult.scope,
            connections = connectionsResult.connections,
            suggestedConfig = new
            {
                Xero__ClientId = _options.ClientId,
                Xero__ClientSecret = "<already configured>",
                Xero__RedirectUri = _options.RedirectUri,
                Xero__RefreshToken = hasOfflineAccess ? tokenResult.refreshToken : "<add offline_access before persisting a refresh token>",
                Xero__TenantId = connectionsResult.connections?.FirstOrDefault()?.TenantId,
            },
        });
    }

    [HttpGet("health")]
    public IActionResult Health([FromQuery] string? scopes = null)
    {
        var missing = new List<string>();
        if (string.IsNullOrWhiteSpace(_options.ClientId)) missing.Add("Xero:ClientId");
        if (string.IsNullOrWhiteSpace(_options.ClientSecret)) missing.Add("Xero:ClientSecret");
        if (string.IsNullOrWhiteSpace(_options.RedirectUri)) missing.Add("Xero:RedirectUri");
        var apiMissing = new List<string>();
        if (string.IsNullOrWhiteSpace(_options.RefreshToken)) apiMissing.Add("Xero:RefreshToken");
        if (string.IsNullOrWhiteSpace(_options.TenantId)) apiMissing.Add("Xero:TenantId");
        var resolvedScopes = ResolveScopes(scopes);

        return Ok(new
        {
            configured = missing.Count == 0,
            missing,
            apiReady = missing.Count == 0 && apiMissing.Count == 0,
            apiMissing,
            suggestedLocalCallback = "http://localhost:5227/api/xero/callback",
            currentRedirectUri = _options.RedirectUri,
            scopes = SplitScopes(resolvedScopes),
            scopesSource = string.IsNullOrWhiteSpace(scopes) ? "configuration" : "query",
            recommendedScopeOrder = new
            {
                granularApps = new[]
                {
                    "accounting.invoices.read",
                    "accounting.invoices",
                    "accounting.payments",
                    "offline_access",
                },
                legacyApps = new[]
                {
                    "accounting.transactions.read",
                    "accounting.transactions",
                    "offline_access",
                },
                officialDocs = "https://developer.xero.com/documentation/guides/oauth2/scopes/",
                notes = new[]
                {
                    "Scopes are additive. Re-running consent adds new scopes to the existing grant.",
                    "offline_access is required only when you need a refresh token.",
                    "Apps created on or after 2 March 2026 use granular scopes.",
                },
            },
        });
    }

    [HttpGet("invoices/test")]
    public async Task<IActionResult> TestInvoices([FromQuery] int page = 1, CancellationToken ct = default)
    {
        var missing = new List<string>();
        if (string.IsNullOrWhiteSpace(_options.ClientId)) missing.Add("Xero:ClientId");
        if (string.IsNullOrWhiteSpace(_options.ClientSecret)) missing.Add("Xero:ClientSecret");
        if (string.IsNullOrWhiteSpace(_options.RefreshToken)) missing.Add("Xero:RefreshToken");
        if (string.IsNullOrWhiteSpace(_options.TenantId)) missing.Add("Xero:TenantId");

        if (missing.Count > 0)
        {
            return BadRequest(new
            {
                error = "Missing Xero configuration for invoice test.",
                missing,
            });
        }

        var tokenResult = await _xeroTokenService.RefreshAccessTokenAsync(ct);
        if (!tokenResult.Ok)
        {
            return StatusCode(tokenResult.StatusCode, new
            {
                error = tokenResult.Error,
            });
        }

        var client = _httpClientFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, $"https://api.xero.com/api.xro/2.0/Invoices?page={page}");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenResult.AccessToken);
        request.Headers.Add("xero-tenant-id", _options.TenantId);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        using var response = await client.SendAsync(request, ct);
        var payload = await response.Content.ReadAsStringAsync(ct);

        if (!response.IsSuccessStatusCode)
        {
            return StatusCode((int)response.StatusCode, new
            {
                error = payload,
                tenantId = _options.TenantId,
                refreshTokenUpdated = !string.Equals(tokenResult.RefreshToken, _options.RefreshToken, StringComparison.Ordinal),
                latestRefreshToken = tokenResult.RefreshToken,
                nextAction = "Update Xero__RefreshToken in your environment if latestRefreshToken differs from the configured one.",
            });
        }

        object invoicesPayload;
        try
        {
            invoicesPayload = JsonSerializer.Deserialize<object>(payload, JsonOptions) ?? new { raw = payload };
        }
        catch (JsonException)
        {
            invoicesPayload = new { raw = payload };
        }

        return Ok(new
        {
            message = "Xero invoice API is reachable.",
            tenantId = _options.TenantId,
            scope = tokenResult.Scope,
            accessTokenExpiresIn = tokenResult.ExpiresIn,
            refreshTokenUpdated = !string.Equals(tokenResult.RefreshToken, _options.RefreshToken, StringComparison.Ordinal),
            latestRefreshToken = tokenResult.RefreshToken,
            nextAction = "Update Xero__RefreshToken in your environment if latestRefreshToken differs from the configured one.",
            invoices = invoicesPayload,
        });
    }

    private string? ValidateConfiguration()
    {
        if (string.IsNullOrWhiteSpace(_options.ClientId))
            return "Missing Xero:ClientId.";
        if (string.IsNullOrWhiteSpace(_options.ClientSecret))
            return "Missing Xero:ClientSecret.";
        if (string.IsNullOrWhiteSpace(_options.RedirectUri))
            return "Missing Xero:RedirectUri.";
        return null;
    }

    private string BuildAuthorizeUrl(string state, string scopes)
    {
        var query = new Dictionary<string, string?>
        {
            ["response_type"] = "code",
            ["client_id"] = _options.ClientId,
            ["redirect_uri"] = _options.RedirectUri,
            ["scope"] = scopes,
            ["state"] = state,
        };

        var qs = string.Join("&", query.Select(kvp => $"{Uri.EscapeDataString(kvp.Key)}={Uri.EscapeDataString(kvp.Value ?? "")}"));
        return $"https://login.xero.com/identity/connect/authorize?{qs}";
    }

    private string ResolveScopes(string? scopesOverride)
    {
        var scopes = string.IsNullOrWhiteSpace(scopesOverride)
            ? _options.Scopes
            : scopesOverride;

        var uniqueScopes = SplitScopes(scopes)
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        return string.Join(' ', uniqueScopes);
    }

    private static string[] SplitScopes(string? scopes) =>
        (scopes ?? "")
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    private async Task<(bool ok, int statusCode, string? error, string? accessToken, string? refreshToken, int? expiresIn, string? scope)>
        ExchangeCodeForTokenAsync(string code, CancellationToken ct)
    {
        var client = _httpClientFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://identity.xero.com/connect/token");
        var basic = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{_options.ClientId}:{_options.ClientSecret}"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", basic);
        request.Content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["code"] = code,
            ["redirect_uri"] = _options.RedirectUri,
        });

        using var response = await client.SendAsync(request, ct);
        var payload = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
            return (false, (int)response.StatusCode, payload, null, null, null, null);

        var token = JsonSerializer.Deserialize<TokenResponse>(payload, JsonOptions);
        if (token is null || string.IsNullOrWhiteSpace(token.AccessToken))
            return (false, 502, "Token response was empty or invalid.", null, null, null, null);

        return (true, 200, null, token.AccessToken, token.RefreshToken, token.ExpiresIn, token.Scope);
    }

    private async Task<(bool ok, int statusCode, string? error, IReadOnlyList<XeroConnection>? connections)>
        LoadConnectionsAsync(string accessToken, CancellationToken ct)
    {
        var client = _httpClientFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "https://api.xero.com/connections");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        using var response = await client.SendAsync(request, ct);
        var payload = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
            return (false, (int)response.StatusCode, payload, null);

        var connections = JsonSerializer.Deserialize<List<XeroConnection>>(payload, JsonOptions) ?? [];
        return (true, 200, null, connections);
    }

    private sealed class TokenResponse
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

    public sealed class XeroConnection
    {
        public string Id { get; set; } = "";
        public string TenantId { get; set; } = "";
        public string TenantName { get; set; } = "";
        public string TenantType { get; set; } = "";
        public DateTime CreatedDateUtc { get; set; }
        public DateTime UpdatedDateUtc { get; set; }
    }
}
