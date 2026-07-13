using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
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

    public async Task<XeroBankAccountLookupResult> GetBankAccountsAsync(CancellationToken ct)
    {
        var state = await _xeroTokenStore.GetEffectiveAsync(ct);
        var missing = new List<string>();
        if (string.IsNullOrWhiteSpace(_configuration.ClientId)) missing.Add("Xero:ClientId");
        if (string.IsNullOrWhiteSpace(_configuration.ClientSecret)) missing.Add("Xero:ClientSecret");
        if (string.IsNullOrWhiteSpace(state.RefreshToken)) missing.Add("Xero:RefreshToken");
        if (string.IsNullOrWhiteSpace(state.TenantId)) missing.Add("Xero:TenantId");
        if (missing.Count > 0)
        {
            return XeroBankAccountLookupResult.Fail(400, "Missing Xero configuration for account lookup.", new { missing }, state.TenantId ?? "");
        }

        var tokenResult = await _xeroTokenService.RefreshAccessTokenAsync(ct);
        if (!tokenResult.Ok)
        {
            return XeroBankAccountLookupResult.Fail(
                tokenResult.StatusCode,
                tokenResult.Error ?? "Failed to refresh Xero access token.",
                null,
                state.TenantId ?? "");
        }

        var client = _httpClientFactory.CreateClient();
        using var httpRequest = new HttpRequestMessage(HttpMethod.Get, "https://api.xero.com/api.xro/2.0/Accounts?where=Type==%22BANK%22");
        httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenResult.AccessToken);
        httpRequest.Headers.Add("xero-tenant-id", state.TenantId);
        httpRequest.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        using var response = await client.SendAsync(httpRequest, ct);
        var responseBody = await response.Content.ReadAsStringAsync(ct);
        var parsedResponse = DeserializePayload(responseBody);

        if (!response.IsSuccessStatusCode)
        {
            return XeroBankAccountLookupResult.Fail(
                (int)response.StatusCode,
                responseBody,
                parsedResponse,
                state.TenantId ?? "");
        }

        return XeroBankAccountLookupResult.Success(ExtractBankAccounts(responseBody), parsedResponse, state.TenantId ?? "");
    }

    public async Task<XeroBatchPaymentCreateResult> CreateBatchPaymentAsync(
        CreateXeroBatchPaymentRequest request,
        string? idempotencyKey,
        CancellationToken ct)
    {
        var state = await _xeroTokenStore.GetEffectiveAsync(ct);
        var missing = new List<string>();
        if (string.IsNullOrWhiteSpace(_configuration.ClientId)) missing.Add("Xero:ClientId");
        if (string.IsNullOrWhiteSpace(_configuration.ClientSecret)) missing.Add("Xero:ClientSecret");
        if (string.IsNullOrWhiteSpace(state.RefreshToken)) missing.Add("Xero:RefreshToken");
        if (string.IsNullOrWhiteSpace(state.TenantId)) missing.Add("Xero:TenantId");
        if (missing.Count > 0)
        {
            return XeroBatchPaymentCreateResult.Fail(400, "Missing Xero configuration for batch payment create.", new { missing }, state.TenantId ?? "");
        }

        var tokenResult = await _xeroTokenService.RefreshAccessTokenAsync(ct);
        if (!tokenResult.Ok)
        {
            return XeroBatchPaymentCreateResult.Fail(
                tokenResult.StatusCode,
                tokenResult.Error ?? "Failed to refresh Xero access token.",
                null,
                state.TenantId ?? "");
        }

        var accountRef = BuildAccountReference(request.BankAccount);
        var payloadObject = new
        {
            BatchPayments = new[]
            {
                new
                {
                    Account = accountRef,
                    request.Reference,
                    request.Date,
                    Payments = request.Payments.Select(payment => new
                    {
                        Account = accountRef,
                        request.Date,
                        payment.Amount,
                        Invoice = new { InvoiceID = payment.InvoiceId },
                    }).ToArray(),
                },
            },
        };
        var payload = JsonSerializer.Serialize(payloadObject, XeroWriteOptions);

        var client = _httpClientFactory.CreateClient();
        using var httpRequest = new HttpRequestMessage(HttpMethod.Put, "https://api.xero.com/api.xro/2.0/BatchPayments?summarizeErrors=true");
        httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenResult.AccessToken);
        httpRequest.Headers.Add("xero-tenant-id", state.TenantId);
        httpRequest.Headers.Add("Idempotency-Key", FirstNonEmpty(idempotencyKey, BuildBatchIdempotencyKey(payload)));
        httpRequest.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        httpRequest.Content = new StringContent(payload, Encoding.UTF8, "application/json");

        using var response = await client.SendAsync(httpRequest, ct);
        var responseBody = await response.Content.ReadAsStringAsync(ct);
        var parsedResponse = DeserializePayload(responseBody);

        if (!response.IsSuccessStatusCode)
        {
            return XeroBatchPaymentCreateResult.Fail((int)response.StatusCode, responseBody, parsedResponse, state.TenantId ?? "", payload);
        }

        return XeroBatchPaymentCreateResult.Success(parsedResponse, state.TenantId ?? "", payload);
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

    private static object BuildAccountReference(XeroBatchPaymentAccount account)
    {
        if (account.AccountId.HasValue)
            return new { AccountID = account.AccountId.Value };
        return new { Code = account.Code };
    }

    private static IReadOnlyList<XeroBankAccountSummary> ExtractBankAccounts(string payload)
    {
        if (string.IsNullOrWhiteSpace(payload))
            return [];

        try
        {
            using var document = JsonDocument.Parse(payload);
            if (!document.RootElement.TryGetProperty("Accounts", out var accounts) || accounts.ValueKind != JsonValueKind.Array)
                return [];

            return accounts
                .EnumerateArray()
                .Select(account => new XeroBankAccountSummary(
                    TryGetGuid(account, "AccountID"),
                    TryGetString(account, "Code") ?? "",
                    TryGetString(account, "Name") ?? "",
                    TryGetString(account, "BankAccountNumber") ?? ""))
                .Where(account => account.AccountId.HasValue || !string.IsNullOrWhiteSpace(account.Code))
                .ToList();
        }
        catch (JsonException)
        {
            return [];
        }
    }

    public static string NormalizeBankAccountNumber(string? value)
        => string.IsNullOrWhiteSpace(value)
            ? ""
            : Regex.Replace(value.Trim(), "[^0-9]", "");

    private static string BuildBatchIdempotencyKey(string payload)
    {
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(payload))).ToLowerInvariant();
        return $"eftpos-batch-v2-{hash[..24]}";
    }

    private static string FirstNonEmpty(params string?[] values)
        => values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))?.Trim() ?? "";

    private static string? TryGetString(JsonElement element, string propertyName)
        => element.TryGetProperty(propertyName, out var property) && property.ValueKind == JsonValueKind.String
            ? property.GetString()
            : null;

    private static Guid? TryGetGuid(JsonElement element, string propertyName)
        => Guid.TryParse(TryGetString(element, propertyName), out var value) ? value : null;
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

