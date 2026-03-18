using Microsoft.AspNetCore.Mvc;
using Workshop.Api.DTOs;
using Workshop.Api.Services;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/jobs/{id:long}/xero-draft-invoice")]
public class JobXeroInvoicesController : ControllerBase
{
    private readonly JobInvoiceService _jobInvoiceService;

    public JobXeroInvoicesController(JobInvoiceService jobInvoiceService)
    {
        _jobInvoiceService = jobInvoiceService;
    }

    [HttpPost]
    public async Task<IActionResult> CreateDraftInvoice(long id, CancellationToken ct)
    {
        var result = await _jobInvoiceService.CreateDraftForJobAsync(id, ct);
        if (!result.Ok)
        {
            return StatusCode(result.StatusCode, new
            {
                error = result.Error,
                request = result.RequestBody,
                xero = result.Payload,
            });
        }

        return StatusCode(result.StatusCode, new
        {
            alreadyExists = result.AlreadyExists,
            invoice = MapInvoice(result.Invoice),
            scope = result.Scope,
            accessTokenExpiresIn = result.AccessTokenExpiresIn,
            latestRefreshToken = result.LatestRefreshToken,
            refreshTokenUpdated = result.RefreshTokenUpdated,
            xero = result.Payload,
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
            invoice = MapInvoice(result.Invoice),
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
            invoice = MapInvoice(result.Invoice),
            xero = result.Payload,
        });
    }

    [HttpPut("/api/jobs/{id:long}/invoice-draft")]
    public async Task<IActionResult> SaveDraft(long id, [FromBody] SaveJobInvoiceDraftRequest request, CancellationToken ct)
    {
        var result = await _jobInvoiceService.SaveDraftToDbAsync(id, request, ct);
        if (!result.Ok)
        {
            return StatusCode(result.StatusCode, new
            {
                error = result.Error,
                request = result.RequestBody,
            });
        }

        return Ok(new
        {
            invoice = MapInvoice(result.Invoice),
        });
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
            invoice = MapInvoice(result.Invoice, result.LatestPayment),
        });
    }

    private static object? MapInvoice(Workshop.Api.Models.JobInvoice? invoice, Workshop.Api.Models.JobPayment? latestPayment = null)
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
            invoiceDate = invoice.InvoiceDate,
            lineAmountTypes = invoice.LineAmountTypes,
            tenantId = invoice.TenantId,
            requestPayloadJson = invoice.RequestPayloadJson,
            responsePayloadJson = invoice.ResponsePayloadJson,
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
