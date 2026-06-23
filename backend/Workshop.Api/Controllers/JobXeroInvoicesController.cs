using Microsoft.AspNetCore.Mvc;
using Workshop.Api.DTOs;
using Workshop.Api.Services;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/jobs/{id:long}/xero-draft-invoice")]
public class JobXeroInvoicesController : ControllerBase
{
    private readonly JobInvoiceService _jobInvoiceService;
    private readonly InvoiceOutboxService _invoiceOutboxService;

    public JobXeroInvoicesController(JobInvoiceService jobInvoiceService, InvoiceOutboxService invoiceOutboxService)
    {
        _jobInvoiceService = jobInvoiceService;
        _invoiceOutboxService = invoiceOutboxService;
    }

    public sealed class AttachExistingInvoiceRequest
    {
        public string InvoiceNumber { get; set; } = "";
    }

    [HttpPost]
    public async Task<IActionResult> CreateDraftInvoice(long id, CancellationToken ct)
    {
        var result = await _invoiceOutboxService.EnqueueCreateDraftAsync(id, ct);
        if (!result.Ok)
            return BadRequest(new { error = result.Error });

        return Ok(new
        {
            queued = true,
            alreadyExists = result.AlreadyHandled,
            messageId = result.MessageId,
            status = result.Status,
        });
    }

    [HttpPut]
    public async Task<IActionResult> SyncDraftInvoice(long id, [FromBody] SyncJobInvoiceDraftRequest request, CancellationToken ct)
    {
        var result = await _jobInvoiceService.SyncDraftForJobAsync(id, request, ct);
        if (!result.Ok)
        {
            return StatusCode(result.StatusCode, new
            {
                error = result.Error,
                request = result.RequestBody,
                xero = result.Payload,
            });
        }

        return Ok(new
        {
            invoice = MapInvoice(result.Invoice, id),
            scope = result.Scope,
            accessTokenExpiresIn = result.AccessTokenExpiresIn,
            latestRefreshToken = result.LatestRefreshToken,
            refreshTokenUpdated = result.RefreshTokenUpdated,
            xero = result.Payload,
        });
    }

    [HttpPost("pull")]
    public async Task<IActionResult> PullFromXero(long id, CancellationToken ct)
    {
        var result = await _jobInvoiceService.SyncFromXeroAsync(id, ct);
        if (!result.Ok)
        {
            return StatusCode(result.StatusCode, new
            {
                error = result.Error,
                xero = result.Payload,
            });
        }

        return Ok(new
        {
            invoice = MapInvoice(result.Invoice, id),
            xero = result.Payload,
        });
    }

    [HttpPost("pdf/pull")]
    public async Task<IActionResult> PullPdfFromXero(long id, CancellationToken ct)
    {
        var result = await _jobInvoiceService.SyncInvoicePdfAsync(id, ct);
        if (!result.Ok)
        {
            return StatusCode(result.StatusCode, new
            {
                error = result.Error,
            });
        }

        return Ok(new
        {
            invoice = MapInvoice(result.Invoice, id),
        });
    }

    [HttpGet("pdf")]
    public async Task<IActionResult> DownloadPdf(long id, CancellationToken ct)
    {
        var result = await _jobInvoiceService.GetPdfAsync(id, ct);
        if (result is null)
            return NotFound(new { error = "Invoice PDF not found." });

        Response.Headers.ContentDisposition = $"inline; filename=\"{result.FileName}\"";
        return File(result.Bytes, result.ContentType);
    }

    [HttpGet("pdf-preview")]
    public async Task<IActionResult> DownloadPdfPreview(long id, CancellationToken ct)
    {
        var result = await _jobInvoiceService.GetPdfPreviewAsync(id, ct);
        if (result is null)
            return NotFound(new { error = "Invoice PDF preview not found." });

        Response.Headers.ContentDisposition = $"inline; filename=\"{result.FileName}\"";
        return File(result.Bytes, result.ContentType);
    }

