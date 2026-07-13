using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Workshop.Api.Data;
using Workshop.Api.Models;
using Workshop.Api.Options;

namespace Workshop.Api.Services;

public sealed class EftposXeroBatchPaymentService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly AppDbContext _db;
    private readonly XeroInvoiceService _xeroInvoiceService;
    private readonly XeroPaymentService _xeroPaymentService;
    private readonly XeroPaymentOptions _xeroPaymentOptions;

    public EftposXeroBatchPaymentService(
        AppDbContext db,
        XeroInvoiceService xeroInvoiceService,
        XeroPaymentService xeroPaymentService,
        IOptions<XeroPaymentOptions> xeroPaymentOptions)
    {
        _db = db;
        _xeroInvoiceService = xeroInvoiceService;
        _xeroPaymentService = xeroPaymentService;
        _xeroPaymentOptions = xeroPaymentOptions.Value;
    }

    public async Task<EftposXeroBatchPaymentResult> PreviewAsync(EftposXeroBatchPaymentRequest request, CancellationToken ct)
        => await PrepareAsync(request, ct);

    public async Task<EftposXeroBatchPaymentResult> PostAsync(EftposXeroBatchPaymentRequest request, CancellationToken ct)
    {
        var prepared = await PrepareAsync(request, ct);
        if (!prepared.Ok)
            return prepared;

        var account = prepared.Account;
        if (account is null)
            return EftposXeroBatchPaymentResult.Fail(400, "Xero EFTPOS bank account could not be resolved.", prepared);

        var invoices = prepared.Invoices;
        if (invoices.Count == 0)
            return EftposXeroBatchPaymentResult.Fail(400, "No invoices are ready for batch payment.", prepared);

        var paymentDate = DateOnly.ParseExact(prepared.PaymentDate, "yyyy-MM-dd", CultureInfo.InvariantCulture);
        var reference = FirstNonEmpty(request.Reference, $"Paymark EFTPOS {prepared.PaymentDate} ${prepared.BankAmount:0.00}")!;
        var createRequest = new CreateXeroBatchPaymentRequest(
            new XeroBatchPaymentAccount(account.AccountId, account.Code, account.Name, account.BankAccountNumber),
            paymentDate,
            reference,
            Particulars: null,
            Code: null,
            invoices.Select(invoice => new CreateXeroBatchPaymentLine(invoice.InvoiceId, invoice.AmountDue)).ToList());

        var createResult = await _xeroPaymentService.CreateBatchPaymentAsync(createRequest, idempotencyKey: null, ct);
        if (!createResult.Ok)
        {
            return EftposXeroBatchPaymentResult.Fail(
                createResult.StatusCode,
                createResult.Error ?? "Failed to create Xero EFTPOS batch payment.",
                prepared with
                {
                    XeroPayload = createResult.Payload,
                });
        }

        var responseJson = JsonSerializer.Serialize(createResult.Payload, JsonOptions);
        var batchSummary = ExtractBatchPaymentSummary(responseJson);
        var paymentByInvoiceId = batchSummary.Payments.ToDictionary(x => x.InvoiceId, x => x);
        var now = DateTime.UtcNow;

        foreach (var localRow in prepared.LocalRows)
        {
            var invoice = invoices.FirstOrDefault(x =>
                string.Equals(x.InvoiceNumber, localRow.Invoice.ExternalInvoiceNumber, StringComparison.OrdinalIgnoreCase));
            if (invoice is null)
                continue;

            paymentByInvoiceId.TryGetValue(invoice.InvoiceId, out var xeroPayment);

            localRow.Payment.Provider = "xero";
            localRow.Payment.ExternalPaymentId = xeroPayment?.PaymentId?.ToString() ?? batchSummary.BatchPaymentId?.ToString();
            localRow.Payment.ExternalInvoiceId = invoice.InvoiceId.ToString();
            localRow.Payment.Method = "epost";
            localRow.Payment.Amount = invoice.AmountDue;
            localRow.Payment.PaymentDate = paymentDate;
            localRow.Payment.Reference = reference;
            localRow.Payment.AccountCode = account.Code;
            localRow.Payment.AccountName = account.Name;
            localRow.Payment.ExternalStatus = "AUTHORISED";
            localRow.Payment.RequestPayloadJson = createResult.RequestPayloadJson;
            localRow.Payment.ResponsePayloadJson = responseJson;
            localRow.Payment.UpdatedAt = now;

            localRow.Invoice.ExternalStatus = "PAID";
            localRow.Invoice.UpdatedAt = now;
        }

        await _db.SaveChangesAsync(ct);

        return prepared with
        {
            Posted = true,
            Message = $"Xero batch payment created for {invoices.Count} invoice(s).",
            BatchPaymentId = batchSummary.BatchPaymentId?.ToString(),
            XeroPayload = createResult.Payload,
        };
    }

    private async Task<EftposXeroBatchPaymentResult> PrepareAsync(EftposXeroBatchPaymentRequest request, CancellationToken ct)
    {
        if (request is null)
            return EftposXeroBatchPaymentResult.Fail(400, "Request body is required.");

        if (!DateOnly.TryParseExact(request.PaymentDate, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var paymentDate))
            return EftposXeroBatchPaymentResult.Fail(400, "Payment date must use yyyy-MM-dd format.");

        var bankAmount = RoundMoney(request.BankAmount);
        if (bankAmount <= 0)
            return EftposXeroBatchPaymentResult.Fail(400, "POS bank amount must be greater than zero.");

        var invoiceNumbers = request.InvoiceNumbers
            .Select(x => x.Trim())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(x => x, StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (invoiceNumbers.Count == 0)
            return EftposXeroBatchPaymentResult.Fail(400, "At least one invoice number is required.");

        var localRows = await LoadLocalRowsAsync(invoiceNumbers, paymentDate, ct);
        var localValidation = ValidateLocalRows(invoiceNumbers, paymentDate, bankAmount, localRows);
        if (!localValidation.Ok)
            return EftposXeroBatchPaymentResult.Fail(localValidation.StatusCode, localValidation.Error);

        var accountResult = await ResolveEftposAccountAsync(ct);
        if (!accountResult.Ok || accountResult.Account is null)
            return EftposXeroBatchPaymentResult.Fail(accountResult.StatusCode, accountResult.Error);

        var remoteInvoices = new List<EftposXeroInvoiceSummary>();
        foreach (var invoiceNumber in invoiceNumbers)
        {
            var remoteResult = await LoadRemoteInvoiceAsync(invoiceNumber, ct);
            if (!remoteResult.Ok || remoteResult.Invoice is null)
                return EftposXeroBatchPaymentResult.Fail(remoteResult.StatusCode, remoteResult.Error);

            remoteInvoices.Add(remoteResult.Invoice);
        }

        var remoteValidation = ValidateRemoteInvoices(remoteInvoices, bankAmount);
        if (!remoteValidation.Ok)
            return EftposXeroBatchPaymentResult.Fail(remoteValidation.StatusCode, remoteValidation.Error);

        return new EftposXeroBatchPaymentResult
        {
            Ok = true,
            StatusCode = 200,
            PaymentDate = paymentDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            BankAmount = bankAmount,
            LocalEftposTotal = RoundMoney(localRows.Sum(x => x.Payment.Amount)),
            XeroAmountDueTotal = RoundMoney(remoteInvoices.Sum(x => x.AmountDue)),
            Account = accountResult.Account,
            Invoices = remoteInvoices,
            LocalRows = localRows,
            Message = "Xero invoices checked. Ready to create EFTPOS batch payment.",
        };
    }

    private async Task<List<LocalEftposInvoicePaymentRow>> LoadLocalRowsAsync(
        IReadOnlyCollection<string> invoiceNumbers,
        DateOnly paymentDate,
        CancellationToken ct)
    {
        var normalizedInvoiceNumbers = invoiceNumbers.Select(x => x.ToUpperInvariant()).ToArray();
        return await (
                from payment in _db.JobPayments
                join invoice in _db.JobInvoices on payment.JobInvoiceId equals invoice.Id
                where invoice.ExternalInvoiceNumber != null
                      && normalizedInvoiceNumbers.Contains(invoice.ExternalInvoiceNumber.ToUpper())
                      && payment.PaymentDate == paymentDate
                      && payment.Method == "epost"
                select new LocalEftposInvoicePaymentRow(payment, invoice)
            )
            .ToListAsync(ct);
    }

    private static BatchValidationResult ValidateLocalRows(
        IReadOnlyCollection<string> invoiceNumbers,
        DateOnly paymentDate,
        decimal bankAmount,
        IReadOnlyCollection<LocalEftposInvoicePaymentRow> localRows)
    {
        var missing = invoiceNumbers
            .Where(invoiceNumber => localRows.All(row =>
                !string.Equals(row.Invoice.ExternalInvoiceNumber, invoiceNumber, StringComparison.OrdinalIgnoreCase)))
            .ToList();
        if (missing.Count > 0)
        {
            return BatchValidationResult.Fail(
                400,
                $"These invoice numbers were not found as local EFTPOS payments on {paymentDate:yyyy-MM-dd}: {string.Join(", ", missing)}.");
        }

        var duplicates = localRows
            .GroupBy(row => row.Invoice.ExternalInvoiceNumber ?? "", StringComparer.OrdinalIgnoreCase)
            .Where(group => group.Count() > 1)
            .Select(group => group.Key)
            .ToList();
        if (duplicates.Count > 0)
            return BatchValidationResult.Fail(409, $"Duplicate local invoice payment rows found: {string.Join(", ", duplicates)}.");

        var alreadyPosted = localRows
            .Where(row =>
                string.Equals(row.Payment.Provider, "xero", StringComparison.OrdinalIgnoreCase)
                && (!string.IsNullOrWhiteSpace(row.Payment.ExternalPaymentId)
                    || (row.Payment.ResponsePayloadJson?.Contains("BatchPaymentID", StringComparison.OrdinalIgnoreCase) ?? false)))
            .Select(row => row.Invoice.ExternalInvoiceNumber ?? row.Payment.JobInvoiceId.ToString(CultureInfo.InvariantCulture))
            .ToList();
        if (alreadyPosted.Count > 0)
            return BatchValidationResult.Fail(409, $"These invoices already have Xero payment records locally: {string.Join(", ", alreadyPosted)}.");

        var localTotal = RoundMoney(localRows.Sum(row => row.Payment.Amount));
        if (localTotal != bankAmount)
            return BatchValidationResult.Fail(400, $"Local EFTPOS total ${localTotal:0.00} does not match POS bank amount ${bankAmount:0.00}.");

        return BatchValidationResult.Success();
    }

    private async Task<AccountResolveResult> ResolveEftposAccountAsync(CancellationToken ct)
    {
        var configuredAccountId = FirstNonEmpty(_xeroPaymentOptions.EpostAccountId);
        var configuredCode = FirstNonEmpty(_xeroPaymentOptions.EpostAccountCode, _xeroPaymentOptions.DefaultAccountCode);
        var configuredName = FirstNonEmpty(_xeroPaymentOptions.EpostAccountName, "Business Premium Call Account")!;
        var configuredBankNumber = FirstNonEmpty(_xeroPaymentOptions.EpostBankAccountNumber, "01-0221-0944312-01")!;

        if (Guid.TryParse(configuredAccountId, out var accountId))
        {
            return AccountResolveResult.Success(new EftposXeroBankAccountSummary(
                accountId,
                configuredCode ?? "",
                configuredName,
                configuredBankNumber));
        }

        var lookup = await _xeroPaymentService.GetBankAccountsAsync(ct);
        if (!lookup.Ok)
        {
            if (!string.IsNullOrWhiteSpace(configuredCode))
            {
                return AccountResolveResult.Success(new EftposXeroBankAccountSummary(
                    null,
                    configuredCode,
                    configuredName,
                    configuredBankNumber));
            }

            return AccountResolveResult.Fail(
                lookup.StatusCode,
                "Unable to look up Xero bank accounts. Reconnect Xero with accounting.settings/accounting.transactions scopes, or configure XeroPayments:EpostAccountId.");
        }

        var normalizedTargetNumber = XeroPaymentService.NormalizeBankAccountNumber(configuredBankNumber);
        var matched = lookup.Accounts.FirstOrDefault(account =>
                !string.IsNullOrWhiteSpace(normalizedTargetNumber)
                && XeroPaymentService.NormalizeBankAccountNumber(account.BankAccountNumber) == normalizedTargetNumber)
            ?? lookup.Accounts.FirstOrDefault(account =>
                !string.IsNullOrWhiteSpace(configuredName)
                && string.Equals(account.Name.Trim(), configuredName.Trim(), StringComparison.OrdinalIgnoreCase))
            ?? lookup.Accounts.FirstOrDefault(account =>
                !string.IsNullOrWhiteSpace(configuredCode)
                && string.Equals(account.Code.Trim(), configuredCode.Trim(), StringComparison.OrdinalIgnoreCase));

        if (matched is null)
        {
            return AccountResolveResult.Fail(
                404,
                $"Xero bank account was not found for {configuredName} / {configuredBankNumber}. Configure XeroPayments:EpostAccountId if the account name differs in Xero.");
        }

        return AccountResolveResult.Success(new EftposXeroBankAccountSummary(
            matched.AccountId,
            matched.Code,
            matched.Name,
            matched.BankAccountNumber));
    }

    private async Task<RemoteInvoiceResult> LoadRemoteInvoiceAsync(string invoiceNumber, CancellationToken ct)
    {
        var result = await _xeroInvoiceService.GetInvoicesByNumberAsync(invoiceNumber, ct);
        if (!result.Ok)
            return RemoteInvoiceResult.Fail(result.StatusCode, result.Error ?? $"Failed to load Xero invoice {invoiceNumber}.");

        var invoices = ExtractInvoices(result.Payload)
            .Where(invoice => string.Equals(invoice.InvoiceNumber, invoiceNumber, StringComparison.OrdinalIgnoreCase))
            .ToList();
        if (invoices.Count == 0)
            return RemoteInvoiceResult.Fail(404, $"Xero invoice {invoiceNumber} was not found.");
        if (invoices.Count > 1)
            return RemoteInvoiceResult.Fail(409, $"More than one Xero invoice matched {invoiceNumber}.");

        return RemoteInvoiceResult.Success(invoices[0]);
    }

    private static BatchValidationResult ValidateRemoteInvoices(
        IReadOnlyCollection<EftposXeroInvoiceSummary> invoices,
        decimal bankAmount)
    {
        var invalidType = invoices
            .Where(invoice => !string.Equals(invoice.Type, "ACCREC", StringComparison.OrdinalIgnoreCase))
            .Select(invoice => invoice.InvoiceNumber)
            .ToList();
        if (invalidType.Count > 0)
            return BatchValidationResult.Fail(400, $"These Xero documents are not sales invoices: {string.Join(", ", invalidType)}.");

        var notAwaitingPayment = invoices
            .Where(invoice =>
                !string.Equals(invoice.Status, "AUTHORISED", StringComparison.OrdinalIgnoreCase)
                || invoice.AmountDue <= 0)
            .Select(invoice => $"{invoice.InvoiceNumber} ({invoice.Status}, due ${invoice.AmountDue:0.00})")
            .ToList();
        if (notAwaitingPayment.Count > 0)
            return BatchValidationResult.Fail(409, $"These Xero invoices are not awaiting payment: {string.Join(", ", notAwaitingPayment)}.");

        var remoteTotal = RoundMoney(invoices.Sum(invoice => invoice.AmountDue));
        if (remoteTotal != bankAmount)
            return BatchValidationResult.Fail(400, $"Xero Amount Due total ${remoteTotal:0.00} does not match POS bank amount ${bankAmount:0.00}.");

        return BatchValidationResult.Success();
    }

    private static IReadOnlyList<EftposXeroInvoiceSummary> ExtractInvoices(object? payload)
    {
        if (payload is null)
            return [];

        var json = JsonSerializer.Serialize(payload, JsonOptions);
        if (string.IsNullOrWhiteSpace(json))
            return [];

        try
        {
            using var document = JsonDocument.Parse(json);
            if (!document.RootElement.TryGetProperty("Invoices", out var invoices) || invoices.ValueKind != JsonValueKind.Array)
                return [];

            return invoices
                .EnumerateArray()
                .Select(invoice => new EftposXeroInvoiceSummary
                {
                    InvoiceId = TryGetGuid(invoice, "InvoiceID") ?? Guid.Empty,
                    InvoiceNumber = TryGetString(invoice, "InvoiceNumber") ?? "",
                    Status = TryGetString(invoice, "Status") ?? "",
                    Type = TryGetString(invoice, "Type") ?? "",
                    ContactName = invoice.TryGetProperty("Contact", out var contact) && contact.ValueKind == JsonValueKind.Object
                        ? TryGetString(contact, "Name") ?? ""
                        : "",
                    CurrencyCode = TryGetString(invoice, "CurrencyCode") ?? "",
                    Total = TryGetDecimal(invoice, "Total"),
                    AmountDue = TryGetDecimal(invoice, "AmountDue"),
                })
                .Where(invoice => invoice.InvoiceId != Guid.Empty && !string.IsNullOrWhiteSpace(invoice.InvoiceNumber))
                .ToList();
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static EftposXeroBatchSummary ExtractBatchPaymentSummary(string responseJson)
    {
        if (string.IsNullOrWhiteSpace(responseJson))
            return new EftposXeroBatchSummary();

        try
        {
            using var document = JsonDocument.Parse(responseJson);
            if (!document.RootElement.TryGetProperty("BatchPayments", out var batchPayments)
                || batchPayments.ValueKind != JsonValueKind.Array)
            {
                return new EftposXeroBatchSummary();
            }

            var batch = batchPayments.EnumerateArray().FirstOrDefault();
            if (batch.ValueKind == JsonValueKind.Undefined)
                return new EftposXeroBatchSummary();

            var payments = new List<EftposXeroBatchPaymentLineSummary>();
            if (batch.TryGetProperty("Payments", out var paymentElements) && paymentElements.ValueKind == JsonValueKind.Array)
            {
                foreach (var payment in paymentElements.EnumerateArray())
                {
                    if (!payment.TryGetProperty("Invoice", out var invoice) || invoice.ValueKind != JsonValueKind.Object)
                        continue;
                    var invoiceId = TryGetGuid(invoice, "InvoiceID");
                    if (!invoiceId.HasValue)
                        continue;

                    payments.Add(new EftposXeroBatchPaymentLineSummary(
                        invoiceId.Value,
                        TryGetGuid(payment, "PaymentID"),
                        TryGetDecimal(payment, "Amount")));
                }
            }

            return new EftposXeroBatchSummary(
                TryGetGuid(batch, "BatchPaymentID"),
                TryGetDecimal(batch, "TotalAmount"),
                payments);
        }
        catch (JsonException)
        {
            return new EftposXeroBatchSummary();
        }
    }

    private static decimal RoundMoney(decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);

    private static string? FirstNonEmpty(params string?[] values)
        => values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))?.Trim();

    private static string? TryGetString(JsonElement element, string propertyName)
        => element.TryGetProperty(propertyName, out var property) && property.ValueKind == JsonValueKind.String
            ? property.GetString()
            : null;

    private static Guid? TryGetGuid(JsonElement element, string propertyName)
        => Guid.TryParse(TryGetString(element, propertyName), out var value) ? value : null;

    private static decimal TryGetDecimal(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property))
            return 0m;
        if (property.ValueKind == JsonValueKind.Number && property.TryGetDecimal(out var value))
            return RoundMoney(value);
        if (property.ValueKind == JsonValueKind.String && decimal.TryParse(property.GetString(), NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed))
            return RoundMoney(parsed);
        return 0m;
    }
}

