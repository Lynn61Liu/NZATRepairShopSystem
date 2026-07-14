using System.Diagnostics;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Workshop.Api.DTOs;

namespace Workshop.Api.Services;

public sealed class XeroInvoiceService
{
    private const int InvoiceIdsBatchSize = 20;

    private static readonly JsonSerializerOptions XeroWriteOptions = new()
    {
        PropertyNamingPolicy = null,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly XeroTokenConfiguration _configuration;
    private readonly XeroTokenService _xeroTokenService;
    private readonly ILogger<XeroInvoiceService> _logger;

    public XeroInvoiceService(
        IHttpClientFactory httpClientFactory,
        XeroTokenConfiguration configuration,
        XeroTokenService xeroTokenService,
        ILogger<XeroInvoiceService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _xeroTokenService = xeroTokenService;
        _logger = logger;
    }

    public async Task<XeroInvoiceCreateResult> CreateInvoiceAsync(
        CreateXeroInvoiceRequest request,
        XeroInvoiceCreateOptions? options,
        CancellationToken ct)
    {
        var totalStopwatch = Stopwatch.StartNew();
        var missing = new List<string>();
        if (string.IsNullOrWhiteSpace(_configuration.ClientId)) missing.Add("Xero:ClientId");
        if (string.IsNullOrWhiteSpace(_configuration.ClientSecret)) missing.Add("Xero:ClientSecret");
        if (missing.Count > 0)
        {
            totalStopwatch.Stop();
            _logger.LogInformation(
                "Xero invoice create completed in {ElapsedMs} ms (ok: {Ok}, statusCode: {StatusCode}, reason: {Reason})",
                totalStopwatch.Elapsed.TotalMilliseconds,
                false,
                400,
                "missing_configuration");
            return XeroInvoiceCreateResult.Fail(
                400,
                "Missing Xero configuration for invoice create.",
                new { missing },
                "");
        }

        var tokenRefreshStopwatch = Stopwatch.StartNew();
        var tokenResult = await _xeroTokenService.RefreshAccessTokenAsync(ct);
        tokenRefreshStopwatch.Stop();
        _logger.LogInformation(
            "Xero invoice segment {Segment} completed in {ElapsedMs} ms",
            "refresh_access_token",
            tokenRefreshStopwatch.Elapsed.TotalMilliseconds);
        if (!tokenResult.Ok)
        {
            totalStopwatch.Stop();
            _logger.LogInformation(
                "Xero invoice create completed in {ElapsedMs} ms (ok: {Ok}, statusCode: {StatusCode}, reason: {Reason})",
                totalStopwatch.Elapsed.TotalMilliseconds,
                false,
                tokenResult.StatusCode,
                "refresh_access_token_failed");
            return XeroInvoiceCreateResult.Fail(
                tokenResult.StatusCode,
                tokenResult.Error ?? "Failed to refresh Xero access token.",
                null,
                tokenResult.TenantId);
        }

        if (string.IsNullOrWhiteSpace(tokenResult.TenantId))
        {
            totalStopwatch.Stop();
            _logger.LogInformation(
                "Xero invoice create completed in {ElapsedMs} ms (ok: {Ok}, statusCode: {StatusCode}, reason: {Reason})",
                totalStopwatch.Elapsed.TotalMilliseconds,
                false,
                400,
                "missing_tenant_id");
            return XeroInvoiceCreateResult.Fail(
                400,
                "Missing Xero tenant id for invoice create.",
                new { missing = new[] { "Xero:TenantId" } },
                "");
        }

        var requestUri = BuildRequestUri(options?.SummarizeErrors, options?.UnitDp);
        var httpMethod = request.InvoiceId.HasValue ? HttpMethod.Post : HttpMethod.Put;
        var payload = JsonSerializer.Serialize(MapRequest(request), XeroWriteOptions);

        var client = _httpClientFactory.CreateClient();
        using var httpRequest = new HttpRequestMessage(httpMethod, requestUri);
        httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenResult.AccessToken);
        httpRequest.Headers.Add("xero-tenant-id", tokenResult.TenantId);
        httpRequest.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        if (!string.IsNullOrWhiteSpace(options?.IdempotencyKey))
            httpRequest.Headers.Add("Idempotency-Key", options.IdempotencyKey);
        httpRequest.Content = new StringContent(payload, Encoding.UTF8, "application/json");

        var apiCallStopwatch = Stopwatch.StartNew();
        using var response = await client.SendAsync(httpRequest, ct);
        apiCallStopwatch.Stop();
        _logger.LogInformation(
            "Xero invoice segment {Segment} completed in {ElapsedMs} ms with status {StatusCode}",
            "send_invoice_request",
            apiCallStopwatch.Elapsed.TotalMilliseconds,
            (int)response.StatusCode);
        var responseBody = await response.Content.ReadAsStringAsync(ct);
        var parsedResponse = DeserializePayload(responseBody);

        if (!response.IsSuccessStatusCode)
        {
            totalStopwatch.Stop();
            _logger.LogInformation(
                "Xero invoice create completed in {ElapsedMs} ms (ok: {Ok}, statusCode: {StatusCode}, reason: {Reason})",
                totalStopwatch.Elapsed.TotalMilliseconds,
                false,
                (int)response.StatusCode,
                "xero_api_error");
            return XeroInvoiceCreateResult.Fail(
                (int)response.StatusCode,
                SummarizeXeroError(parsedResponse) ?? responseBody,
                parsedResponse,
                tokenResult.TenantId,
                tokenResult.RefreshToken,
                tokenResult.RefreshTokenUpdated,
                tokenResult.Scope,
                tokenResult.ExpiresIn);
        }

        totalStopwatch.Stop();
        _logger.LogInformation(
            "Xero invoice create completed in {ElapsedMs} ms (ok: {Ok}, statusCode: {StatusCode}, reason: {Reason})",
            totalStopwatch.Elapsed.TotalMilliseconds,
            true,
            (int)response.StatusCode,
            "success");
        return XeroInvoiceCreateResult.Success(
            parsedResponse,
            tokenResult.TenantId,
            tokenResult.RefreshToken,
            tokenResult.RefreshTokenUpdated,
            tokenResult.Scope,
            tokenResult.ExpiresIn);
    }

