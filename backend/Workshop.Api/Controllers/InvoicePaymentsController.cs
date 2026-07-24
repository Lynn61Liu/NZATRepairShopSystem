using System.Globalization;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Services;
using Workshop.Api.Utils;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/invoice-payments")]
public class InvoicePaymentsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly EftposXeroBatchPaymentService _eftposXeroBatchPaymentService;
    private readonly JobInvoiceService _jobInvoiceService;

    public InvoicePaymentsController(
        AppDbContext db,
        EftposXeroBatchPaymentService eftposXeroBatchPaymentService,
        JobInvoiceService jobInvoiceService)
    {
        _db = db;
        _eftposXeroBatchPaymentService = eftposXeroBatchPaymentService;
        _jobInvoiceService = jobInvoiceService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken ct)
    {
        var rows = await QueryPayments()
            .OrderByDescending(row => row.PaymentDate)
            .ThenByDescending(row => row.CreatedAt)
            .ToListAsync(ct);

        return Ok(new
        {
            payments = rows.Select(MapPaymentRow),
            eftposBatches = BuildEftposBatchSummaries(rows),
        });
    }

    [HttpPut("{id:long}/payment-date")]
    public async Task<IActionResult> UpdatePaymentDate(long id, [FromBody] UpdatePaymentDateRequest? request, CancellationToken ct)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.PaymentDate))
        {
            return BadRequest(new { error = "Payment date is required." });
        }

        if (!DateOnly.TryParseExact(request.PaymentDate, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var paymentDate))
        {
            return BadRequest(new { error = "Payment date must use yyyy-MM-dd format." });
        }

        var payment = await _db.JobPayments.FirstOrDefaultAsync(row => row.Id == id, ct);
        if (payment is null)
        {
            return NotFound(new { error = "Invoice payment not found." });
        }

        payment.PaymentDate = paymentDate;
        payment.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);

        var row = await QueryPayments().FirstOrDefaultAsync(item => item.Id == id, ct);
        if (row is null)
        {
            return NotFound(new { error = "Invoice payment not found." });
        }

        return Ok(new
        {
            payment = MapPaymentRow(row),
        });
    }

    [HttpPost("{id:long}/refresh-xero")]
    public async Task<IActionResult> RefreshFromXero(long id, CancellationToken ct)
    {
        var target = await (
                from payment in _db.JobPayments.AsNoTracking()
                join invoice in _db.JobInvoices.AsNoTracking() on payment.JobInvoiceId equals invoice.Id
                where payment.Id == id
                select new
                {
                    invoice.JobId,
                    invoice.Provider,
                })
            .FirstOrDefaultAsync(ct);
        if (target is null)
            return NotFound(new { error = "Invoice payment not found." });
        if (!string.Equals(target.Provider, "xero", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { error = "Only Xero invoices can be refreshed." });

        var syncResult = await _jobInvoiceService.SyncFromXeroAsync(target.JobId, ct);
        if (!syncResult.Ok)
        {
            return StatusCode(syncResult.StatusCode, new
            {
                error = syncResult.Error ?? "Failed to refresh invoice from Xero.",
            });
        }

        var row = await QueryPayments().FirstOrDefaultAsync(payment => payment.Id == id, ct);
        if (row is null)
            return NotFound(new { error = "Invoice payment not found." });

        return Ok(new
        {
            payment = MapPaymentRow(row),
        });
    }

    [HttpPost("eftpos-xero-batch/preview")]
    public async Task<IActionResult> PreviewEftposXeroBatch([FromBody] EftposXeroBatchPaymentRequest? request, CancellationToken ct)
    {
        if (request is null)
            return BadRequest(new { error = "Request body is required." });

        var result = await _eftposXeroBatchPaymentService.PreviewAsync(request, ct);
        if (!result.Ok)
            return StatusCode(result.StatusCode, new { error = result.Error, result });

        return Ok(new { result });
    }

    [HttpPost("eftpos-xero-batch/post")]
    public async Task<IActionResult> PostEftposXeroBatch([FromBody] EftposXeroBatchPaymentRequest? request, CancellationToken ct)
    {
        if (request is null)
            return BadRequest(new { error = "Request body is required." });

        var result = await _eftposXeroBatchPaymentService.PostAsync(request, ct);
        if (!result.Ok)
            return StatusCode(result.StatusCode, new { error = result.Error, result });

        return Ok(new { result });
    }

    private IQueryable<InvoicePaymentQueryRow> QueryPayments()
        => from payment in _db.JobPayments.AsNoTracking()
           join invoice in _db.JobInvoices.AsNoTracking() on payment.JobInvoiceId equals invoice.Id
           join job in _db.Jobs.AsNoTracking() on payment.JobId equals job.Id
           select new InvoicePaymentQueryRow
           {
               Id = payment.Id,
               JobId = payment.JobId,
               JobInvoiceId = payment.JobInvoiceId,
               InvoiceNumber = invoice.ExternalInvoiceNumber ?? "",
               XeroInvoiceId = invoice.ExternalInvoiceId ?? "",
               Contact = invoice.ContactName ?? "",
               IssueDate = invoice.InvoiceDate,
               Reference = invoice.Reference ?? "",
               PaymentWay = payment.Method,
               Provider = payment.Provider,
               ExternalPaymentId = payment.ExternalPaymentId,
               AccountName = payment.AccountName,
               PaymentDate = payment.PaymentDate,
               Amount = payment.Amount,
               Note = payment.Reference ?? "",
               JobNote = job.Notes ?? "",
               ExternalStatus = payment.ExternalStatus ?? "",
               PaymentResponsePayloadJson = payment.ResponsePayloadJson,
               ResponsePayloadJson = invoice.ResponsePayloadJson,
               RequestPayloadJson = invoice.RequestPayloadJson,
               CreatedAt = payment.CreatedAt,
               UpdatedAt = payment.UpdatedAt,
           };

    private static object MapPaymentRow(InvoicePaymentQueryRow row)
        => new
        {
            id = row.Id.ToString(CultureInfo.InvariantCulture),
            jobId = row.JobId.ToString(CultureInfo.InvariantCulture),
            jobInvoiceId = row.JobInvoiceId.ToString(CultureInfo.InvariantCulture),
            row.InvoiceNumber,
            row.XeroInvoiceId,
            row.Contact,
            issueDate = row.IssueDate?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? "",
            row.Reference,
            row.PaymentWay,
            paymentDate = row.PaymentDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            paymentDateTime = FormatPaymentDateTime(row.PaymentDate, row.CreatedAt),
            xeroTotal = ExtractInvoiceTotal(FirstNonEmpty(row.ResponsePayloadJson, row.RequestPayloadJson)),
            row.Amount,
            paymentTotal = row.Amount,
            row.Note,
            row.JobNote,
            row.ExternalStatus,
            createdAt = DateTimeHelper.FormatNz(row.CreatedAt),
        };

    private static IReadOnlyList<object> BuildEftposBatchSummaries(IReadOnlyCollection<InvoicePaymentQueryRow> rows)
        => rows
            .Where(row => string.Equals(row.PaymentWay, "epost", StringComparison.OrdinalIgnoreCase))
            .Where(row => string.Equals(row.Provider, "xero", StringComparison.OrdinalIgnoreCase))
            .Select(row => new
            {
                Row = row,
                BatchPaymentId = ExtractBatchPaymentId(row.PaymentResponsePayloadJson) ?? row.ExternalPaymentId,
            })
            .Where(item => !string.IsNullOrWhiteSpace(item.BatchPaymentId))
            .GroupBy(item => new { item.Row.PaymentDate, item.BatchPaymentId })
            .Select(group => new
            {
                group.Key.PaymentDate,
                group.Key.BatchPaymentId,
                InvoiceNumbers = group.Select(item => item.Row.InvoiceNumber)
                    .Where(value => !string.IsNullOrWhiteSpace(value))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .OrderBy(value => value)
                    .ToArray(),
                BankAmount = group.Sum(item => item.Row.Amount),
                AccountName = group.Select(item => item.Row.AccountName)
                    .FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))?.Trim() ?? "",
                PostedAt = group.Max(item => item.Row.UpdatedAt),
            })
            .OrderByDescending(batch => batch.PaymentDate)
            .ThenByDescending(batch => batch.PostedAt)
            .Select(batch => (object)new
            {
                paymentDate = batch.PaymentDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                batchPaymentId = batch.BatchPaymentId,
                invoiceCount = batch.InvoiceNumbers.Length,
                invoiceNumbers = batch.InvoiceNumbers,
                bankAmount = batch.BankAmount,
                accountName = batch.AccountName,
                postedAt = DateTimeHelper.FormatNz(batch.PostedAt),
            })
            .ToList();

    private static string? ExtractBatchPaymentId(string? payloadJson)
    {
        if (string.IsNullOrWhiteSpace(payloadJson))
            return null;

        try
        {
            using var document = JsonDocument.Parse(payloadJson);
            if (!TryGetPropertyIgnoreCase(document.RootElement, "BatchPayments", out var batches)
                || batches.ValueKind != JsonValueKind.Array)
            {
                return null;
            }

            var batch = batches.EnumerateArray().FirstOrDefault();
            if (batch.ValueKind == JsonValueKind.Undefined
                || !TryGetPropertyIgnoreCase(batch, "BatchPaymentID", out var id))
            {
                return null;
            }

            return id.ValueKind == JsonValueKind.String ? id.GetString() : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static bool TryGetPropertyIgnoreCase(JsonElement element, string propertyName, out JsonElement value)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in element.EnumerateObject())
            {
                if (string.Equals(property.Name, propertyName, StringComparison.OrdinalIgnoreCase))
                {
                    value = property.Value;
                    return true;
                }
            }
        }

        value = default;
        return false;
    }

    private static string FormatPaymentDateTime(DateOnly paymentDate, DateTime createdAtUtc)
    {
        var createdAtNz = DateTimeHelper.ConvertUtcToNz(createdAtUtc);
        var displayValue = new DateTime(
            paymentDate.Year,
            paymentDate.Month,
            paymentDate.Day,
            createdAtNz.Hour,
            createdAtNz.Minute,
            createdAtNz.Second
        );

        return displayValue.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture);
    }

    private static decimal? ExtractInvoiceTotal(string? invoicePayloadJson)
    {
        if (string.IsNullOrWhiteSpace(invoicePayloadJson))
            return null;

        try
        {
            using var document = JsonDocument.Parse(invoicePayloadJson);
            if (!document.RootElement.TryGetProperty("Invoices", out var invoices) || invoices.ValueKind != JsonValueKind.Array)
                return null;

            var invoice = invoices.EnumerateArray().FirstOrDefault();
            if (invoice.ValueKind == JsonValueKind.Undefined)
                return null;

            if (!invoice.TryGetProperty("Total", out var total))
                return null;

            return total.TryGetDecimal(out var value) ? value : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string? FirstNonEmpty(params string?[] values)
        => values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));

    private sealed class InvoicePaymentQueryRow
    {
        public long Id { get; init; }
        public long JobId { get; init; }
        public long JobInvoiceId { get; init; }
        public string InvoiceNumber { get; init; } = "";
        public string XeroInvoiceId { get; init; } = "";
        public string Contact { get; init; } = "";
        public DateOnly? IssueDate { get; init; }
        public string Reference { get; init; } = "";
        public string PaymentWay { get; init; } = "";
        public string Provider { get; init; } = "";
        public string? ExternalPaymentId { get; init; }
        public string? AccountName { get; init; }
        public DateOnly PaymentDate { get; init; }
        public decimal Amount { get; init; }
        public string Note { get; init; } = "";
        public string JobNote { get; init; } = "";
        public string ExternalStatus { get; init; } = "";
        public string? PaymentResponsePayloadJson { get; init; }
        public string? ResponsePayloadJson { get; init; }
        public string? RequestPayloadJson { get; init; }
        public DateTime CreatedAt { get; init; }
        public DateTime UpdatedAt { get; init; }
    }

    public sealed class UpdatePaymentDateRequest
    {
        public string PaymentDate { get; init; } = "";
    }
}