public sealed class EftposXeroBatchPaymentRequest
{
    public string PaymentDate { get; init; } = "";
    public decimal BankAmount { get; init; }
    public List<string> InvoiceNumbers { get; init; } = [];
    public string? Reference { get; init; }
}

public sealed record LocalEftposInvoicePaymentRow(JobPayment Payment, JobInvoice Invoice);

public sealed record EftposXeroBatchPaymentResult
{
    public bool Ok { get; init; }
    public int StatusCode { get; init; }
    public string? Error { get; init; }
    public string Message { get; init; } = "";
    public bool Posted { get; init; }
    public string PaymentDate { get; init; } = "";
    public decimal BankAmount { get; init; }
    public decimal LocalEftposTotal { get; init; }
    public decimal XeroAmountDueTotal { get; init; }
    public string? BatchPaymentId { get; init; }
    public EftposXeroBankAccountSummary? Account { get; init; }
    public IReadOnlyList<EftposXeroInvoiceSummary> Invoices { get; init; } = [];
    public object? XeroPayload { get; init; }

    internal IReadOnlyList<LocalEftposInvoicePaymentRow> LocalRows { get; init; } = [];

    public static EftposXeroBatchPaymentResult Fail(int statusCode, string? error, EftposXeroBatchPaymentResult? details = null) =>
        (details ?? new EftposXeroBatchPaymentResult()) with
        {
            Ok = false,
            StatusCode = statusCode,
            Error = error ?? "EFTPOS Xero batch payment failed.",
        };
}

