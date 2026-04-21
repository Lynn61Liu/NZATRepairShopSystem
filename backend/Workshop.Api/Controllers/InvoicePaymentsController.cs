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
        var rows = await (
                from payment in _db.JobPayments.AsNoTracking()
                join invoice in _db.JobInvoices.AsNoTracking() on payment.JobInvoiceId equals invoice.Id
                join job in _db.Jobs.AsNoTracking() on payment.JobId equals job.Id
                orderby payment.PaymentDate descending, payment.CreatedAt descending
                select new
                {
                    id = payment.Id.ToString(CultureInfo.InvariantCulture),
                    jobId = payment.JobId.ToString(CultureInfo.InvariantCulture),
                    jobInvoiceId = payment.JobInvoiceId.ToString(CultureInfo.InvariantCulture),
                    invoiceNumber = invoice.ExternalInvoiceNumber ?? "",
                    xeroInvoiceId = invoice.ExternalInvoiceId ?? "",
                    contact = invoice.ContactName ?? "",
                    issueDate = invoice.InvoiceDate,
                    reference = invoice.Reference ?? "",
                    paymentWay = payment.Method,
                    paymentDate = payment.PaymentDate,
                    paymentDateTime = payment.CreatedAt,
                    amount = payment.Amount,
                    note = payment.Reference ?? "",
                    jobNote = job.Notes ?? "",
                    externalStatus = payment.ExternalStatus ?? "",
                    responsePayloadJson = invoice.ResponsePayloadJson,
                    requestPayloadJson = invoice.RequestPayloadJson,
                    createdAt = payment.CreatedAt,
                }
            )
            .ToListAsync(ct);

        return Ok(new
        {
            payments = rows.Select(row => new
            {
                row.id,
                row.jobId,
                row.jobInvoiceId,
                row.invoiceNumber,
                row.xeroInvoiceId,
                row.contact,
                issueDate = row.issueDate?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? "",
                row.reference,
                row.paymentWay,
                paymentDate = row.paymentDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                paymentDateTime = DateTimeHelper.FormatNz(row.paymentDateTime),
                xeroTotal = ExtractInvoiceTotal(FirstNonEmpty(row.responsePayloadJson, row.requestPayloadJson)),
                row.amount,
                paymentTotal = row.amount,
                row.note,
                row.jobNote,
                row.externalStatus,
                createdAt = DateTimeHelper.FormatNz(row.createdAt),
            }),
        });
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
}
