using System.Globalization;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Utils;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/invoice-payments")]
public class InvoicePaymentsController : ControllerBase
{
    private readonly AppDbContext _db;

    public InvoicePaymentsController(AppDbContext db)
    {
        _db = db;
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
               PaymentDate = payment.PaymentDate,
               Amount = payment.Amount,
               Note = payment.Reference ?? "",
               JobNote = job.Notes ?? "",
               ExternalStatus = payment.ExternalStatus ?? "",
               ResponsePayloadJson = invoice.ResponsePayloadJson,
               RequestPayloadJson = invoice.RequestPayloadJson,
               CreatedAt = payment.CreatedAt,
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
        public DateOnly PaymentDate { get; init; }
        public decimal Amount { get; init; }
        public string Note { get; init; } = "";
        public string JobNote { get; init; } = "";
        public string ExternalStatus { get; init; } = "";
        public string? ResponsePayloadJson { get; init; }
        public string? RequestPayloadJson { get; init; }
        public DateTime CreatedAt { get; init; }
    }

    public sealed class UpdatePaymentDateRequest
    {
        public string PaymentDate { get; init; } = "";
    }
}
