using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Workshop.Api.Options;
using Workshop.Api.Services;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/xero/webhooks")]
public class XeroWebhooksController : ControllerBase
{
    private readonly JobInvoiceService _jobInvoiceService;
    private readonly ILogger<XeroWebhooksController> _logger;
    private readonly XeroWebhookOptions _options;

    public XeroWebhooksController(
        JobInvoiceService jobInvoiceService,
        IOptions<XeroWebhookOptions> options,
        ILogger<XeroWebhooksController> logger)
    {
        _jobInvoiceService = jobInvoiceService;
        _options = options.Value;
        _logger = logger;
    }

    [HttpPost]
    public async Task<IActionResult> Receive(CancellationToken ct)
    {
        Request.EnableBuffering();
        using var reader = new StreamReader(Request.Body, Encoding.UTF8, leaveOpen: true);
        var rawBody = await reader.ReadToEndAsync(ct);
        Request.Body.Position = 0;

        if (!ValidateSignature(rawBody))
            return Unauthorized(new { error = "Invalid Xero webhook signature." });

        XeroWebhookEnvelope? payload = null;
        if (!string.IsNullOrWhiteSpace(rawBody))
        {
            try
            {
                payload = JsonSerializer.Deserialize<XeroWebhookEnvelope>(rawBody, new JsonSerializerOptions(JsonSerializerDefaults.Web));
            }
            catch (JsonException ex)
            {
                _logger.LogWarning(ex, "Failed to parse Xero webhook payload.");
                return BadRequest(new { error = "Invalid webhook payload." });
            }
        }

        if (payload?.Events is null || payload.Events.Count == 0)
            return Ok(new { received = true, processed = 0 });

        var processed = 0;
        var skipped = 0;
        var errors = new List<object>();

        foreach (var evt in payload.Events)
        {
            if (!string.Equals(evt.ResourceType, "INVOICE", StringComparison.OrdinalIgnoreCase))
            {
                skipped += 1;
                continue;
            }

            if (!Guid.TryParse(evt.ResourceId, out var invoiceId))
            {
                skipped += 1;
                continue;
            }

            var result = await _jobInvoiceService.SyncFromXeroInvoiceIdAsync(invoiceId, ct);
            if (!result.Ok)
            {
                _logger.LogWarning("Failed to sync Xero invoice {InvoiceId} from webhook: {Error}", invoiceId, result.Error);
                errors.Add(new
                {
                    resourceId = evt.ResourceId,
                    eventType = evt.EventType,
                    error = result.Error,
                });
                continue;
            }

            processed += 1;
        }

        return Ok(new
        {
            received = true,
            processed,
            skipped,
            errors,
        });
    }

    private bool ValidateSignature(string rawBody)
    {
        if (!_options.Enabled)
            return false;

        var providedSignature = Request.Headers["x-xero-signature"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(providedSignature))
            return string.IsNullOrWhiteSpace(_options.SigningKey);

        if (string.IsNullOrWhiteSpace(_options.SigningKey))
        {
            _logger.LogWarning("Xero webhook signing key is not configured. Signature validation skipped.");
            return true;
        }

        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(_options.SigningKey));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(rawBody));
        var computedSignature = Convert.ToBase64String(hash);
        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(computedSignature),
            Encoding.UTF8.GetBytes(providedSignature));
    }

    public sealed class XeroWebhookEnvelope
    {
        public string? EventsHash { get; set; }
        public List<XeroWebhookEvent> Events { get; set; } = [];
        public object? FirstEventSequence { get; set; }
        public object? LastEventSequence { get; set; }
        public string? EntitlementId { get; set; }
        public string? TenantId { get; set; }
        public JsonElement? Payload { get; set; }
    }

    public sealed class XeroWebhookEvent
    {
        public string? ResourceUrl { get; set; }
        public string? ResourceId { get; set; }
        public string? EventDateUtc { get; set; }
        public string? EventType { get; set; }
        public string? EventCategory { get; set; }
        public string? ResourceType { get; set; }
        public string? TenantId { get; set; }
        public string? TenantType { get; set; }
    }
}
