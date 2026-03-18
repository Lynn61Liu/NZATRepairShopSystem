using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Workshop.Api.Options;

namespace Workshop.Api.Services;

public sealed class XeroPaymentService
{
    private static readonly JsonSerializerOptions XeroWriteOptions = new()
    {
        PropertyNamingPolicy = null,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly XeroTokenConfiguration _configuration;
    private readonly XeroTokenService _xeroTokenService;
    private readonly XeroTokenStore _xeroTokenStore;

    public XeroPaymentService(
        IHttpClientFactory httpClientFactory,
        XeroTokenConfiguration configuration,
        XeroTokenService xeroTokenService,
        XeroTokenStore xeroTokenStore)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _xeroTokenService = xeroTokenService;
        _xeroTokenStore = xeroTokenStore;
    }

    public async Task<XeroPaymentCreateResult> CreatePaymentAsync(CreateXeroPaymentRequest request, CancellationToken ct)
    {
        var state = await _xeroTokenStore.GetEffectiveAsync(ct);
        var missing = new List<string>();
        if (string.IsNullOrWhiteSpace(_configuration.ClientId)) missing.Add("Xero:ClientId");
        if (string.IsNullOrWhiteSpace(_configuration.ClientSecret)) missing.Add("Xero:ClientSecret");
        if (string.IsNullOrWhiteSpace(state.RefreshToken)) missing.Add("Xero:RefreshToken");
        if (string.IsNullOrWhiteSpace(state.TenantId)) missing.Add("Xero:TenantId");
        if (missing.Count > 0)
        {
            return XeroPaymentCreateResult.Fail(400, "Missing Xero configuration for payment create.", new { missing }, state.TenantId ?? "");
        }

        var tokenResult = await _xeroTokenService.RefreshAccessTokenAsync(ct);
        if (!tokenResult.Ok)
        {
            return XeroPaymentCreateResult.Fail(
                tokenResult.StatusCode,
                tokenResult.Error ?? "Failed to refresh Xero access token.",
                null,
                state.TenantId ?? "");
        }

        var payload = JsonSerializer.Serialize(
            new
            {
                Payments = new[]
                {
                    new
                    {
                        Invoice = new { InvoiceID = request.InvoiceId },
                        Account = new { Code = request.AccountCode },
                        Date = request.Date,
                        Amount = request.Amount,
                        Reference = request.Reference,
                    },
                },
            },
            XeroWriteOptions);

        var client = _httpClientFactory.CreateClient();
        using var httpRequest = new HttpRequestMessage(HttpMethod.Put, "https://api.xero.com/api.xro/2.0/Payments");
        httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenResult.AccessToken);
        httpRequest.Headers.Add("xero-tenant-id", state.TenantId);
        httpRequest.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        httpRequest.Content = new StringContent(payload, Encoding.UTF8, "application/json");

        using var response = await client.SendAsync(httpRequest, ct);
        var responseBody = await response.Content.ReadAsStringAsync(ct);
        var parsedResponse = DeserializePayload(responseBody);

        if (!response.IsSuccessStatusCode)
        {
            return XeroPaymentCreateResult.Fail((int)response.StatusCode, responseBody, parsedResponse, state.TenantId ?? "");
        }

        return XeroPaymentCreateResult.Success(parsedResponse, state.TenantId ?? "");
    }

    private static object DeserializePayload(string payload)
    {
        if (string.IsNullOrWhiteSpace(payload))
            return new { raw = "" };

        try
        {
            return JsonSerializer.Deserialize<object>(payload, JsonOptions) ?? new { raw = payload };
        }
        catch (JsonException)
        {
            return new { raw = payload };
        }
    }
}

public sealed class CreateXeroPaymentRequest
{
    public Guid InvoiceId { get; init; }
    public string AccountCode { get; init; } = "";
    public DateOnly Date { get; init; }
    public decimal Amount { get; init; }
    public string? Reference { get; init; }
}

public sealed class XeroPaymentCreateResult
{
    public bool Ok { get; private init; }
    public int StatusCode { get; private init; }
    public string? Error { get; private init; }
    public object? Payload { get; private init; }
    public string TenantId { get; private init; } = "";

    public static XeroPaymentCreateResult Success(object? payload, string tenantId) =>
        new()
        {
            Ok = true,
            StatusCode = 201,
            Payload = payload,
            TenantId = tenantId,
        };

    public static XeroPaymentCreateResult Fail(int statusCode, string error, object? payload, string tenantId) =>
        new()
        {
            Ok = false,
            StatusCode = statusCode,
            Error = error,
            Payload = payload,
            TenantId = tenantId,
        };
}