    [HttpPost("attach")]
    public async Task<IActionResult> AttachExistingInvoice(long id, [FromBody] AttachExistingInvoiceRequest request, CancellationToken ct)
    {
        var result = await _invoiceOutboxService.EnqueueAttachExistingAsync(id, request.InvoiceNumber, ct);
        if (!result.Ok)
            return BadRequest(new { error = result.Error });

        return Ok(new
        {
            queued = true,
            alreadyExists = result.AlreadyHandled,
            messageId = result.MessageId,
            status = result.Status,
        });
    }

    [HttpDelete]
    public async Task<IActionResult> UnlinkInvoice(long id, CancellationToken ct)
    {
        var result = await _jobInvoiceService.UnlinkInvoiceAsync(id, ct);
        if (!result.Ok)
            return StatusCode(result.StatusCode, new { error = result.Error });

        return Ok(new { ok = true });
    }

    [HttpPut("state")]
    public async Task<IActionResult> UpdateXeroState(long id, [FromBody] UpdateJobInvoiceXeroStateRequest request, CancellationToken ct)
    {
        var result = await _jobInvoiceService.UpdateXeroStateAsync(id, request, ct);
        if (!result.Ok)
        {
            return StatusCode(result.StatusCode, new
            {
                error = result.Error,
                xero = result.Payload,
            });
        }

        return Ok(new
        {
            invoice = MapInvoice(result.Invoice, id, result.LatestPayment),
        });
    }

    private static object? MapInvoice(Workshop.Api.Models.JobInvoice? invoice, long jobId, Workshop.Api.Models.JobPayment? latestPayment = null)
    {
        if (invoice is null) return null;

        return new
        {
            id = invoice.Id.ToString(),
            jobId = invoice.JobId.ToString(),
            provider = invoice.Provider,
            externalInvoiceId = invoice.ExternalInvoiceId,
            externalInvoiceNumber = invoice.ExternalInvoiceNumber,
            externalStatus = invoice.ExternalStatus,
            reference = invoice.Reference,
            contactName = invoice.ContactName,
            invoiceNote = invoice.InvoiceNote,
            invoiceDate = invoice.InvoiceDate,
            lineAmountTypes = invoice.LineAmountTypes,
            tenantId = invoice.TenantId,
            requestPayloadJson = invoice.RequestPayloadJson,
            responsePayloadJson = invoice.ResponsePayloadJson,
            pdfUrl = (invoice.PdfContent is { Length: > 0 } || (!string.IsNullOrWhiteSpace(invoice.PdfFilePath) && System.IO.File.Exists(invoice.PdfFilePath)))
                ? $"/api/jobs/{jobId}/xero-draft-invoice/pdf"
                : null,
            pdfPreviewUrl = (invoice.PdfPreviewContent is { Length: > 0 } || (!string.IsNullOrWhiteSpace(invoice.PdfPreviewPath) && System.IO.File.Exists(invoice.PdfPreviewPath)))
                ? $"/api/jobs/{jobId}/xero-draft-invoice/pdf-preview"
                : null,
            pdfDownloadedAt = invoice.PdfDownloadedAt,
            pdfPreviewGeneratedAt = invoice.PdfPreviewGeneratedAt,
            createdAt = invoice.CreatedAt,
            updatedAt = invoice.UpdatedAt,
            latestPayment = latestPayment is null ? null : new
            {
                id = latestPayment.Id.ToString(),
                method = latestPayment.Method,
                amount = latestPayment.Amount,
                paymentDate = latestPayment.PaymentDate,
                reference = latestPayment.Reference,
                accountCode = latestPayment.AccountCode,
                accountName = latestPayment.AccountName,
                externalStatus = latestPayment.ExternalStatus,
                createdAt = latestPayment.CreatedAt,
                updatedAt = latestPayment.UpdatedAt,
            },
        };
    }
}
