using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Workshop.Api.DTOs;

namespace Workshop.Api.Services;

public sealed class XeroInvoiceService
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

    public XeroInvoiceService(
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

    public async Task<XeroInvoiceCreateResult> CreateInvoiceAsync(
        CreateXeroInvoiceRequest request,
        XeroInvoiceCreateOptions? options,
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
            return XeroInvoiceCreateResult.Fail(
                400,
                "Missing Xero configuration for invoice create.",
                new { missing },
                state.TenantId ?? "");
        }

        var tokenResult = await _xeroTokenService.RefreshAccessTokenAsync(ct);
        if (!tokenResult.Ok)
        {
            return XeroInvoiceCreateResult.Fail(
                tokenResult.StatusCode,
                tokenResult.Error ?? "Failed to refresh Xero access token.",
                null,
                state.TenantId ?? "");
        }

        var requestUri = BuildRequestUri(options?.SummarizeErrors, options?.UnitDp);
        var payload = JsonSerializer.Serialize(MapRequest(request), XeroWriteOptions);

        var client = _httpClientFactory.CreateClient();
        using var httpRequest = new HttpRequestMessage(HttpMethod.Put, requestUri);
        httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenResult.AccessToken);
        httpRequest.Headers.Add("xero-tenant-id", state.TenantId);
        httpRequest.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        if (!string.IsNullOrWhiteSpace(options?.IdempotencyKey))
            httpRequest.Headers.Add("Idempotency-Key", options.IdempotencyKey);
        httpRequest.Content = new StringContent(payload, Encoding.UTF8, "application/json");

        using var response = await client.SendAsync(httpRequest, ct);
        var responseBody = await response.Content.ReadAsStringAsync(ct);
        var parsedResponse = DeserializePayload(responseBody);

        if (!response.IsSuccessStatusCode)
        {
            return XeroInvoiceCreateResult.Fail(
                (int)response.StatusCode,
                responseBody,
                parsedResponse,
                state.TenantId ?? "",
                tokenResult.RefreshToken,
                tokenResult.RefreshTokenUpdated,
                tokenResult.Scope,
                tokenResult.ExpiresIn);
        }

        return XeroInvoiceCreateResult.Success(
            parsedResponse,
            state.TenantId ?? "",
            tokenResult.RefreshToken,
            tokenResult.RefreshTokenUpdated,
            tokenResult.Scope,
            tokenResult.ExpiresIn);
    }

    private static string BuildRequestUri(bool? summarizeErrors, int? unitdp)
    {
        var query = new List<string>();
        if (summarizeErrors.HasValue)
            query.Add($"summarizeErrors={summarizeErrors.Value.ToString().ToLowerInvariant()}");
        if (unitdp.HasValue)
            query.Add($"unitdp={unitdp.Value}");

        var suffix = query.Count == 0 ? "" : "?" + string.Join("&", query);
        return $"https://api.xero.com/api.xro/2.0/Invoices{suffix}";
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

    private static XeroInvoicesEnvelope MapRequest(CreateXeroInvoiceRequest request)
    {
        return new XeroInvoicesEnvelope
        {
            Invoices =
            [
                new XeroInvoice
                {
                    InvoiceID = request.InvoiceId,
                    Type = request.Type,
                    Status = request.Status,
                    LineAmountTypes = request.LineAmountTypes,
                    Date = request.Date,
                    DueDate = request.DueDate,
                    ExpectedPaymentDate = request.ExpectedPaymentDate,
                    PlannedPaymentDate = request.PlannedPaymentDate,
                    InvoiceNumber = request.InvoiceNumber,
                    Reference = request.Reference,
                    BrandingThemeID = request.BrandingThemeId,
                    CurrencyCode = request.CurrencyCode,
                    CurrencyRate = request.CurrencyRate,
                    SentToContact = request.SentToContact,
                    Url = request.Url,
                    Contact = new XeroContact
                    {
                        ContactID = request.Contact.ContactId,
                        Name = TrimOrNull(request.Contact.Name),
                        EmailAddress = TrimOrNull(request.Contact.EmailAddress),
                        ContactNumber = TrimOrNull(request.Contact.ContactNumber),
                    },
                    LineItems = request.LineItems
                        .Select(item => new XeroLineItem
                        {
                            Description = item.Description.Trim(),
                            Quantity = item.Quantity,
                            UnitAmount = item.UnitAmount,
                            LineAmount = item.LineAmount,
                            ItemCode = TrimOrNull(item.ItemCode),
                            AccountCode = TrimOrNull(item.AccountCode),
                            TaxType = TrimOrNull(item.TaxType),
                            TaxAmount = item.TaxAmount,
                            DiscountRate = item.DiscountRate,
                            DiscountAmount = item.DiscountAmount,
                        })
                        .ToList(),
                },
            ],
        };
    }

    private static string? TrimOrNull(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }

    private sealed class XeroInvoicesEnvelope
    {
        [JsonPropertyName("Invoices")]
        public List<XeroInvoice> Invoices { get; set; } = [];
    }

    private sealed class XeroInvoice
    {
        [JsonPropertyName("InvoiceID")]
        public Guid? InvoiceID { get; set; }

        [JsonPropertyName("Type")]
        public string Type { get; set; } = "ACCREC";

        [JsonPropertyName("Status")]
        public string Status { get; set; } = "DRAFT";

        [JsonPropertyName("LineAmountTypes")]
        public string LineAmountTypes { get; set; } = "Exclusive";

        [JsonPropertyName("Date")]
        public DateOnly? Date { get; set; }

        [JsonPropertyName("DueDate")]
        public DateOnly? DueDate { get; set; }

        [JsonPropertyName("ExpectedPaymentDate")]
        public DateOnly? ExpectedPaymentDate { get; set; }

        [JsonPropertyName("PlannedPaymentDate")]
        public DateOnly? PlannedPaymentDate { get; set; }

        [JsonPropertyName("InvoiceNumber")]
        public string? InvoiceNumber { get; set; }

        [JsonPropertyName("Reference")]
        public string? Reference { get; set; }

        [JsonPropertyName("BrandingThemeID")]
        public Guid? BrandingThemeID { get; set; }

        [JsonPropertyName("CurrencyCode")]
        public string? CurrencyCode { get; set; }

        [JsonPropertyName("CurrencyRate")]
        public decimal? CurrencyRate { get; set; }

        [JsonPropertyName("SentToContact")]
        public bool? SentToContact { get; set; }

        [JsonPropertyName("Url")]
        public string? Url { get; set; }

        [JsonPropertyName("Contact")]
        public XeroContact Contact { get; set; } = new();

        [JsonPropertyName("LineItems")]
        public List<XeroLineItem> LineItems { get; set; } = [];
    }

    private sealed class XeroContact
    {
        [JsonPropertyName("ContactID")]
        public Guid? ContactID { get; set; }

        [JsonPropertyName("Name")]
        public string? Name { get; set; }

        [JsonPropertyName("EmailAddress")]
        public string? EmailAddress { get; set; }

        [JsonPropertyName("ContactNumber")]
        public string? ContactNumber { get; set; }
    }

    private sealed class XeroLineItem
    {
        [JsonPropertyName("Description")]
        public string Description { get; set; } = "";

        [JsonPropertyName("Quantity")]
        public decimal? Quantity { get; set; }

        [JsonPropertyName("UnitAmount")]
        public decimal? UnitAmount { get; set; }

        [JsonPropertyName("LineAmount")]
        public decimal? LineAmount { get; set; }

        [JsonPropertyName("ItemCode")]
        public string? ItemCode { get; set; }

        [JsonPropertyName("AccountCode")]
        public string? AccountCode { get; set; }

        [JsonPropertyName("TaxType")]
        public string? TaxType { get; set; }

        [JsonPropertyName("TaxAmount")]
        public decimal? TaxAmount { get; set; }

        [JsonPropertyName("DiscountRate")]
        public decimal? DiscountRate { get; set; }

        [JsonPropertyName("DiscountAmount")]
        public decimal? DiscountAmount { get; set; }
    }
}

