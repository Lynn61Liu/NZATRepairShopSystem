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
            invoice = result.Invoice is null ? null : new
            {
                id = result.Invoice.Id.ToString(),
                jobId = result.Invoice.JobId.ToString(),
                provider = result.Invoice.Provider,
                externalInvoiceId = result.Invoice.ExternalInvoiceId,
                externalInvoiceNumber = result.Invoice.ExternalInvoiceNumber,
                externalStatus = result.Invoice.ExternalStatus,
                reference = result.Invoice.Reference,
                contactName = result.Invoice.ContactName,
                invoiceDate = result.Invoice.InvoiceDate,
                lineAmountTypes = result.Invoice.LineAmountTypes,
                tenantId = result.Invoice.TenantId,
                requestPayloadJson = result.Invoice.RequestPayloadJson,
                responsePayloadJson = result.Invoice.ResponsePayloadJson,
                createdAt = result.Invoice.CreatedAt,
                updatedAt = result.Invoice.UpdatedAt,
            },
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
            invoice = result.Invoice is null ? null : new
            {
                id = result.Invoice.Id.ToString(),
                jobId = result.Invoice.JobId.ToString(),
                provider = result.Invoice.Provider,
                externalInvoiceId = result.Invoice.ExternalInvoiceId,
                externalInvoiceNumber = result.Invoice.ExternalInvoiceNumber,
                externalStatus = result.Invoice.ExternalStatus,
                reference = result.Invoice.Reference,
                contactName = result.Invoice.ContactName,
                invoiceDate = result.Invoice.InvoiceDate,
                lineAmountTypes = result.Invoice.LineAmountTypes,
                tenantId = result.Invoice.TenantId,
                requestPayloadJson = result.Invoice.RequestPayloadJson,
                responsePayloadJson = result.Invoice.ResponsePayloadJson,
                createdAt = result.Invoice.CreatedAt,
                updatedAt = result.Invoice.UpdatedAt,
            },
            scope = result.Scope,
            accessTokenExpiresIn = result.AccessTokenExpiresIn,
            latestRefreshToken = result.LatestRefreshToken,
            refreshTokenUpdated = result.RefreshTokenUpdated,
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
            invoice = result.Invoice is null ? null : new
            {
                id = result.Invoice.Id.ToString(),
                jobId = result.Invoice.JobId.ToString(),
                provider = result.Invoice.Provider,
                externalInvoiceId = result.Invoice.ExternalInvoiceId,
                externalInvoiceNumber = result.Invoice.ExternalInvoiceNumber,
                externalStatus = result.Invoice.ExternalStatus,
                reference = result.Invoice.Reference,
                contactName = result.Invoice.ContactName,
                invoiceDate = result.Invoice.InvoiceDate,
                lineAmountTypes = result.Invoice.LineAmountTypes,
                tenantId = result.Invoice.TenantId,
                requestPayloadJson = result.Invoice.RequestPayloadJson,
                responsePayloadJson = result.Invoice.ResponsePayloadJson,
                createdAt = result.Invoice.CreatedAt,
                updatedAt = result.Invoice.UpdatedAt,
            },
        });
    }
}
