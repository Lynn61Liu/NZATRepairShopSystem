using Microsoft.AspNetCore.Mvc;
using Workshop.Api.DTOs;
using Workshop.Api.Services;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/courtesy-cars")]
public sealed class CourtesyCarAgreementsController : ControllerBase
{
    private readonly CourtesyCarAgreementService _service;

    public CourtesyCarAgreementsController(CourtesyCarAgreementService service)
    {
        _service = service;
    }

    [HttpGet("available")]
    public async Task<IActionResult> GetAvailableVehicles(CancellationToken ct)
    {
        Response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate";
        Response.Headers["Pragma"] = "no-cache";
        Response.Headers["Expires"] = "0";
        var items = await _service.GetAvailableVehiclesAsync(ct);
        return Ok(new { items });
    }

    [HttpGet("drafts")]
    public async Task<IActionResult> ListDrafts(CancellationToken ct)
    {
        var items = await _service.ListActiveAgreementsAsync(ct);
        return Ok(new { items });
    }

    [HttpGet("history")]
    public async Task<IActionResult> ListHistory(CancellationToken ct)
    {
        var items = await _service.ListAgreementHistoryAsync(ct);
        return Ok(new { items });
    }

    [HttpPost("jobs/{jobId:long}/drafts")]
    public async Task<IActionResult> CreateDraft(long jobId, [FromBody] CreateCourtesyCarAgreementRequest request, CancellationToken ct)
    {
        var result = await _service.CreateDraftAsync(jobId, request.VehicleId, ct);
        if (!result.Success)
            return StatusCode(result.StatusCode, new { error = result.Error });

        return Ok(new { agreement = result.Data });
    }

    [HttpGet("drafts/{agreementId:long}")]
    public async Task<IActionResult> GetDraft(long agreementId, CancellationToken ct)
    {
        var agreement = await _service.GetAgreementAsync(agreementId, ct);
        return agreement is null ? NotFound(new { error = "Agreement not found." }) : Ok(new { agreement });
    }

    [HttpGet("drafts/{agreementId:long}/preview-validation")]
    public async Task<IActionResult> ValidatePreview(long agreementId, CancellationToken ct)
    {
        var validation = await _service.ValidatePreviewAsync(agreementId, ct);
        return validation is null ? NotFound(new { error = "Agreement not found." }) : Ok(new { validation });
    }

    [HttpDelete("drafts/{agreementId:long}")]
    public async Task<IActionResult> DeleteDraft(long agreementId, CancellationToken ct)
    {
        var result = await _service.DeleteAgreementAsync(agreementId, ct);
        if (!result.Success)
            return StatusCode(result.StatusCode, new { error = result.Error });

        return Ok(new { deleted = true });
    }

    [HttpPost("drafts/{agreementId:long}/return")]
    public async Task<IActionResult> ReturnDraft(long agreementId, CancellationToken ct)
    {
        var result = await _service.ReturnAgreementAsync(agreementId, ct);
        if (!result.Success)
            return StatusCode(result.StatusCode, new { error = result.Error });

        return Ok(new { agreement = result.Data });
    }

    [HttpPut("drafts/{agreementId:long}")]
    public async Task<IActionResult> UpdateDraft(long agreementId, [FromBody] UpdateCourtesyCarAgreementRequest request, CancellationToken ct)
    {
        var result = await _service.UpdateAgreementAsync(agreementId, request, ct);
        if (!result.Success)
            return StatusCode(result.StatusCode, new { error = result.Error });

        return Ok(new { agreement = result.Data });
    }

    [HttpPost("drafts/{agreementId:long}/attachments")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> UploadAttachment(
        long agreementId,
        [FromForm] string kind,
        [FromForm] IFormFile file,
        CancellationToken ct)
    {
        var result = await _service.UploadAttachmentAsync(agreementId, kind, file, ct);
        if (!result.Success)
            return StatusCode(result.StatusCode, new { error = result.Error });

        return Ok(new { attachment = result.Data });
    }

    [HttpGet("drafts/{agreementId:long}/attachments/{attachmentId}")]
    public async Task<IActionResult> DownloadAttachment(long agreementId, string attachmentId, CancellationToken ct)
    {
        var result = await _service.DownloadAttachmentAsync(agreementId, attachmentId, ct);
        if (result is null)
            return NotFound(new { error = "Attachment not found." });

        Response.Headers.ContentDisposition = $"inline; filename=\"{result.FileName}\"";
        return File(result.Bytes, result.MimeType);
    }

    [HttpGet("drafts/{agreementId:long}/pdf")]
    public async Task<IActionResult> DownloadPdf(long agreementId, CancellationToken ct)
    {
        var bytes = await _service.DownloadPdfAsync(agreementId, ct);
        if (bytes is null)
            return NotFound(new { error = "PDF not found." });

        Response.Headers.ContentDisposition = $"inline; filename=\"courtesy-car-agreement-{agreementId}.pdf\"";
        return File(bytes, "application/pdf");
    }

    [HttpPost("drafts/{agreementId:long}/submit")]
    public async Task<IActionResult> Submit(long agreementId, CancellationToken ct)
    {
        var result = await _service.SubmitAsync(agreementId, ct);
        if (!result.Success)
            return StatusCode(result.StatusCode, new { error = result.Error });

        return Ok(new { agreement = result.Data });
    }
}