public sealed class EftposXeroInvoiceSummary
{
    public Guid InvoiceId { get; init; }
    public string InvoiceNumber { get; init; } = "";
    public string Status { get; init; } = "";
    public string Type { get; init; } = "";
    public string ContactName { get; init; } = "";
    public string CurrencyCode { get; init; } = "";
    public decimal Total { get; init; }
    public decimal AmountDue { get; init; }
}

public sealed record EftposXeroBankAccountSummary(
    Guid? AccountId,
    string Code,
    string Name,
    string BankAccountNumber);

internal sealed record BatchValidationResult(bool Ok, int StatusCode, string Error)
{
    public static BatchValidationResult Success() => new(true, 200, "");
    public static BatchValidationResult Fail(int statusCode, string error) => new(false, statusCode, error);
}

internal sealed record AccountResolveResult(bool Ok, int StatusCode, string Error, EftposXeroBankAccountSummary? Account)
{
    public static AccountResolveResult Success(EftposXeroBankAccountSummary account) => new(true, 200, "", account);
    public static AccountResolveResult Fail(int statusCode, string error) => new(false, statusCode, error, null);
}

internal sealed record RemoteInvoiceResult(bool Ok, int StatusCode, string Error, EftposXeroInvoiceSummary? Invoice)
{
    public static RemoteInvoiceResult Success(EftposXeroInvoiceSummary invoice) => new(true, 200, "", invoice);
    public static RemoteInvoiceResult Fail(int statusCode, string error) => new(false, statusCode, error, null);
}

internal sealed record EftposXeroBatchSummary(
    Guid? BatchPaymentId = null,
    decimal TotalAmount = 0m,
    IReadOnlyList<EftposXeroBatchPaymentLineSummary>? PaymentLines = null)
{
    public IReadOnlyList<EftposXeroBatchPaymentLineSummary> Payments => PaymentLines ?? [];
}

internal sealed record EftposXeroBatchPaymentLineSummary(
    Guid InvoiceId,
    Guid? PaymentId,
    decimal Amount);
