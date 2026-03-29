using System.Globalization;
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
                    externalStatus = payment.ExternalStatus ?? "",
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
                row.amount,
                row.note,
                row.externalStatus,
                createdAt = DateTimeHelper.FormatNz(row.createdAt),
            }),
        });
    }
}