public sealed class XeroInvoiceCreateOptions
{
    public bool? SummarizeErrors { get; init; }
    public int? UnitDp { get; init; }
    public string? IdempotencyKey { get; init; }
}

public sealed class XeroInvoiceCreateResult
{
    public bool Ok { get; private init; }
    public int StatusCode { get; private init; }
    public string? Error { get; private init; }
    public object? Payload { get; private init; }
    public string TenantId { get; private init; } = "";
    public string RefreshToken { get; private init; } = "";
    public bool RefreshTokenUpdated { get; private init; }
    public string Scope { get; private init; } = "";
    public int ExpiresIn { get; private init; }

    public static XeroInvoiceCreateResult Success(
        object? payload,
        string tenantId,
        string refreshToken,
        bool refreshTokenUpdated,
        string scope,
        int expiresIn) =>
        new()
        {
            Ok = true,
            StatusCode = 200,
            Payload = payload,
            TenantId = tenantId,
            RefreshToken = refreshToken,
            RefreshTokenUpdated = refreshTokenUpdated,
            Scope = scope,
            ExpiresIn = expiresIn,
        };

    public static XeroInvoiceCreateResult Fail(
        int statusCode,
        string error,
        object? payload,
        string tenantId,
        string refreshToken = "",
        bool refreshTokenUpdated = false,
        string scope = "",
        int expiresIn = 0) =>
        new()
        {
            Ok = false,
            StatusCode = statusCode,
            Error = error,
            Payload = payload,
            TenantId = tenantId,
            RefreshToken = refreshToken,
            RefreshTokenUpdated = refreshTokenUpdated,
            Scope = scope,
            ExpiresIn = expiresIn,
        };
}
