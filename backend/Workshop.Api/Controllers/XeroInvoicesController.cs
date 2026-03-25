using Microsoft.AspNetCore.Mvc;
using Workshop.Api.DTOs;
using Workshop.Api.Services;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/xero/invoices")]
public class XeroInvoicesController : ControllerBase
{
    private readonly XeroInvoiceService _xeroInvoiceService;

    public XeroInvoicesController(XeroInvoiceService xeroInvoiceService)
    {
        _xeroInvoiceService = xeroInvoiceService;
    }

    [HttpPost]
    public async Task<IActionResult> CreateInvoice(
        [FromBody] CreateXeroInvoiceRequest request,
        [FromQuery] bool? summarizeErrors,
        [FromQuery] int? unitdp,
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey,
        CancellationToken ct)
    {
        if (request.LineItems.Count == 0)
        {
            return BadRequest(new
            {
                error = "At least one line item is required.",
            });
        }

        var result = await _xeroInvoiceService.CreateInvoiceAsync(
            request,
            new XeroInvoiceCreateOptions
            {
                SummarizeErrors = summarizeErrors,
                UnitDp = unitdp,
                IdempotencyKey = idempotencyKey,
            },
            ct);

        if (!result.Ok)
        {
            return StatusCode(result.StatusCode, new
            {
                error = result.Error,
                tenantId = result.TenantId,
                refreshTokenUpdated = result.RefreshTokenUpdated,
                latestRefreshToken = result.RefreshToken,
                nextAction = "Reconnect or switch the default Xero account stored in xero_tokens if token refresh keeps failing.",
                xero = result.Payload,
            });
        }

        return Ok(new
        {
            message = "Xero invoice created successfully.",
            tenantId = result.TenantId,
            scope = result.Scope,
            accessTokenExpiresIn = result.ExpiresIn,
            refreshTokenUpdated = result.RefreshTokenUpdated,
            latestRefreshToken = result.RefreshToken,
            invoice = result.Payload,
        });
    }
}