public sealed record XeroBankAccountSummary(
    Guid? AccountId,
    string Code,
    string Name,
    string BankAccountNumber);

public sealed record XeroBatchPaymentAccount(
    Guid? AccountId,
    string Code,
    string Name,
    string BankAccountNumber);

public sealed record CreateXeroBatchPaymentRequest(
    XeroBatchPaymentAccount BankAccount,
    DateOnly Date,
    string Reference,
    string? Particulars,
    string? Code,
    IReadOnlyList<CreateXeroBatchPaymentLine> Payments);

public sealed record CreateXeroBatchPaymentLine(
    Guid InvoiceId,
    decimal Amount);

public sealed class XeroBankAccountLookupResult
{
    public bool Ok { get; private init; }
    public int StatusCode { get; private init; }
    public string? Error { get; private init; }
    public IReadOnlyList<XeroBankAccountSummary> Accounts { get; private init; } = [];
    public object? Payload { get; private init; }
    public string TenantId { get; private init; } = "";

    public static XeroBankAccountLookupResult Success(IReadOnlyList<XeroBankAccountSummary> accounts, object? payload, string tenantId) =>
        new()
        {
            Ok = true,
            StatusCode = 200,
            Accounts = accounts,
            Payload = payload,
            TenantId = tenantId,
        };

    public static XeroBankAccountLookupResult Fail(int statusCode, string error, object? payload, string tenantId) =>
        new()
        {
            Ok = false,
            StatusCode = statusCode,
            Error = error,
            Payload = payload,
            TenantId = tenantId,
        };
}

public sealed class XeroBatchPaymentCreateResult
{
    public bool Ok { get; private init; }
    public int StatusCode { get; private init; }
    public string? Error { get; private init; }
    public object? Payload { get; private init; }
    public string TenantId { get; private init; } = "";
    public string RequestPayloadJson { get; private init; } = "";

    public static XeroBatchPaymentCreateResult Success(object? payload, string tenantId, string requestPayloadJson) =>
        new()
        {
            Ok = true,
            StatusCode = 200,
            Payload = payload,
            TenantId = tenantId,
            RequestPayloadJson = requestPayloadJson,
        };

    public static XeroBatchPaymentCreateResult Fail(int statusCode, string error, object? payload, string tenantId, string requestPayloadJson = "") =>
        new()
        {
            Ok = false,
            StatusCode = statusCode,
            Error = error,
            Payload = payload,
            TenantId = tenantId,
            RequestPayloadJson = requestPayloadJson,
        };
}
