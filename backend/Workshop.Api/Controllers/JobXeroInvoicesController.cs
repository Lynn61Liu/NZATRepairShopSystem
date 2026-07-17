using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.DTOs;
using Workshop.Api.Services;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/jobs/{id:long}/xero-draft-invoice")]
public class JobXeroInvoicesController : ControllerBase
{
    private readonly JobInvoiceService _jobInvoiceService;
    private readonly InvoiceOutboxService _invoiceOutboxService;
    private readonly InvoiceOutboxKickService _invoiceOutboxKickService;
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _environment;

    public JobXeroInvoicesController(
        JobInvoiceService jobInvoiceService,
        InvoiceOutboxService invoiceOutboxService,
        InvoiceOutboxKickService invoiceOutboxKickService,
        AppDbContext db,
        IWebHostEnvironment environment)
    {
        _jobInvoiceService = jobInvoiceService;
        _invoiceOutboxService = invoiceOutboxService;
        _invoiceOutboxKickService = invoiceOutboxKickService;
        _db = db;
        _environment = environment;
    }

    public sealed class AttachExistingInvoiceRequest
    {
        public string InvoiceNumber { get; set; } = "";
    }

    public sealed class ReplaceExistingInvoiceRequest
    {
        public string InvoiceNumber { get; set; } = "";
    }

    [HttpPost]
    public async Task<IActionResult> CreateDraftInvoice(long id, CancellationToken ct)
    {
        var result = await _invoiceOutboxService.EnqueueCreateDraftAsync(id, ct);
        if (!result.Ok)
            return BadRequest(new { error = result.Error });

        var started = await StartImmediatelyAsync(result, id, "manual_invoice_create", ct);
        return Ok(new
        {
            queued = true,
            alreadyExists = result.AlreadyHandled,
            messageId = result.MessageId,
            status = started ? "processing" : result.Status,
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

    [HttpPost("email/preview")]
    public async Task<IActionResult> SendInvoiceEmailPreview(long id, CancellationToken ct)
    {
        if (!_environment.IsDevelopment())
            return NotFound();

        var result = await _jobInvoiceService.SendInvoicePreviewAsync(id, ct);
        if (!result.Ok)
        {
            return StatusCode(result.StatusCode, new
            {
                error = result.Error,
            });
        }

        return Ok(new
        {
            message = "Invoice email preview sent to the active Gmail account.",
            delivery = result.Payload,
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

        var started = await StartImmediatelyAsync(result, id, "manual_invoice_attach", ct);
        return Ok(new
        {
            queued = true,
            alreadyExists = result.AlreadyHandled,
            messageId = result.MessageId,
            status = started ? "processing" : result.Status,
        });
    }

    [HttpPost("replace")]
    public async Task<IActionResult> ReplaceExistingInvoice(long id, [FromBody] ReplaceExistingInvoiceRequest request, CancellationToken ct)
    {
        var result = await _invoiceOutboxService.EnqueueReplaceExistingAsync(id, request.InvoiceNumber, ct);
        if (!result.Ok)
            return BadRequest(new { error = result.Error });

        var started = await StartImmediatelyAsync(result, id, "manual_invoice_replace", ct);
        return Ok(new
        {
            queued = true,
            alreadyExists = result.AlreadyHandled,
            messageId = result.MessageId,
            status = started ? "processing" : result.Status,
        });
    }

    [HttpGet("processing")]
    public async Task<IActionResult> GetProcessingState(long id, CancellationToken ct)
    {
        var state = await _db.Jobs.AsNoTracking()
            .Where(x => x.Id == id)
            .Select(job => new
            {
                hasInvoice = _db.JobInvoices.AsNoTracking().Any(x => x.JobId == job.Id),
                processing = _db.OutboxMessages.AsNoTracking()
                    .Where(x => x.AggregateType == InvoiceOutboxService.JobAggregateType
                        && x.AggregateId == job.Id
                        && (x.MessageType == InvoiceOutboxService.CreateDraftMessageType
                            || x.MessageType == InvoiceOutboxService.AttachExistingMessageType
                            || x.MessageType == InvoiceOutboxService.ReplaceExistingMessageType))
                    .OrderByDescending(x => x.CreatedAt)
                    .Select(x => new
                    {
                        id = x.Id.ToString(),
                        messageType = x.MessageType,
                        status = x.Status,
                        attemptCount = x.AttemptCount,
                        lastError = x.LastError,
                        availableAt = x.AvailableAt,
                        lockedAt = x.LockedAt,
                        createdAt = x.CreatedAt,
                        updatedAt = x.UpdatedAt,
                        processedAt = x.ProcessedAt,
                    })
                    .FirstOrDefault(),
            })
            .FirstOrDefaultAsync(ct);
        if (state is null)
            return NotFound(new { error = "Job not found." });

        return Ok(new
        {
            state.hasInvoice,
            processing = state.processing is null ? null : new
            {
                state.processing.id,
                state.processing.messageType,
                state.processing.status,
                state.processing.attemptCount,
                state.processing.lastError,
                state.processing.availableAt,
                state.processing.lockedAt,
                state.processing.createdAt,
                state.processing.updatedAt,
                state.processing.processedAt,
                requiresXeroReconnect = InvoiceOutboxService.RequiresXeroReconnect(state.processing.lastError),
            },
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

    private async Task<bool> StartImmediatelyAsync(
        InvoiceOutboxEnqueueResult result,
        long jobId,
        string segmentName,
        CancellationToken ct)
    {
        if (result.MessageId is not { } messageId)
            return false;

        var started = await _invoiceOutboxService.TryStartMessageNowAsync(messageId, ct);
        _invoiceOutboxKickService.Dispatch(messageId, jobId, segmentName, alreadyStarted: started);
        return started;
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