    public async Task<XeroInvoiceCreateResult> UpdateInvoiceStatusAsync(
        Guid invoiceId,
        string targetStatus,
        DateOnly? dueDate,
        CancellationToken ct)
    {
        var missing = new List<string>();
        if (string.IsNullOrWhiteSpace(_configuration.ClientId)) missing.Add("Xero:ClientId");
        if (string.IsNullOrWhiteSpace(_configuration.ClientSecret)) missing.Add("Xero:ClientSecret");
        if (missing.Count > 0)
        {
            return XeroInvoiceCreateResult.Fail(
                400,
                "Missing Xero configuration for invoice status update.",
                new { missing },
                "");
        }

        var tokenResult = await _xeroTokenService.RefreshAccessTokenAsync(ct);
        if (!tokenResult.Ok)
        {
            return XeroInvoiceCreateResult.Fail(
                tokenResult.StatusCode,
                tokenResult.Error ?? "Failed to refresh Xero access token.",
                null,
                tokenResult.TenantId);
        }

        if (string.IsNullOrWhiteSpace(tokenResult.TenantId))
        {
            return XeroInvoiceCreateResult.Fail(
                400,
                "Missing Xero tenant id for invoice status update.",
                new { missing = new[] { "Xero:TenantId" } },
                "");
        }

        var requestUri = BuildRequestUri(summarizeErrors: true, unitdp: null);
        var payload = JsonSerializer.Serialize(
            new XeroInvoiceStatusUpdateEnvelope
            {
                Invoices =
                [
                    new XeroInvoiceStatusUpdate
                    {
                        InvoiceID = invoiceId,
                        Status = targetStatus,
                        DueDate = dueDate,
                    },
                ],
            },
            XeroWriteOptions);

        var client = _httpClientFactory.CreateClient();
        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, requestUri);
        httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenResult.AccessToken);
        httpRequest.Headers.Add("xero-tenant-id", tokenResult.TenantId);
        httpRequest.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        httpRequest.Content = new StringContent(payload, Encoding.UTF8, "application/json");

        using var response = await client.SendAsync(httpRequest, ct);
        var responseBody = await response.Content.ReadAsStringAsync(ct);
        var parsedResponse = DeserializePayload(responseBody);

        if (!response.IsSuccessStatusCode)
        {
            return XeroInvoiceCreateResult.Fail(
                (int)response.StatusCode,
                SummarizeXeroError(parsedResponse) ?? responseBody,
                parsedResponse,
                tokenResult.TenantId,
                tokenResult.RefreshToken,
                tokenResult.RefreshTokenUpdated,
                tokenResult.Scope,
                tokenResult.ExpiresIn);
        }

        return XeroInvoiceCreateResult.Success(
            parsedResponse,
            tokenResult.TenantId,
            tokenResult.RefreshToken,
            tokenResult.RefreshTokenUpdated,
            tokenResult.Scope,
            tokenResult.ExpiresIn);
    }

    public async Task<XeroInvoiceCreateResult> UpdateInvoiceReferenceAsync(
        Guid invoiceId,
        string reference,
        CancellationToken ct)
    {
        var tokenResult = await _xeroTokenService.RefreshAccessTokenAsync(ct);
        if (!tokenResult.Ok)
            return XeroInvoiceCreateResult.Fail(tokenResult.StatusCode, tokenResult.Error ?? "Failed to refresh Xero access token.", null, tokenResult.TenantId);
        if (string.IsNullOrWhiteSpace(tokenResult.TenantId))
            return XeroInvoiceCreateResult.Fail(400, "Missing Xero tenant id for invoice reference update.", null, "");

        var payload = JsonSerializer.Serialize(new
        {
            Invoices = new[] { new { InvoiceID = invoiceId, Reference = reference.Trim() } },
        }, XeroWriteOptions);
        var client = _httpClientFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, $"https://api.xero.com/api.xro/2.0/Invoices/{invoiceId}?summarizeErrors=true");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenResult.AccessToken);
        request.Headers.Add("xero-tenant-id", tokenResult.TenantId);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        request.Content = new StringContent(payload, Encoding.UTF8, "application/json");

        using var response = await client.SendAsync(request, ct);
        var responseBody = await response.Content.ReadAsStringAsync(ct);
        var parsed = DeserializePayload(responseBody);
        return response.IsSuccessStatusCode
            ? XeroInvoiceCreateResult.Success(parsed, tokenResult.TenantId, tokenResult.RefreshToken, tokenResult.RefreshTokenUpdated, tokenResult.Scope, tokenResult.ExpiresIn)
            : XeroInvoiceCreateResult.Fail((int)response.StatusCode, SummarizeXeroError(parsed) ?? responseBody, parsed, tokenResult.TenantId, tokenResult.RefreshToken, tokenResult.RefreshTokenUpdated, tokenResult.Scope, tokenResult.ExpiresIn);
    }

    public async Task<XeroInvoiceCreateResult> EmailInvoiceAsync(Guid invoiceId, CancellationToken ct)
    {
        var tokenResult = await _xeroTokenService.RefreshAccessTokenAsync(ct);
        if (!tokenResult.Ok)
            return XeroInvoiceCreateResult.Fail(tokenResult.StatusCode, tokenResult.Error ?? "Failed to refresh Xero access token.", null, tokenResult.TenantId);
        if (string.IsNullOrWhiteSpace(tokenResult.TenantId))
            return XeroInvoiceCreateResult.Fail(400, "Missing Xero tenant id for invoice email.", null, "");

        var client = _httpClientFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{BuildRequestUri(null, null)}/{invoiceId}/Email");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenResult.AccessToken);
        request.Headers.Add("xero-tenant-id", tokenResult.TenantId);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        request.Content = new StringContent("", Encoding.UTF8, "application/json");

        using var response = await client.SendAsync(request, ct);
        var responseBody = await response.Content.ReadAsStringAsync(ct);
        var parsed = DeserializePayload(responseBody);
        return response.IsSuccessStatusCode
            ? XeroInvoiceCreateResult.Success(parsed, tokenResult.TenantId, tokenResult.RefreshToken, tokenResult.RefreshTokenUpdated, tokenResult.Scope, tokenResult.ExpiresIn)
            : XeroInvoiceCreateResult.Fail((int)response.StatusCode, SummarizeXeroError(parsed) ?? responseBody, parsed, tokenResult.TenantId, tokenResult.RefreshToken, tokenResult.RefreshTokenUpdated, tokenResult.Scope, tokenResult.ExpiresIn);
    }

    public async Task<XeroInvoiceGetResult> GetInvoiceByIdAsync(Guid invoiceId, CancellationToken ct)
    {
        var missing = new List<string>();
        if (string.IsNullOrWhiteSpace(_configuration.ClientId)) missing.Add("Xero:ClientId");
        if (string.IsNullOrWhiteSpace(_configuration.ClientSecret)) missing.Add("Xero:ClientSecret");
        if (missing.Count > 0)
        {
            return XeroInvoiceGetResult.Fail(
                400,
                "Missing Xero configuration for invoice read.",
                new { missing },
                "");
        }

        var tokenResult = await _xeroTokenService.RefreshAccessTokenAsync(ct);
        if (!tokenResult.Ok)
        {
            return XeroInvoiceGetResult.Fail(
                tokenResult.StatusCode,
                tokenResult.Error ?? "Failed to refresh Xero access token.",
                null,
                tokenResult.TenantId);
        }

        if (string.IsNullOrWhiteSpace(tokenResult.TenantId))
        {
            return XeroInvoiceGetResult.Fail(
                400,
                "Missing Xero tenant id for invoice read.",
                new { missing = new[] { "Xero:TenantId" } },
                "");
        }

        var client = _httpClientFactory.CreateClient();
        using var httpRequest = new HttpRequestMessage(HttpMethod.Get, $"https://api.xero.com/api.xro/2.0/Invoices/{invoiceId}");
        httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenResult.AccessToken);
        httpRequest.Headers.Add("xero-tenant-id", tokenResult.TenantId);
        httpRequest.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        using var response = await client.SendAsync(httpRequest, ct);
        var responseBody = await response.Content.ReadAsStringAsync(ct);
        var parsedResponse = DeserializePayload(responseBody);

        if (!response.IsSuccessStatusCode)
        {
            return XeroInvoiceGetResult.Fail(
                (int)response.StatusCode,
                responseBody,
                parsedResponse,
                tokenResult.TenantId);
        }

        return XeroInvoiceGetResult.Success(parsedResponse, tokenResult.TenantId);
    }

    public async Task<XeroInvoiceGetResult> GetInvoicesByIdsAsync(IReadOnlyCollection<Guid> invoiceIds, CancellationToken ct)
    {
        var distinctInvoiceIds = invoiceIds.Distinct().ToArray();
        if (distinctInvoiceIds.Length == 0)
            return XeroInvoiceGetResult.Success(new { Invoices = Array.Empty<object>() }, "");

        var missing = new List<string>();
        if (string.IsNullOrWhiteSpace(_configuration.ClientId)) missing.Add("Xero:ClientId");
        if (string.IsNullOrWhiteSpace(_configuration.ClientSecret)) missing.Add("Xero:ClientSecret");
        if (missing.Count > 0)
        {
            return XeroInvoiceGetResult.Fail(
                400,
                "Missing Xero configuration for invoice read.",
                new { missing },
                "");
        }

        var tokenResult = await _xeroTokenService.RefreshAccessTokenAsync(ct);
        if (!tokenResult.Ok)
        {
            return XeroInvoiceGetResult.Fail(
                tokenResult.StatusCode,
                tokenResult.Error ?? "Failed to refresh Xero access token.",
                null,
                tokenResult.TenantId);
        }

        if (string.IsNullOrWhiteSpace(tokenResult.TenantId))
        {
            return XeroInvoiceGetResult.Fail(
                400,
                "Missing Xero tenant id for invoice read.",
                new { missing = new[] { "Xero:TenantId" } },
                "");
        }

        var client = _httpClientFactory.CreateClient();
        var mergedInvoices = new List<JsonElement>();
        var batchIndex = 0;

        foreach (var invoiceIdBatch in distinctInvoiceIds.Chunk(InvoiceIdsBatchSize))
        {
            batchIndex++;
            var batch = invoiceIdBatch.ToArray();
            var ids = string.Join(",", batch.Select(x => Uri.EscapeDataString(x.ToString())));
            var requestUri = $"https://api.xero.com/api.xro/2.0/Invoices?IDs={ids}";
            using var httpRequest = new HttpRequestMessage(HttpMethod.Get, requestUri);
            httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenResult.AccessToken);
            httpRequest.Headers.Add("xero-tenant-id", tokenResult.TenantId);
            httpRequest.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            _logger.LogInformation(
                "Xero invoice read batch started. BatchIndex={BatchIndex}, BatchSize={BatchSize}, TotalInvoiceIds={TotalInvoiceIds}",
                batchIndex,
                batch.Length,
                distinctInvoiceIds.Length);

            using var response = await client.SendAsync(httpRequest, ct);
            var responseBody = await response.Content.ReadAsStringAsync(ct);
            var parsedResponse = DeserializePayload(responseBody);

            _logger.LogInformation(
                "Xero invoice read batch completed. BatchIndex={BatchIndex}, BatchSize={BatchSize}, StatusCode={StatusCode}",
                batchIndex,
                batch.Length,
                (int)response.StatusCode);

            if (!response.IsSuccessStatusCode)
            {
                return XeroInvoiceGetResult.Fail(
                    (int)response.StatusCode,
                    responseBody,
                    parsedResponse,
                    tokenResult.TenantId);
            }

            mergedInvoices.AddRange(ExtractInvoices(responseBody));
        }

        _logger.LogInformation(
            "Xero invoice read completed. RequestedInvoiceIds={RequestedInvoiceIds}, ReturnedInvoices={ReturnedInvoices}",
            distinctInvoiceIds.Length,
            mergedInvoices.Count);

        return XeroInvoiceGetResult.Success(
            new Dictionary<string, object> { ["Invoices"] = mergedInvoices },
            tokenResult.TenantId);
    }

    public async Task<XeroInvoicePdfResult> GetInvoicePdfByIdAsync(Guid invoiceId, CancellationToken ct)
    {
        var missing = new List<string>();
        if (string.IsNullOrWhiteSpace(_configuration.ClientId)) missing.Add("Xero:ClientId");
        if (string.IsNullOrWhiteSpace(_configuration.ClientSecret)) missing.Add("Xero:ClientSecret");
        if (missing.Count > 0)
        {
            return XeroInvoicePdfResult.Fail(
                400,
                "Missing Xero configuration for invoice PDF read.",
                new { missing },
                "");
        }

        var tokenResult = await _xeroTokenService.RefreshAccessTokenAsync(ct);
        if (!tokenResult.Ok)
        {
            return XeroInvoicePdfResult.Fail(
                tokenResult.StatusCode,
                tokenResult.Error ?? "Failed to refresh Xero access token.",
                null,
                tokenResult.TenantId);
        }

        if (string.IsNullOrWhiteSpace(tokenResult.TenantId))
        {
            return XeroInvoicePdfResult.Fail(
                400,
                "Missing Xero tenant id for invoice PDF read.",
                new { missing = new[] { "Xero:TenantId" } },
                "");
        }

        var client = _httpClientFactory.CreateClient();
        using var httpRequest = new HttpRequestMessage(HttpMethod.Get, $"https://api.xero.com/api.xro/2.0/Invoices/{invoiceId}");
        httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenResult.AccessToken);
        httpRequest.Headers.Add("xero-tenant-id", tokenResult.TenantId);
        httpRequest.Headers.Accept.Clear();
        httpRequest.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/pdf"));

        using var response = await client.SendAsync(httpRequest, ct);
        var responseBytes = await response.Content.ReadAsByteArrayAsync(ct);
        if (!response.IsSuccessStatusCode)
        {
            var responseBody = responseBytes.Length == 0 ? "" : Encoding.UTF8.GetString(responseBytes);
            return XeroInvoicePdfResult.Fail((int)response.StatusCode, responseBody, null, tokenResult.TenantId);
        }

        if (responseBytes.Length == 0)
        {
            return XeroInvoicePdfResult.Fail(502, "Xero returned an empty PDF response.", null, tokenResult.TenantId);
        }

        return XeroInvoicePdfResult.Success(responseBytes, tokenResult.TenantId);
    }

    public async Task<XeroInvoiceGetResult> GetInvoicesByNumberAsync(string invoiceNumber, CancellationToken ct)
    {
        var normalizedInvoiceNumber = invoiceNumber?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedInvoiceNumber))
        {
            return XeroInvoiceGetResult.Fail(400, "Invoice number is required.", null, "");
        }

        var missing = new List<string>();
        if (string.IsNullOrWhiteSpace(_configuration.ClientId)) missing.Add("Xero:ClientId");
        if (string.IsNullOrWhiteSpace(_configuration.ClientSecret)) missing.Add("Xero:ClientSecret");
        if (missing.Count > 0)
        {
            return XeroInvoiceGetResult.Fail(
                400,
                "Missing Xero configuration for invoice lookup.",
                new { missing },
                "");
        }

        var tokenResult = await _xeroTokenService.RefreshAccessTokenAsync(ct);
        if (!tokenResult.Ok)
        {
            return XeroInvoiceGetResult.Fail(
                tokenResult.StatusCode,
                tokenResult.Error ?? "Failed to refresh Xero access token.",
                null,
                tokenResult.TenantId);
        }

        if (string.IsNullOrWhiteSpace(tokenResult.TenantId))
        {
            return XeroInvoiceGetResult.Fail(
                400,
                "Missing Xero tenant id for invoice lookup.",
                new { missing = new[] { "Xero:TenantId" } },
                "");
        }

        var client = _httpClientFactory.CreateClient();
        var requestUri = $"https://api.xero.com/api.xro/2.0/Invoices?InvoiceNumbers={Uri.EscapeDataString(normalizedInvoiceNumber)}";
        using var httpRequest = new HttpRequestMessage(HttpMethod.Get, requestUri);
        httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenResult.AccessToken);
        httpRequest.Headers.Add("xero-tenant-id", tokenResult.TenantId);
        httpRequest.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        using var response = await client.SendAsync(httpRequest, ct);
        var responseBody = await response.Content.ReadAsStringAsync(ct);
        var parsedResponse = DeserializePayload(responseBody);

        if (!response.IsSuccessStatusCode)
        {
            return XeroInvoiceGetResult.Fail(
                (int)response.StatusCode,
                responseBody,
                parsedResponse,
                tokenResult.TenantId);
        }

        return XeroInvoiceGetResult.Success(parsedResponse, tokenResult.TenantId);
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

    private static string? SummarizeXeroError(object? payload)
    {
        try
        {
            using var document = payload switch
            {
                null => null,
                JsonElement element => JsonDocument.Parse(element.GetRawText()),
                string raw when !string.IsNullOrWhiteSpace(raw) => JsonDocument.Parse(raw),
                _ => JsonDocument.Parse(JsonSerializer.Serialize(payload, JsonOptions)),
            };
            if (document is null)
                return null;

            var messages = new List<string>();
            CollectValidationMessages(document.RootElement, messages);
            if (messages.Count > 0)
                return string.Join(" ", messages.Distinct(StringComparer.OrdinalIgnoreCase));

            if (document.RootElement.TryGetProperty("Message", out var messageProp) &&
                messageProp.ValueKind == JsonValueKind.String)
            {
                return messageProp.GetString();
            }
        }
        catch (JsonException)
        {
            return null;
        }

        return null;
    }

    private static void CollectValidationMessages(JsonElement element, List<string> messages)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                foreach (var property in element.EnumerateObject())
                {
                    if (property.NameEquals("ValidationErrors") && property.Value.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var error in property.Value.EnumerateArray())
                        {
                            if (error.TryGetProperty("Message", out var messageProp) &&
                                messageProp.ValueKind == JsonValueKind.String &&
                                !string.IsNullOrWhiteSpace(messageProp.GetString()))
                            {
                                messages.Add(messageProp.GetString()!.Trim());
                            }
                        }
                    }
                    else
                    {
                        CollectValidationMessages(property.Value, messages);
                    }
                }

                break;
            case JsonValueKind.Array:
                foreach (var item in element.EnumerateArray())
                    CollectValidationMessages(item, messages);
                break;
        }
    }

    private static List<JsonElement> ExtractInvoices(string payload)
    {
        if (string.IsNullOrWhiteSpace(payload))
            return [];

        try
        {
            using var document = JsonDocument.Parse(payload);
            if (!document.RootElement.TryGetProperty("Invoices", out var invoices) || invoices.ValueKind != JsonValueKind.Array)
                return [];

            return invoices
                .EnumerateArray()
                .Select(invoice => invoice.Clone())
                .ToList();
        }
        catch (JsonException)
        {
            return [];
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
                        .Select(MapLineItem)
                        .ToList(),
                },
            ],
        };
    }

    private static XeroLineItem MapLineItem(XeroInvoiceLineItemInput item)
    {
        var itemCode = TrimOrNull(item.ItemCode);
        if (!string.IsNullOrWhiteSpace(itemCode))
        {
            return new XeroLineItem
            {
                ItemCode = itemCode,
                Description = TrimOrNull(item.Description),
                Quantity = item.Quantity ?? 1m,
                UnitAmount = item.UnitAmount,
                LineAmount = item.LineAmount,
                AccountCode = TrimOrNull(item.AccountCode),
                TaxType = TrimOrNull(item.TaxType),
                TaxAmount = item.TaxAmount,
                DiscountRate = item.DiscountRate,
                DiscountAmount = item.DiscountAmount,
            };
        }

        return new XeroLineItem
        {
            Description = TrimOrNull(item.Description),
            Quantity = item.Quantity,
            UnitAmount = item.UnitAmount,
            LineAmount = item.LineAmount,
            AccountCode = TrimOrNull(item.AccountCode),
            TaxType = TrimOrNull(item.TaxType),
            TaxAmount = item.TaxAmount,
            DiscountRate = item.DiscountRate,
            DiscountAmount = item.DiscountAmount,
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

    private sealed class XeroInvoiceStatusUpdateEnvelope
    {
        [JsonPropertyName("Invoices")]
        public List<XeroInvoiceStatusUpdate> Invoices { get; set; } = [];
    }

    private sealed class XeroInvoiceStatusUpdate
    {
        [JsonPropertyName("InvoiceID")]
        public Guid InvoiceID { get; set; }

        [JsonPropertyName("Status")]
        public string Status { get; set; } = "";

        [JsonPropertyName("DueDate")]
        public DateOnly? DueDate { get; set; }
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
        public string? Description { get; set; }

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

public sealed class XeroInvoiceGetResult
{
    public bool Ok { get; private init; }
    public int StatusCode { get; private init; }
    public string? Error { get; private init; }
    public object? Payload { get; private init; }
    public string TenantId { get; private init; } = "";

    public static XeroInvoiceGetResult Success(object? payload, string tenantId) =>
        new()
        {
            Ok = true,
            StatusCode = 200,
            Payload = payload,
            TenantId = tenantId,
        };

    public static XeroInvoiceGetResult Fail(int statusCode, string error, object? payload, string tenantId) =>
        new()
        {
            Ok = false,
            StatusCode = statusCode,
            Error = error,
            Payload = payload,
            TenantId = tenantId,
        };
}

public sealed class XeroInvoicePdfResult
{
    public bool Ok { get; private init; }
    public int StatusCode { get; private init; }
    public string? Error { get; private init; }
    public byte[]? PdfBytes { get; private init; }
    public object? Payload { get; private init; }
    public string TenantId { get; private init; } = "";

    public static XeroInvoicePdfResult Success(byte[] pdfBytes, string tenantId) =>
        new()
        {
            Ok = true,
            StatusCode = 200,
            PdfBytes = pdfBytes,
            TenantId = tenantId,
        };

    public static XeroInvoicePdfResult Fail(int statusCode, string error, object? payload, string tenantId) =>
        new()
        {
            Ok = false,
            StatusCode = statusCode,
            Error = error,
            Payload = payload,
            TenantId = tenantId,
        };
}
