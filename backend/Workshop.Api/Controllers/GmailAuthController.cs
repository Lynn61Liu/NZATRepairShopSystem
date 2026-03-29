using System.Net.Http.Headers;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using Microsoft.Net.Http.Headers;
using UglyToad.PdfPig;
using Workshop.Api.Data;
using Workshop.Api.Options;
using Workshop.Api.Services;
using Workshop.Api.Utils;
using Workshop.Api.Models;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/gmail")]
public class GmailAuthController : ControllerBase
{
    private const string StateCachePrefix = "gmail-oauth-state:";
    private static readonly TimeSpan DuplicateSendWindow = TimeSpan.FromMinutes(5);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IMemoryCache _cache;
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _environment;
    private readonly GmailOptions _options;
    private readonly GmailAccountService _gmailAccountService;
    private readonly GmailTokenService _gmailTokenService;
    private readonly GmailThreadSyncService _gmailThreadSyncService;
    private readonly AppleVisionImageOcrService _imageOcrService;
    private readonly JobPoStateService _jobPoStateService;

    public GmailAuthController(
        IHttpClientFactory httpClientFactory,
        IMemoryCache cache,
        AppDbContext db,
        IWebHostEnvironment environment,
        IOptions<GmailOptions> options,
        GmailAccountService gmailAccountService,
        GmailTokenService gmailTokenService,
        GmailThreadSyncService gmailThreadSyncService,
        AppleVisionImageOcrService imageOcrService,
        JobPoStateService jobPoStateService)
    {
        _httpClientFactory = httpClientFactory;
        _cache = cache;
        _db = db;
        _environment = environment;
        _options = options.Value;
        _gmailAccountService = gmailAccountService;
        _gmailTokenService = gmailTokenService;
        _gmailThreadSyncService = gmailThreadSyncService;
        _imageOcrService = imageOcrService;
        _jobPoStateService = jobPoStateService;
    }

    [HttpGet("connect")]
    public IActionResult Connect([FromQuery] bool redirect = false, [FromQuery] string? scopes = null, [FromQuery] string? returnUrl = null)
    {
        var validationError = ValidateConfiguration();
        if (validationError is not null)
            return BadRequest(new { error = validationError });

        var resolvedScopes = ResolveScopes(scopes);
        var state = Guid.NewGuid().ToString("N");
        _cache.Set(StateCachePrefix + state, new OAuthStateEntry { ReturnUrl = NormalizeReturnUrl(returnUrl) }, TimeSpan.FromMinutes(15));

        var authUrl = BuildAuthorizeUrl(state, resolvedScopes);
        if (redirect)
            return Redirect(authUrl);

        return Ok(new
        {
            authorizeUrl = authUrl,
            callbackUrl = _options.RedirectUri,
            scopes = SplitScopes(resolvedScopes),
            scopesSource = string.IsNullOrWhiteSpace(scopes) ? "configuration" : "query",
        });
    }

    [HttpGet("oauth/url")]
    public IActionResult OAuthUrl([FromQuery] string? scopes = null, [FromQuery] string? returnUrl = null) =>
        Connect(redirect: false, scopes: scopes, returnUrl: returnUrl);

    [HttpGet("callback")]
    [HttpGet("oauth/callback")]
    public async Task<IActionResult> Callback(
        [FromQuery] string? code,
        [FromQuery] string? state,
        [FromQuery] string? error,
        [FromQuery(Name = "error_description")] string? errorDescription,
        CancellationToken ct)
    {
        OAuthStateEntry? stateEntry = null;
        if (!string.IsNullOrWhiteSpace(state))
            _cache.TryGetValue(StateCachePrefix + state, out stateEntry);

        if (!string.IsNullOrWhiteSpace(error))
        {
            if (!string.IsNullOrWhiteSpace(stateEntry?.ReturnUrl))
                return Redirect(BuildReturnUrl(stateEntry.ReturnUrl, "gmail", "error", errorDescription ?? error));

            return BadRequest(new
            {
                error,
                errorDescription,
            });
        }

        if (string.IsNullOrWhiteSpace(code))
            return BadRequest(new { error = "Missing authorization code." });

        if (string.IsNullOrWhiteSpace(state) || stateEntry is null)
            return BadRequest(new { error = "Missing or invalid OAuth state." });

        _cache.Remove(StateCachePrefix + state);

        var tokenResult = await ExchangeCodeForTokenAsync(code, ct);
        if (!tokenResult.Ok)
        {
            if (!string.IsNullOrWhiteSpace(stateEntry.ReturnUrl))
                return Redirect(BuildReturnUrl(stateEntry.ReturnUrl, "gmail", "error", tokenResult.Error ?? "Gmail authorization failed."));
            return StatusCode(tokenResult.StatusCode, new { error = tokenResult.Error });
        }

        var profileResult = await LoadProfileAsync(tokenResult.AccessToken, ct);
        if (!profileResult.Ok)
        {
            if (!string.IsNullOrWhiteSpace(stateEntry.ReturnUrl))
                return Redirect(BuildReturnUrl(stateEntry.ReturnUrl, "gmail", "error", profileResult.Error ?? "Failed to load Gmail profile."));
            return StatusCode(profileResult.StatusCode, new
            {
                error = profileResult.Error,
                refreshToken = tokenResult.RefreshToken,
                accessTokenExpiresIn = tokenResult.ExpiresIn,
                scope = tokenResult.Scope,
            });
        }

        var account = await _gmailAccountService.UpsertAuthorizedAccountAsync(
            profileResult.Email,
            tokenResult.RefreshToken,
            tokenResult.AccessToken,
            tokenResult.ExpiresIn,
            tokenResult.Scope,
            ct);

        if (!string.IsNullOrWhiteSpace(stateEntry.ReturnUrl))
            return Redirect(BuildReturnUrl(stateEntry.ReturnUrl, "gmail", "connected", $"Connected {profileResult.Email}."));

        return Ok(new
        {
            message = "Gmail authorization completed. Account saved in database.",
            email = profileResult.Email,
            accountId = account.Id,
            isDefault = account.IsDefault,
            refreshToken = tokenResult.RefreshToken,
            accessTokenExpiresIn = tokenResult.ExpiresIn,
            scope = tokenResult.Scope,
            suggestedConfig = new
            {
                Gmail__ClientId = _options.ClientId,
                Gmail__ClientSecret = "<already configured>",
                Gmail__RedirectUri = _options.RedirectUri,
                nextStep = "Refresh token is stored in gmail_accounts. Set only OAuth client settings via environment variables.",
            },
        });
    }

    [HttpGet("health")]
    [HttpGet("status")]
    public async Task<IActionResult> Health(CancellationToken ct, [FromQuery] string? scopes = null)
    {
        var missing = new List<string>();
        if (string.IsNullOrWhiteSpace(_options.ClientId)) missing.Add("Gmail:ClientId");
        if (string.IsNullOrWhiteSpace(_options.ClientSecret)) missing.Add("Gmail:ClientSecret");
        if (string.IsNullOrWhiteSpace(_options.RedirectUri)) missing.Add("Gmail:RedirectUri");
        var apiMissing = new List<string>();
        var accounts = await _gmailAccountService.GetAccountsAsync(ct);
        if (accounts.Count == 0) apiMissing.Add("GmailAccounts");
        var resolvedScopes = ResolveScopes(scopes);

        string? authorizedEmail = null;
        string? grantedScopes = null;
        long? activeAccountId = null;
        if (missing.Count == 0 && apiMissing.Count == 0)
        {
            var tokenResult = await _gmailTokenService.RefreshAccessTokenAsync(ct);
            if (tokenResult.Ok)
            {
                grantedScopes = tokenResult.Scope;
                activeAccountId = tokenResult.AccountId;
                var profileResult = await LoadProfileAsync(tokenResult.AccessToken, ct);
                if (profileResult.Ok)
                    authorizedEmail = profileResult.Email;
            }
        }

        return Ok(new
        {
            configured = missing.Count == 0,
            missing,
            apiReady = missing.Count == 0 && apiMissing.Count == 0,
            apiMissing,
            suggestedLocalCallback = "http://localhost:5227/api/gmail/oauth/callback",
            currentRedirectUri = _options.RedirectUri,
            scopes = SplitScopes(resolvedScopes),
            scopesSource = string.IsNullOrWhiteSpace(scopes) ? "configuration" : "query",
            authorizedEmail,
            activeAccountId,
            grantedScopes = SplitScopes(grantedScopes),
            accounts = accounts.Select(MapAccount),
        });
    }

    [HttpGet("accounts")]
    public async Task<IActionResult> GetAccounts(CancellationToken ct)
    {
        var accounts = await _gmailAccountService.GetAccountsAsync(ct);
        return Ok(new
        {
            items = accounts.Select(MapAccount).ToList(),
            total = accounts.Count,
        });
    }

    [HttpPut("accounts/{id:long}/default")]
    public async Task<IActionResult> SetDefaultAccount(long id, CancellationToken ct)
    {
        var updated = await _gmailAccountService.SetDefaultAccountAsync(id, ct);
        if (!updated)
            return NotFound(new { error = "Gmail account not found." });

        var accounts = await _gmailAccountService.GetAccountsAsync(ct);
        return Ok(new
        {
            success = true,
            defaultAccountId = id,
            items = accounts.Select(MapAccount).ToList(),
        });
    }

    [HttpPut("accounts/{id:long}/disable")]
    public async Task<IActionResult> DisableAccount(long id, CancellationToken ct)
    {
        var updated = await _gmailAccountService.DisableAccountAsync(id, ct);
        if (!updated)
            return NotFound(new { error = "Gmail account not found." });

        var accounts = await _gmailAccountService.GetAccountsAsync(ct);
        return Ok(new
        {
            message = "Gmail account disabled.",
            items = accounts.Select(MapAccount).ToList(),
        });
    }

    [HttpPost("send")]
    public async Task<IActionResult> Send([FromBody] GmailSendRequest req, CancellationToken ct)
    {
        if (req is null || string.IsNullOrWhiteSpace(req.To))
            return BadRequest(new { error = "To is required." });
        if (string.IsNullOrWhiteSpace(req.Subject))
            return BadRequest(new { error = "Subject is required." });

        var correlatedJobId = JobPoStateService.TryExtractJobIdFromCorrelationId(req.CorrelationId?.Trim());
        if (correlatedJobId.HasValue)
        {
            var hasPaidInvoice = await _db.JobInvoices.AsNoTracking()
                .AnyAsync(x => x.JobId == correlatedJobId.Value && x.ExternalStatus != null && x.ExternalStatus.ToUpper() == "PAID", ct);
            if (hasPaidInvoice)
                return BadRequest(new { error = "PO Request data is locked because the invoice is already marked as Paid in Xero." });
        }

        var recipients = NormalizeRecipientAddresses(req.To);
        if (recipients.Length == 0)
            return BadRequest(new { error = "At least one valid recipient email is required." });

        var normalizedCorrelationId = req.CorrelationId?.Trim();
        var normalizedSubject = req.Subject.Trim();
        var normalizedRecipientList = NormalizeRecipientListForComparison(recipients);
        if (!string.IsNullOrWhiteSpace(normalizedCorrelationId))
        {
            var duplicateThreshold = DateTime.UtcNow.Subtract(DuplicateSendWindow);
            var recentSentLogs = await _db.GmailMessageLogs.AsNoTracking()
                .Where(x => x.Direction == "sent")
                .Where(x => x.CorrelationId == normalizedCorrelationId)
                .Where(x => x.CreatedAt >= duplicateThreshold)
                .Select(x => new
                {
                    x.Subject,
                    x.ToAddress,
                    x.CreatedAt,
                })
                .ToListAsync(ct);

            var recentDuplicate = recentSentLogs.FirstOrDefault(x =>
                string.Equals((x.Subject ?? "").Trim(), normalizedSubject, StringComparison.OrdinalIgnoreCase) &&
                string.Equals(NormalizeRecipientListForComparison(x.ToAddress), normalizedRecipientList, StringComparison.OrdinalIgnoreCase));
            if (recentDuplicate is not null)
            {
                return Conflict(new
                {
                    error = $"Duplicate PO request blocked. The same email was already sent at {recentDuplicate.CreatedAt:yyyy-MM-dd HH:mm:ss} UTC.",
                });
            }
        }

        var tokenResult = await _gmailTokenService.RefreshAccessTokenAsync(req.GmailAccountId, ct);
        if (!tokenResult.Ok)
            return StatusCode(tokenResult.StatusCode, new { error = tokenResult.Error });

        var rawMessage = BuildRawMessage(
            string.Join(", ", recipients),
            req.Subject,
            req.Body ?? "",
            req.ReplyToRfcMessageId,
            req.ReferencesHeader);
        var client = _httpClientFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenResult.AccessToken);
        request.Content = JsonContent.Create(new GmailSendApiRequest(rawMessage, req.ThreadId?.Trim()));

        using var response = await client.SendAsync(request, ct);
        var payload = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
            return StatusCode((int)response.StatusCode, new
            {
                error = payload,
                grantedScopes = SplitScopes(tokenResult.Scope),
                configuredScopes = SplitScopes(_options.Scopes),
            });

        var sendResult = JsonSerializer.Deserialize<GmailSendApiResponse>(payload, JsonOptions);
        var subject = req.Subject.Trim();
        var body = req.Body ?? "";
        var sentMessageId = sendResult?.Id ?? "";
        string? sentRfcMessageId = null;
        string? sentReferencesHeader = null;
        if (!string.IsNullOrWhiteSpace(sentMessageId))
        {
            var sentDetails = await LoadMessageDetailsAsync(client, tokenResult.AccessToken, sentMessageId, ct);
            sentRfcMessageId = sentDetails?.RfcMessageId;
            sentReferencesHeader = sentDetails?.ReferencesHeader;

            await UpsertMessageLogAsync(
                gmailMessageId: sentMessageId,
                gmailThreadId: sendResult?.ThreadId,
                internalDateMs: sendResult?.InternalDate is long internalDate ? internalDate : null,
                gmailAccountId: tokenResult.AccountId,
                gmailAccountEmail: tokenResult.AccountEmail,
                direction: "sent",
                counterpartyEmail: string.Join(", ", recipients),
                fromAddress: null,
                toAddress: string.Join(", ", recipients),
                subject: normalizedSubject,
                body: body,
                snippet: body.Length > 240 ? body[..240] : body,
                correlationId: normalizedCorrelationId,
                rfcMessageId: sentRfcMessageId,
                referencesHeader: sentReferencesHeader,
                attachments: [],
                isSystemInitiated: true,
                ct: ct);

            await _jobPoStateService.SyncStateByCorrelationAsync(normalizedCorrelationId, ct);
        }

        return Ok(new
        {
            message = "Email sent via Gmail API.",
            id = sentMessageId,
            threadId = sendResult?.ThreadId ?? "",
            rfcMessageId = sentRfcMessageId ?? "",
            referencesHeader = sentReferencesHeader ?? "",
            gmailAccountId = tokenResult.AccountId,
            gmailAccountEmail = tokenResult.AccountEmail,
            scope = tokenResult.Scope,
            accessTokenExpiresIn = tokenResult.ExpiresIn,
        });
    }

    [HttpGet("thread")]
    public async Task<IActionResult> GetThread(
        [FromQuery] string? counterpartyEmail,
        [FromQuery] string? correlationId,
        [FromQuery] int limit = 20,
        [FromQuery] bool refresh = false,
        [FromQuery] long? gmailAccountId = null,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(counterpartyEmail) && string.IsNullOrWhiteSpace(correlationId))
            return BadRequest(new { error = "counterpartyEmail or correlationId is required." });

        string? syncWarning = null;
        var snapshot = await _gmailThreadSyncService.GetThreadSnapshotAsync(counterpartyEmail, correlationId, limit, gmailAccountId, ct);
        if (_gmailThreadSyncService.ShouldRefresh(snapshot, refresh))
        {
            var syncResult = await _gmailThreadSyncService.SyncThreadAsync(
                snapshot.CounterpartyEmail,
                snapshot.CorrelationId,
                snapshot.Limit,
                snapshot.GmailAccountId,
                ct);
            syncWarning = syncResult.Warning;
            snapshot = await _gmailThreadSyncService.GetThreadSnapshotAsync(
                snapshot.CounterpartyEmail,
                snapshot.CorrelationId,
                snapshot.Limit,
                snapshot.GmailAccountId,
                ct);
        }

        if (snapshot.IsInactive && snapshot.Logs.Count == 0)
        {
            return Ok(new GmailThreadResponse(
                [],
                0,
                false,
                false,
                "",
                "",
                syncWarning ?? "Correlation is inactive. Gmail sync skipped.",
                [],
                false
            ));
        }

        var logs = snapshot.Logs;
        var detections = await BuildPoDetectionsAsync(logs, ct);

        var events = logs.Select(log => new GmailThreadEventResponse(
            log.GmailMessageId,
            log.Direction == "reply" ? "reply" : log.Direction == "reminder" ? "reminder" : "sent",
            NormalizeInternalDate(log.InternalDateMs),
            log.Body ?? log.Snippet ?? "",
            log.FromAddress ?? "",
            log.ToAddress ?? "",
            log.Subject ?? "",
            log.Body ?? log.Snippet ?? "",
            log.GmailThreadId ?? "",
            !log.IsRead && string.Equals(log.Direction, "reply", StringComparison.OrdinalIgnoreCase),
            log.DetectedPoNumber ?? "",
            log.RfcMessageId ?? "",
            log.ReferencesHeader ?? "",
            DeserializeAttachments(log.AttachmentsJson),
            log.IsSystemInitiated
        )).ToList();

        var unreadReplyCount = logs.Count(x =>
            string.Equals(x.Direction, "reply", StringComparison.OrdinalIgnoreCase) && !x.IsRead);
        var detectedPoNumber = logs
            .Where(x => !string.IsNullOrWhiteSpace(x.DetectedPoNumber))
            .OrderByDescending(x => x.InternalDateMs ?? 0)
            .Select(x => x.DetectedPoNumber!)
            .FirstOrDefault();
        var hasExternalDraftSend = logs.Any(x =>
            string.Equals(x.Direction, "sent", StringComparison.OrdinalIgnoreCase) &&
            !x.IsSystemInitiated);

        return Ok(new GmailThreadResponse(
            events,
            unreadReplyCount,
            logs.Any(x => string.Equals(x.Direction, "reply", StringComparison.OrdinalIgnoreCase)),
            !string.IsNullOrWhiteSpace(detectedPoNumber),
            detectedPoNumber ?? "",
            logs.FirstOrDefault(x => string.Equals(x.Direction, "reply", StringComparison.OrdinalIgnoreCase)) is { } latestReply
                ? NormalizeInternalDate(latestReply.InternalDateMs)
                : "",
            syncWarning ?? "",
            detections,
            hasExternalDraftSend
        ));
    }

    [HttpGet("po-detections")]
    public async Task<IActionResult> GetPoDetections(
        [FromQuery] string? counterpartyEmail,
        [FromQuery] string? correlationId,
        [FromQuery] int limit = 20,
        [FromQuery] bool refresh = false,
        [FromQuery] long? gmailAccountId = null,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(counterpartyEmail) && string.IsNullOrWhiteSpace(correlationId))
            return BadRequest(new { error = "counterpartyEmail or correlationId is required." });

        var snapshot = await _gmailThreadSyncService.GetThreadSnapshotAsync(counterpartyEmail, correlationId, limit, gmailAccountId, ct);
        if (_gmailThreadSyncService.ShouldRefresh(snapshot, refresh))
        {
            await _gmailThreadSyncService.SyncThreadAsync(
                snapshot.CounterpartyEmail,
                snapshot.CorrelationId,
                snapshot.Limit,
                snapshot.GmailAccountId,
                ct);
            snapshot = await _gmailThreadSyncService.GetThreadSnapshotAsync(
                snapshot.CounterpartyEmail,
                snapshot.CorrelationId,
                snapshot.Limit,
                snapshot.GmailAccountId,
                ct);
        }

        var detections = await BuildPoDetectionsAsync(snapshot.Logs, ct);
        return Ok(detections);
    }

    [HttpPost("thread/read")]
    public async Task<IActionResult> MarkThreadRead([FromBody] GmailThreadReadRequest req, CancellationToken ct)
    {
        if (req is null || string.IsNullOrWhiteSpace(req.CounterpartyEmail))
            return BadRequest(new { error = "counterpartyEmail is required." });

        var normalizedCounterpartyEmail = req.CounterpartyEmail.Trim();
        var normalizedCorrelationId = req.CorrelationId?.Trim();

        var query = FilterLogsByAccount(_db.GmailMessageLogs, req.GmailAccountId)
            .Where(x => x.CounterpartyEmail == normalizedCounterpartyEmail)
            .Where(x => x.Direction == "reply" && !x.IsRead);

        if (!string.IsNullOrWhiteSpace(normalizedCorrelationId))
            query = query.Where(x => x.CorrelationId == normalizedCorrelationId);

        var logs = await query.ToListAsync(ct);
        var now = DateTime.UtcNow;
        foreach (var log in logs)
        {
            log.IsRead = true;
            log.ReadAt = now;
            log.UpdatedAt = now;
        }

        await _db.SaveChangesAsync(ct);
        return Ok(new { updated = logs.Count });
    }

    [HttpGet("debug/token")]
    public async Task<IActionResult> DebugToken([FromQuery] long? gmailAccountId, CancellationToken ct)
    {
        var tokenResult = await _gmailTokenService.RefreshAccessTokenAsync(gmailAccountId, ct);
        if (!tokenResult.Ok)
            return StatusCode(tokenResult.StatusCode, new { error = tokenResult.Error });

        var profileResult = await LoadProfileAsync(tokenResult.AccessToken, ct);

        return Ok(new
        {
            grantedScopes = SplitScopes(tokenResult.Scope),
            rawScope = tokenResult.Scope,
            configuredScopes = SplitScopes(_options.Scopes),
            accountId = tokenResult.AccountId,
            accountEmail = tokenResult.AccountEmail,
            tokenSource = tokenResult.Source,
            emailResolved = profileResult.Ok ? profileResult.Email : null,
            profileError = profileResult.Ok ? null : profileResult.Error,
        });
    }

    [HttpGet("attachment")]
    public async Task<IActionResult> GetAttachment(
        [FromQuery] string? messageId,
        [FromQuery] string? attachmentId,
        [FromQuery] string? fileName,
        [FromQuery] string? mimeType,
        [FromQuery] bool inline = false,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(messageId))
            return BadRequest(new { error = "messageId is required." });
        if (string.IsNullOrWhiteSpace(attachmentId))
            return BadRequest(new { error = "attachmentId is required." });

        var resolvedMimeType = string.IsNullOrWhiteSpace(mimeType) ? "application/octet-stream" : mimeType.Trim();
        var resolvedFileName = string.IsNullOrWhiteSpace(fileName) ? "attachment" : fileName.Trim();
        var cachedFilePath = await EnsureAttachmentCachedAsync(
            messageId.Trim(),
            attachmentId.Trim(),
            resolvedFileName,
            resolvedMimeType,
            ct);
        if (string.IsNullOrWhiteSpace(cachedFilePath) || !System.IO.File.Exists(cachedFilePath))
            return NotFound(new { error = "Attachment content not found." });

        var bytes = await System.IO.File.ReadAllBytesAsync(cachedFilePath, ct);
        if (inline)
        {
            Response.Headers[HeaderNames.ContentDisposition] =
                $"inline; filename*=UTF-8''{Uri.EscapeDataString(resolvedFileName)}";
            return File(bytes, resolvedMimeType);
        }

        return File(bytes, resolvedMimeType, resolvedFileName);
    }

    private async Task<string?> EnsureAttachmentCachedAsync(
        string messageId,
        string attachmentId,
        string fileName,
        string mimeType,
        CancellationToken ct)
    {
        var log = await _db.GmailMessageLogs.FirstOrDefaultAsync(x => x.GmailMessageId == messageId, ct);
        var attachments = DeserializeAttachments(log?.AttachmentsJson);
        var attachment = attachments.FirstOrDefault(x => string.Equals(x.AttachmentId, attachmentId, StringComparison.Ordinal));

        var directory = Path.Combine(_environment.ContentRootPath, "App_Data", "gmail-attachments");
        Directory.CreateDirectory(directory);

        var safeBaseName = SanitizeFileName(Path.GetFileNameWithoutExtension(fileName));
        var shortenedBaseName = safeBaseName.Length > 40 ? safeBaseName[..40] : safeBaseName;
        var extension = ResolveFileExtension(fileName, mimeType);
        var messageHash = ComputeShortHash(messageId, 12);
        var attachmentHash = ComputeShortHash(attachmentId, 12);
        var relativePath = Path.Combine(
            "App_Data",
            "gmail-attachments",
            $"{messageHash}_{attachmentHash}_{shortenedBaseName}{extension}");
        var fullPath = Path.Combine(_environment.ContentRootPath, relativePath);

        if (!string.IsNullOrWhiteSpace(attachment?.CachedRelativePath))
        {
            var cachedPath = Path.Combine(_environment.ContentRootPath, attachment.CachedRelativePath);
            if (System.IO.File.Exists(cachedPath))
                return cachedPath;
        }

        if (System.IO.File.Exists(fullPath))
        {
            await UpdateAttachmentCacheMetadataAsync(log, attachments, attachmentId, relativePath, ct);
            return fullPath;
        }

        var tokenResult = await _gmailTokenService.RefreshAccessTokenAsync(log?.GmailAccountId, ct);
        if (!tokenResult.Ok)
            return null;

        var client = _httpClientFactory.CreateClient();
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"https://gmail.googleapis.com/gmail/v1/users/me/messages/{Uri.EscapeDataString(messageId)}/attachments/{Uri.EscapeDataString(attachmentId)}");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenResult.AccessToken);

        using var response = await client.SendAsync(request, ct);
        var payload = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
            return null;

        var attachmentPayload = JsonSerializer.Deserialize<GmailAttachmentContentResponse>(payload, JsonOptions);
        if (attachmentPayload is null || string.IsNullOrWhiteSpace(attachmentPayload.Data))
            return null;

        var bytes = DecodeBase64UrlToBytes(attachmentPayload.Data);
        if (bytes.Length == 0)
            return null;

        await System.IO.File.WriteAllBytesAsync(fullPath, bytes, ct);
        await UpdateAttachmentCacheMetadataAsync(log, attachments, attachmentId, relativePath, ct);

        return fullPath;
    }

    private async Task UpdateAttachmentCacheMetadataAsync(
        GmailMessageLog? log,
        List<GmailAttachmentDescriptor> attachments,
        string attachmentId,
        string relativePath,
        CancellationToken ct)
    {
        if (log is null || attachments.Count == 0)
            return;

        var updated = false;
        var updatedAttachments = attachments
            .Select(item =>
            {
                if (!string.Equals(item.AttachmentId, attachmentId, StringComparison.Ordinal))
                    return item;

                updated = updated ||
                    !string.Equals(item.CachedRelativePath, relativePath, StringComparison.Ordinal) ||
                    item.CachedAtUtc is null;

                return item with
                {
                    CachedRelativePath = relativePath,
                    CachedAtUtc = DateTime.UtcNow,
                };
            })
            .ToList();

        if (!updated)
            return;

        log.AttachmentsJson = JsonSerializer.Serialize(updatedAttachments, JsonOptions);
        log.HasAttachments = updatedAttachments.Count > 0;
        log.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
    }

    private async Task CacheAttachmentOcrTextAsync(
        GmailMessageLog? log,
        string attachmentId,
        string ocrText,
        CancellationToken ct)
    {
        if (log is null || string.IsNullOrWhiteSpace(attachmentId) || string.IsNullOrWhiteSpace(ocrText))
            return;

        var attachments = DeserializeAttachments(log.AttachmentsJson);
        if (attachments.Count == 0)
            return;

        var now = DateTime.UtcNow;
        var updated = false;
        var nextAttachments = attachments
            .Select(item =>
            {
                if (!string.Equals(item.AttachmentId, attachmentId, StringComparison.Ordinal))
                    return item;

                updated = !string.Equals(item.OcrText, ocrText, StringComparison.Ordinal) || !item.OcrExtractedAtUtc.HasValue;
                return item with
                {
                    OcrText = ocrText,
                    OcrExtractedAtUtc = now,
                };
            })
            .ToList();

        if (!updated)
            return;

        log.AttachmentsJson = JsonSerializer.Serialize(nextAttachments, JsonOptions);
        log.UpdatedAt = now;
        await _db.SaveChangesAsync(ct);
    }

    private async Task<List<PoDetectionResponse>> BuildPoDetectionsAsync(
        List<GmailMessageLog> logs,
        CancellationToken ct)
    {
        var detections = new List<PoDetectionResponse>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var log in logs
                     .OrderByDescending(x => x.InternalDateMs ?? 0)
                     .ThenByDescending(x => x.Id))
        {
            AddTextDetections(
                detections,
                seen,
                log.GmailMessageId,
                log.GmailThreadId,
                log.Subject,
                "email",
                94,
                "Matched in email subject",
                "Email subject",
                excludedValue: log.CorrelationId);

            AddTextDetections(
                detections,
                seen,
                log.GmailMessageId,
                log.GmailThreadId,
                log.Body,
                "email",
                90,
                "Matched in email body",
                "Email body",
                excludedValue: log.CorrelationId);

            AddTextDetections(
                detections,
                seen,
                log.GmailMessageId,
                log.GmailThreadId,
                log.Snippet,
                "email",
                82,
                "Matched in Gmail snippet",
                "Email snippet",
                excludedValue: log.CorrelationId);

            var attachments = DeserializeAttachments(log.AttachmentsJson);
            foreach (var attachment in attachments)
            {
                var attachmentSource = attachment.MimeType.StartsWith("image/", StringComparison.OrdinalIgnoreCase)
                    ? "image"
                    : string.Equals(attachment.MimeType, "application/pdf", StringComparison.OrdinalIgnoreCase)
                        ? "pdf"
                        : "email";

                AddTextDetections(
                    detections,
                    seen,
                    log.GmailMessageId,
                    log.GmailThreadId,
                    attachment.FileName,
                    attachmentSource,
                    attachmentSource == "image" ? 58 : 68,
                    $"Matched in attachment file name: {attachment.FileName}",
                    attachment.FileName,
                    attachment.FileName,
                    attachmentSource == "pdf" ? "pdf" : attachmentSource == "image" ? "image" : "text",
                    attachment.AttachmentId,
                    attachment.MimeType,
                    excludedValue: log.CorrelationId);

                if (attachmentSource == "image" &&
                    !string.IsNullOrWhiteSpace(attachment.AttachmentId) &&
                    !string.IsNullOrWhiteSpace(log.GmailMessageId))
                {
                    var ocrText = attachment.OcrText;
                    if (string.IsNullOrWhiteSpace(ocrText))
                    {
                        var imagePath = await EnsureAttachmentCachedAsync(
                            log.GmailMessageId,
                            attachment.AttachmentId,
                            attachment.FileName,
                            attachment.MimeType,
                            ct);
                        if (!string.IsNullOrWhiteSpace(imagePath) && System.IO.File.Exists(imagePath))
                        {
                            ocrText = await _imageOcrService.ExtractTextAsync(imagePath, ct);
                            if (!string.IsNullOrWhiteSpace(ocrText))
                                await CacheAttachmentOcrTextAsync(log, attachment.AttachmentId, ocrText, ct);
                        }
                    }

                    if (!string.IsNullOrWhiteSpace(ocrText))
                    {
                        AddTextDetections(
                            detections,
                            seen,
                            log.GmailMessageId,
                            log.GmailThreadId,
                            ocrText,
                            "image",
                                84,
                                $"Matched by image OCR: {attachment.FileName}",
                                attachment.FileName,
                                attachment.FileName,
                                "image",
                                attachment.AttachmentId,
                                attachment.MimeType,
                                excludedValue: log.CorrelationId);
                    }
                }

                if (!string.Equals(attachment.MimeType, "application/pdf", StringComparison.OrdinalIgnoreCase) ||
                    string.IsNullOrWhiteSpace(attachment.AttachmentId) ||
                    string.IsNullOrWhiteSpace(log.GmailMessageId))
                    continue;

                var cachedPath = await EnsureAttachmentCachedAsync(
                    log.GmailMessageId,
                    attachment.AttachmentId,
                    attachment.FileName,
                    attachment.MimeType,
                    ct);
                if (string.IsNullOrWhiteSpace(cachedPath) || !System.IO.File.Exists(cachedPath))
                    continue;

                var pdfText = TryExtractPdfText(cachedPath);
                var pdfDetectionLabel = $"Matched in PDF attachment (text layer): {attachment.FileName}";
                var pdfPreviewLabel = $"{attachment.FileName} · PDF text";
                if (string.IsNullOrWhiteSpace(pdfText))
                {
                    var pdfPreviewPath = await RenderPdfPreviewForOcrAsync(cachedPath, ct);
                    if (!string.IsNullOrWhiteSpace(pdfPreviewPath) && System.IO.File.Exists(pdfPreviewPath))
                    {
                        pdfText = await _imageOcrService.ExtractTextAsync(pdfPreviewPath, ct);
                        if (!string.IsNullOrWhiteSpace(pdfText))
                        {
                            pdfDetectionLabel = $"Matched in PDF attachment (OCR): {attachment.FileName}";
                            pdfPreviewLabel = $"{attachment.FileName} · PDF OCR";
                        }
                    }
                }
                if (string.IsNullOrWhiteSpace(pdfText))
                    continue;

                AddTextDetections(
                    detections,
                    seen,
                    log.GmailMessageId,
                    log.GmailThreadId,
                    pdfText,
                    "pdf",
                    88,
                    pdfDetectionLabel,
                    pdfPreviewLabel,
                    attachment.FileName,
                    "pdf",
                    attachment.AttachmentId,
                    attachment.MimeType,
                    excludedValue: log.CorrelationId);
            }
        }

        return detections
            .OrderByDescending(x => x.Confidence)
            .ThenByDescending(x => x.TimestampSort)
            .Select(x => x with { TimestampSort = 0 })
            .ToList();
    }

    private static void AddTextDetections(
        List<PoDetectionResponse> detections,
        HashSet<string> seen,
        string? gmailMessageId,
        string? gmailThreadId,
        string? text,
        string source,
        int confidence,
        string evidenceLabel,
        string previewLabel,
        string? attachmentFileName = null,
        string previewType = "text",
        string? attachmentId = null,
        string? attachmentMimeType = null,
        string? excludedValue = null)
    {
        if (string.IsNullOrWhiteSpace(text))
            return;

        foreach (var match in ExtractPoMatches(text))
        {
            if (IsExcludedPoMatch(match.NormalizedPoNumber, excludedValue))
                continue;

            var key = string.Join(
                "|",
                match.NormalizedPoNumber,
                source,
                previewLabel,
                attachmentFileName ?? "",
                attachmentId ?? "",
                gmailMessageId ?? "");
            if (!seen.Add(key))
                continue;

            detections.Add(new PoDetectionResponse(
                Id: $"po-{SanitizeDetectionKey(key)}",
                PoNumber: match.PoNumber,
                Source: source,
                Confidence: confidence,
                EvidencePreview: $"{evidenceLabel}: {BuildEvidencePreview(text, match.StartIndex, match.MatchLength)}",
                PreviewLabel: previewLabel,
                PreviewType: previewType,
                Status: "pending",
                GmailMessageId: gmailMessageId ?? "",
                GmailThreadId: gmailThreadId ?? "",
                AttachmentFileName: attachmentFileName ?? "",
                AttachmentId: attachmentId ?? "",
                AttachmentMimeType: attachmentMimeType ?? "",
                TimestampSort: detections.Count + 1));
        }
    }

    private static List<PoMatch> ExtractPoMatches(string text)
    {
        var results = new List<PoMatch>();
        if (string.IsNullOrWhiteSpace(text))
            return results;

        var patterns = new[]
        {
            @"\bP(?:\.|\s*)?O(?:\.|\s*)?#?\s*[:\-]?\s*(?=[A-Z0-9\-\/]*\d)[A-Z0-9][A-Z0-9\-\/]{1,30}\b",
            @"\bP(?:\.|\s*)?O(?:\.|\s*)?\s+Number\s*[:\-]?\s*(?=[A-Z0-9\-\/]*\d)[A-Z0-9][A-Z0-9\-\/]{1,40}\b",
            @"\bPurchase\s+Order\s*[:#-]?\s*(?=[A-Z0-9\-\/]*\d)[A-Z0-9][A-Z0-9\-\/]{1,30}\b",
            @"\b[A-Z0-9]+-CPO-\d{3,}\b",
        };

        foreach (var pattern in patterns)
        {
            foreach (System.Text.RegularExpressions.Match regexMatch in System.Text.RegularExpressions.Regex.Matches(
                         text,
                         pattern,
                         System.Text.RegularExpressions.RegexOptions.IgnoreCase))
            {
                if (!regexMatch.Success)
                    continue;

                var raw = NormalizePoDisplay(regexMatch.Value);
                var normalized = NormalizePoKey(raw);
                if (string.IsNullOrWhiteSpace(raw) || string.IsNullOrWhiteSpace(normalized))
                    continue;

                results.Add(new PoMatch(raw, normalized, regexMatch.Index, regexMatch.Length));
            }
        }

        return results
            .GroupBy(x => new { x.NormalizedPoNumber, x.StartIndex })
            .Select(group => group.First())
            .ToList();
    }

    private static string NormalizePoDisplay(string value)
    {
        var trimmed = value.Trim();
        trimmed = System.Text.RegularExpressions.Regex.Replace(trimmed, @"\s+", " ");
        trimmed = System.Text.RegularExpressions.Regex.Replace(trimmed, @"^(Purchase\s+Order)\s*", "PO ", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        trimmed = System.Text.RegularExpressions.Regex.Replace(trimmed, @"^P\s*\.?\s*O\s*\.?\s*", "PO ", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        trimmed = System.Text.RegularExpressions.Regex.Replace(trimmed, @"^PO\s*#\s*", "PO ", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        trimmed = System.Text.RegularExpressions.Regex.Replace(trimmed, @"^PO\s*:\s*", "PO ", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        return trimmed.Trim();
    }

    private static string NormalizePoKey(string value) =>
        System.Text.RegularExpressions.Regex.Replace(value, @"[^A-Z0-9]+", "", System.Text.RegularExpressions.RegexOptions.IgnoreCase)
            .ToUpperInvariant();

    private static string BuildEvidencePreview(string text, int startIndex, int matchLength)
    {
        if (string.IsNullOrWhiteSpace(text))
            return "";

        var safeStart = Math.Max(0, startIndex - 36);
        var safeLength = Math.Min(text.Length - safeStart, Math.Max(matchLength + 72, 96));
        var excerpt = text.Substring(safeStart, safeLength).Replace('\r', ' ').Replace('\n', ' ').Trim();
        excerpt = System.Text.RegularExpressions.Regex.Replace(excerpt, @"\s+", " ");
        return excerpt.Length > 180 ? excerpt[..180] + "..." : excerpt;
    }

    private static string? TryExtractPdfText(string path)
    {
        try
        {
            using var document = PdfDocument.Open(path);
            var builder = new StringBuilder();
            foreach (var page in document.GetPages().Take(3))
            {
                if (builder.Length > 0)
                    builder.AppendLine();
                builder.Append(page.Text);
            }

            var text = builder.ToString().Trim();
            return string.IsNullOrWhiteSpace(text) ? null : text;
        }
        catch
        {
            return null;
        }
    }

    private async Task<string?> RenderPdfPreviewForOcrAsync(string pdfPath, CancellationToken ct)
    {
        if (!_imageOcrService.IsEnabled || !OperatingSystem.IsMacOS() || !System.IO.File.Exists(pdfPath) || !System.IO.File.Exists("/usr/bin/qlmanage"))
            return null;

        var previewDirectory = Path.Combine(_environment.ContentRootPath, "App_Data", "pdf-ocr-previews");
        Directory.CreateDirectory(previewDirectory);

        var expectedPrefix = Path.GetFileName(pdfPath);
        var existingPreview = Directory.GetFiles(previewDirectory, $"{expectedPrefix}*.png")
            .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
            .FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(existingPreview) && System.IO.File.Exists(existingPreview))
            return existingPreview;

        using var process = new Process();
        process.StartInfo = new ProcessStartInfo
        {
            FileName = "/usr/bin/qlmanage",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        process.StartInfo.ArgumentList.Add("-t");
        process.StartInfo.ArgumentList.Add("-s");
        process.StartInfo.ArgumentList.Add("2000");
        process.StartInfo.ArgumentList.Add("-o");
        process.StartInfo.ArgumentList.Add(previewDirectory);
        process.StartInfo.ArgumentList.Add(pdfPath);

        process.Start();
        try
        {
            await process.WaitForExitAsync(ct);
        }
        catch (OperationCanceledException)
        {
            try
            {
                if (!process.HasExited)
                    process.Kill(entireProcessTree: true);
            }
            catch
            {
            }
            return null;
        }

        if (process.ExitCode != 0)
            return null;

        return Directory.GetFiles(previewDirectory, $"{expectedPrefix}*.png")
            .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
            .FirstOrDefault(path => System.IO.File.Exists(path));
    }

    private static string SanitizeDetectionKey(string value)
    {
        var safe = System.Text.RegularExpressions.Regex.Replace(value, @"[^A-Z0-9]+", "-", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        return safe.Trim('-').ToLowerInvariant();
    }

    public sealed record GmailSendRequest(
        string To,
        string Subject,
        string? Body,
        string? CorrelationId,
        string? ThreadId,
        string? ReplyToRfcMessageId,
        string? ReferencesHeader,
        long? GmailAccountId);
    public sealed record GmailThreadReadRequest(string CounterpartyEmail, string? CorrelationId, long? GmailAccountId);
    public sealed record PoDetectionResponse(
        string Id,
        string PoNumber,
        string Source,
        int Confidence,
        string EvidencePreview,
        string PreviewLabel,
        string PreviewType,
        string Status,
        string GmailMessageId,
        string GmailThreadId,
        string AttachmentFileName,
        string AttachmentId,
        string AttachmentMimeType,
        long TimestampSort);

    private async Task UpsertMessageLogAsync(
        string gmailMessageId,
        string? gmailThreadId,
        long? internalDateMs,
        long? gmailAccountId,
        string? gmailAccountEmail,
        string direction,
        string counterpartyEmail,
        string? fromAddress,
        string? toAddress,
        string? subject,
        string? body,
        string? snippet,
        string? correlationId,
        string? rfcMessageId,
        string? referencesHeader,
        List<GmailAttachmentDescriptor> attachments,
        bool isSystemInitiated,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(gmailMessageId))
            return;

        var existing = await _db.GmailMessageLogs.FirstOrDefaultAsync(
            x => x.GmailMessageId == gmailMessageId && x.GmailAccountId == gmailAccountId,
            ct);
        if (existing is null)
        {
            existing = new GmailMessageLog
            {
                GmailMessageId = gmailMessageId,
                CreatedAt = DateTime.UtcNow,
            };
            _db.GmailMessageLogs.Add(existing);
        }

        existing.GmailAccountId = gmailAccountId;
        existing.GmailAccountEmail = NullIfBlank(gmailAccountEmail);
        existing.GmailThreadId = gmailThreadId?.Trim();
        existing.InternalDateMs = internalDateMs;
        existing.Direction = direction.Trim();
        existing.CounterpartyEmail = counterpartyEmail.Trim();
        existing.FromAddress = NullIfBlank(fromAddress);
        existing.ToAddress = NullIfBlank(toAddress);
        existing.Subject = NullIfBlank(subject);
        existing.Body = NullIfBlank(body);
        existing.Snippet = NullIfBlank(snippet);
        existing.CorrelationId = NullIfBlank(correlationId);
        existing.RfcMessageId = NullIfBlank(rfcMessageId);
        existing.ReferencesHeader = NullIfBlank(referencesHeader);
        existing.HasAttachments = attachments.Count > 0;
        existing.AttachmentsJson = attachments.Count > 0
            ? JsonSerializer.Serialize(MergeAttachmentMetadata(existing.AttachmentsJson, attachments), JsonOptions)
            : null;
        existing.DetectedPoNumber = ExtractPoNumber(correlationId, subject, body, snippet);
        existing.IsSystemInitiated = isSystemInitiated || existing.IsSystemInitiated;
        if (existing.Id == 0)
        {
            existing.IsRead = !string.Equals(direction, "reply", StringComparison.OrdinalIgnoreCase);
            existing.ReadAt = existing.IsRead ? DateTime.UtcNow : null;
        }
        existing.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);
    }

    private static string? NullIfBlank(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static List<GmailAttachmentDescriptor> MergeAttachmentMetadata(
        string? existingAttachmentsJson,
        List<GmailAttachmentDescriptor> incomingAttachments)
    {
        if (incomingAttachments.Count == 0)
            return incomingAttachments;

        var existingByKey = DeserializeAttachments(existingAttachmentsJson)
            .GroupBy(BuildAttachmentMergeKey)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);

        return incomingAttachments
            .Select(item =>
            {
                if (!existingByKey.TryGetValue(BuildAttachmentMergeKey(item), out var existing))
                    return item;

                return item with
                {
                    CachedRelativePath = item.CachedRelativePath ?? existing.CachedRelativePath,
                    CachedAtUtc = item.CachedAtUtc ?? existing.CachedAtUtc,
                    OcrText = item.OcrText ?? existing.OcrText,
                    OcrExtractedAtUtc = item.OcrExtractedAtUtc ?? existing.OcrExtractedAtUtc,
                };
            })
            .ToList();
    }

    private static string BuildAttachmentMergeKey(GmailAttachmentDescriptor attachment) =>
        $"{attachment.AttachmentId ?? ""}|{attachment.FileName}|{attachment.MimeType}";

    private static IQueryable<GmailMessageLog> FilterLogsByAccount(IQueryable<GmailMessageLog> query, long? gmailAccountId) =>
        gmailAccountId.HasValue
            ? query.Where(x => x.GmailAccountId == gmailAccountId.Value)
            : query.Where(x => x.GmailAccountId == null);

    private static object MapAccount(GmailAccount account) => new
    {
        id = account.Id,
        email = account.Email,
        isActive = account.IsActive,
        isDefault = account.IsDefault,
        scope = account.Scope,
        accessTokenExpiresAt = account.AccessTokenExpiresAt,
        createdAt = account.CreatedAt,
        updatedAt = account.UpdatedAt,
    };

    private static string? NormalizeReturnUrl(string? returnUrl)
    {
        if (string.IsNullOrWhiteSpace(returnUrl))
            return null;

        if (Uri.TryCreate(returnUrl, UriKind.Absolute, out var absolute)
            && (absolute.Scheme == Uri.UriSchemeHttp || absolute.Scheme == Uri.UriSchemeHttps))
            return absolute.ToString();

        return null;
    }

    private static string BuildReturnUrl(string returnUrl, string integration, string status, string message)
    {
        var separator = returnUrl.Contains('?') ? "&" : "?";
        return $"{returnUrl}{separator}integration={Uri.EscapeDataString(integration)}&status={Uri.EscapeDataString(status)}&message={Uri.EscapeDataString(message)}";
    }

    private sealed class OAuthStateEntry
    {
        public string? ReturnUrl { get; init; }
    }

    private string? ValidateConfiguration()
    {
        if (string.IsNullOrWhiteSpace(_options.ClientId))
            return "Missing Gmail:ClientId.";
        if (string.IsNullOrWhiteSpace(_options.ClientSecret))
            return "Missing Gmail:ClientSecret.";
        if (string.IsNullOrWhiteSpace(_options.RedirectUri))
            return "Missing Gmail:RedirectUri.";
        return null;
    }

    private string BuildAuthorizeUrl(string state, string scopes)
    {
        var query = new Dictionary<string, string?>
        {
            ["client_id"] = _options.ClientId,
            ["redirect_uri"] = _options.RedirectUri,
            ["response_type"] = "code",
            ["scope"] = scopes,
            ["access_type"] = "offline",
            ["prompt"] = "consent",
            ["include_granted_scopes"] = "true",
            ["state"] = state,
        };

        var queryString = string.Join("&", query.Select(x =>
            $"{Uri.EscapeDataString(x.Key)}={Uri.EscapeDataString(x.Value ?? "")}"));

        return $"https://accounts.google.com/o/oauth2/v2/auth?{queryString}";
    }

    private async Task<GmailExchangeResult> ExchangeCodeForTokenAsync(string code, CancellationToken ct)
    {
        var client = _httpClientFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://oauth2.googleapis.com/token");
        request.Content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["client_id"] = _options.ClientId,
            ["client_secret"] = _options.ClientSecret,
            ["code"] = code,
            ["grant_type"] = "authorization_code",
            ["redirect_uri"] = _options.RedirectUri,
        });

        using var response = await client.SendAsync(request, ct);
        var payload = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
            return GmailExchangeResult.Fail((int)response.StatusCode, payload);

        var token = JsonSerializer.Deserialize<GmailTokenResponse>(payload, JsonOptions);
        if (token is null || string.IsNullOrWhiteSpace(token.AccessToken))
            return GmailExchangeResult.Fail(502, "Token response was empty or invalid.");
        if (string.IsNullOrWhiteSpace(token.RefreshToken))
            return GmailExchangeResult.Fail(502, "Google did not return a refresh token. Re-consent with prompt=consent and access_type=offline.");

        return GmailExchangeResult.Success(
            token.AccessToken,
            token.RefreshToken,
            token.ExpiresIn,
            token.Scope ?? "");
    }

    private async Task<GmailProfileResult> LoadProfileAsync(string accessToken, CancellationToken ct)
    {
        var client = _httpClientFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "https://www.googleapis.com/oauth2/v2/userinfo");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        using var response = await client.SendAsync(request, ct);
        var payload = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
            return GmailProfileResult.Fail((int)response.StatusCode, payload);

        var profile = JsonSerializer.Deserialize<GmailUserInfoResponse>(payload, JsonOptions);
        if (profile is null || string.IsNullOrWhiteSpace(profile.Email))
            return GmailProfileResult.Fail(502, "Unable to resolve Gmail profile email.");

        return GmailProfileResult.Success(profile.Email);
    }

    private string ResolveScopes(string? scopes) =>
        string.IsNullOrWhiteSpace(scopes)
            ? string.Join(" ", SplitScopes(_options.Scopes))
            : string.Join(" ", SplitScopes(scopes));

    private static string[] SplitScopes(string? scopes) =>
        (scopes ?? "")
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Distinct(StringComparer.Ordinal)
            .ToArray();

    private static string[] SplitEmailAddresses(string? value) =>
        (value ?? "")
            .Split(new[] { ',', ';', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

    private static string[] NormalizeRecipientAddresses(string? value) =>
        SplitEmailAddresses(value)
            .Select(item =>
            {
                var angleMatch = System.Text.RegularExpressions.Regex.Match(item, "<([^>]+)>");
                return angleMatch.Success ? angleMatch.Groups[1].Value.Trim() : item.Trim();
            })
            .Where(item => System.Text.RegularExpressions.Regex.IsMatch(
                item,
                @"^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

    private static string NormalizeRecipientListForComparison(IEnumerable<string> recipients) =>
        string.Join(
            ",",
            recipients
                .Select(item => item.Trim().ToLowerInvariant())
                .Where(item => !string.IsNullOrWhiteSpace(item))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(item => item, StringComparer.OrdinalIgnoreCase));

    private static string NormalizeRecipientListForComparison(string? value) =>
        NormalizeRecipientListForComparison(NormalizeRecipientAddresses(value));

    private static string BuildRawMessage(
        string to,
        string subject,
        string body,
        string? replyToRfcMessageId,
        string? referencesHeader)
    {
        var headers = new List<string>
        {
            $"To: {to}",
            $"Subject: {EncodeMimeHeader(subject)}",
            "Content-Type: text/plain; charset=utf-8",
            "MIME-Version: 1.0",
        };

        if (!string.IsNullOrWhiteSpace(replyToRfcMessageId))
            headers.Add($"In-Reply-To: {replyToRfcMessageId.Trim()}");

        var normalizedReferences = BuildReferencesHeader(referencesHeader, replyToRfcMessageId);
        if (!string.IsNullOrWhiteSpace(normalizedReferences))
            headers.Add($"References: {normalizedReferences}");

        headers.Add("");
        headers.Add(body);

        var mime = string.Join("\r\n", headers);
        var bytes = Encoding.UTF8.GetBytes(mime);
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    private static string? BuildReferencesHeader(string? referencesHeader, string? replyToRfcMessageId)
    {
        var values = new List<string>();
        if (!string.IsNullOrWhiteSpace(referencesHeader))
            values.AddRange(referencesHeader.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
        if (!string.IsNullOrWhiteSpace(replyToRfcMessageId))
            values.Add(replyToRfcMessageId.Trim());

        var normalized = values
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        return normalized.Length == 0 ? null : string.Join(" ", normalized);
    }

    private static string GetHeader(GmailMessagePart? payload, string name)
    {
        if (payload?.Headers is null) return "";
        return payload.Headers.FirstOrDefault(x => string.Equals(x.Name, name, StringComparison.OrdinalIgnoreCase))?.Value ?? "";
    }

    private static string ExtractBody(GmailMessagePart? payload)
    {
        if (payload is null) return "";

        if (string.Equals(payload.MimeType, "text/plain", StringComparison.OrdinalIgnoreCase) &&
            !string.IsNullOrWhiteSpace(payload.Body?.Data))
            return DecodeBase64Url(payload.Body.Data);

        foreach (var part in payload.Parts ?? [])
        {
            var body = ExtractBody(part);
            if (!string.IsNullOrWhiteSpace(body))
                return body;
        }

        if (!string.IsNullOrWhiteSpace(payload.Body?.Data))
            return DecodeBase64Url(payload.Body.Data);

        return "";
    }

    private async Task<GmailMessageDetailContext?> LoadMessageDetailsAsync(
        HttpClient client,
        string accessToken,
        string gmailMessageId,
        CancellationToken ct)
    {
        using var messageRequest = new HttpRequestMessage(
            HttpMethod.Get,
            $"https://gmail.googleapis.com/gmail/v1/users/me/messages/{Uri.EscapeDataString(gmailMessageId)}?format=full");
        messageRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        using var messageResponse = await client.SendAsync(messageRequest, ct);
        if (!messageResponse.IsSuccessStatusCode)
            return null;

        var payload = await messageResponse.Content.ReadAsStringAsync(ct);
        var message = JsonSerializer.Deserialize<GmailMessageResponse>(payload, JsonOptions);
        if (message is null)
            return null;

        return new GmailMessageDetailContext(
            GetHeader(message.Payload, "Message-Id"),
            GetHeader(message.Payload, "References"));
    }

    private static List<GmailAttachmentDescriptor> ExtractAttachments(GmailMessagePart? payload)
    {
        var attachments = new List<GmailAttachmentDescriptor>();
        AppendAttachments(payload, attachments);
        return attachments;
    }

    private static void AppendAttachments(GmailMessagePart? payload, List<GmailAttachmentDescriptor> attachments)
    {
        if (payload is null)
            return;

        if (!string.IsNullOrWhiteSpace(payload.Filename) || !string.IsNullOrWhiteSpace(payload.Body?.AttachmentId))
        {
            attachments.Add(new GmailAttachmentDescriptor(
                payload.Filename ?? "attachment",
                payload.MimeType ?? "application/octet-stream",
                payload.Body?.Size,
                payload.Body?.AttachmentId));
        }

        foreach (var part in payload.Parts ?? [])
            AppendAttachments(part, attachments);
    }

    private static List<GmailAttachmentDescriptor> DeserializeAttachments(string? attachmentsJson)
    {
        if (string.IsNullOrWhiteSpace(attachmentsJson))
            return [];

        try
        {
            return JsonSerializer.Deserialize<List<GmailAttachmentDescriptor>>(attachmentsJson, JsonOptions) ?? [];
        }
        catch
        {
            return [];
        }
    }

    private static string SanitizeFileName(string value)
    {
        var normalized = string.IsNullOrWhiteSpace(value) ? "attachment" : value.Trim();
        var invalidChars = Path.GetInvalidFileNameChars();
        var cleaned = new string(normalized.Select(ch => invalidChars.Contains(ch) ? '_' : ch).ToArray()).Trim();
        return string.IsNullOrWhiteSpace(cleaned) ? "attachment" : cleaned;
    }

    private static string ResolveFileExtension(string fileName, string mimeType)
    {
        var existingExtension = Path.GetExtension(fileName);
        if (!string.IsNullOrWhiteSpace(existingExtension))
            return existingExtension;

        return mimeType.ToLowerInvariant() switch
        {
            "application/pdf" => ".pdf",
            "image/png" => ".png",
            "image/jpeg" => ".jpg",
            "image/jpg" => ".jpg",
            "image/gif" => ".gif",
            "text/plain" => ".txt",
            _ => ".bin",
        };
    }

    private static string ComputeShortHash(string value, int length)
    {
        if (length <= 0)
            return "";

        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(value));
        var hex = Convert.ToHexString(bytes).ToLowerInvariant();
        return hex.Length <= length ? hex : hex[..length];
    }

    private static string DecodeBase64Url(string value)
    {
        var bytes = DecodeBase64UrlToBytes(value);
        if (bytes.Length == 0)
            return "";

        try
        {
            return Encoding.UTF8.GetString(bytes);
        }
        catch
        {
            return "";
        }
    }

    private static byte[] DecodeBase64UrlToBytes(string value)
    {
        var normalized = value.Replace('-', '+').Replace('_', '/');
        normalized = normalized.PadRight(normalized.Length + ((4 - normalized.Length % 4) % 4), '=');
        try
        {
            return Convert.FromBase64String(normalized);
        }
        catch
        {
            return [];
        }
    }

    private static string NormalizeDateHeader(string value)
    {
        if (DateTimeOffset.TryParse(value, out var parsed))
            return DateTimeHelper.FormatNz(parsed.UtcDateTime);
        return value;
    }

    private static string NormalizeInternalDate(long? value)
    {
        if (!value.HasValue || value.Value <= 0) return "";
        try
        {
            return DateTimeHelper.FormatNz(DateTimeOffset.FromUnixTimeMilliseconds(value.Value).UtcDateTime);
        }
        catch
        {
            return "";
        }
    }

    private static string? ExtractPoNumber(string? excludedValue, params string?[] values)
    {
        foreach (var value in values)
        {
            if (string.IsNullOrWhiteSpace(value)) continue;

            foreach (var match in ExtractPoMatches(value))
            {
                if (IsExcludedPoMatch(match.NormalizedPoNumber, excludedValue))
                    continue;

                return match.PoNumber.Trim();
            }
        }
        return null;
    }

    private static bool IsExcludedPoMatch(string normalizedPoNumber, string? excludedValue)
    {
        if (string.IsNullOrWhiteSpace(normalizedPoNumber) || string.IsNullOrWhiteSpace(excludedValue))
            return false;

        return string.Equals(normalizedPoNumber, NormalizePoKey(excludedValue), StringComparison.OrdinalIgnoreCase);
    }

    private static string DecodeMimeWords(string value)
    {
        if (string.IsNullOrWhiteSpace(value) || !value.Contains("=?"))
            return value;

        try
        {
            var pattern = @"=\?([^?]+)\?([bBqQ])\?([^?]+)\?=";
            return System.Text.RegularExpressions.Regex.Replace(value, pattern, match =>
            {
                var charset = match.Groups[1].Value;
                var encoding = match.Groups[2].Value;
                var text = match.Groups[3].Value;
                var bytes = encoding.Equals("B", StringComparison.OrdinalIgnoreCase)
                    ? Convert.FromBase64String(text)
                    : Encoding.UTF8.GetBytes(text.Replace('_', ' '));
                return Encoding.GetEncoding(charset).GetString(bytes);
            });
        }
        catch
        {
            return value;
        }
    }

    private static string EncodeMimeHeader(string value)
    {
        var base64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(value));
        return $"=?UTF-8?B?{base64}?=";
    }

    private sealed record GmailSendApiRequest(
        [property: JsonPropertyName("raw")] string Raw,
        [property: JsonPropertyName("threadId")] string? ThreadId);

    private sealed class GmailSendApiResponse
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = "";

        [JsonPropertyName("threadId")]
        public string ThreadId { get; set; } = "";

        [JsonPropertyName("internalDate")]
        [JsonNumberHandling(JsonNumberHandling.AllowReadingFromString)]
        public long? InternalDate { get; set; }
    }

    private sealed class GmailMessageListResponse
    {
        [JsonPropertyName("messages")]
        public List<GmailMessageRef>? Messages { get; set; }
    }

    private sealed class GmailMessageRef
    {
        [JsonPropertyName("id")]
        public string? Id { get; set; }
    }

    private sealed class GmailMessageResponse
    {
        [JsonPropertyName("id")]
        public string? Id { get; set; }

        [JsonPropertyName("threadId")]
        public string? ThreadId { get; set; }

        [JsonPropertyName("internalDate")]
        [JsonNumberHandling(JsonNumberHandling.AllowReadingFromString)]
        public long? InternalDate { get; set; }

        [JsonPropertyName("snippet")]
        public string? Snippet { get; set; }

        [JsonPropertyName("payload")]
        public GmailMessagePart? Payload { get; set; }
    }

    private sealed class GmailMessagePart
    {
        [JsonPropertyName("mimeType")]
        public string? MimeType { get; set; }

        [JsonPropertyName("filename")]
        public string? Filename { get; set; }

        [JsonPropertyName("headers")]
        public List<GmailHeader>? Headers { get; set; }

        [JsonPropertyName("parts")]
        public List<GmailMessagePart>? Parts { get; set; }

        [JsonPropertyName("body")]
        public GmailMessageBody? Body { get; set; }
    }

    private sealed class GmailHeader
    {
        [JsonPropertyName("name")]
        public string? Name { get; set; }

        [JsonPropertyName("value")]
        public string? Value { get; set; }
    }

    private sealed class GmailMessageBody
    {
        [JsonPropertyName("data")]
        public string? Data { get; set; }

        [JsonPropertyName("attachmentId")]
        public string? AttachmentId { get; set; }

        [JsonPropertyName("size")]
        public int? Size { get; set; }
    }

    private sealed class GmailAttachmentContentResponse
    {
        [JsonPropertyName("data")]
        public string? Data { get; set; }

        [JsonPropertyName("size")]
        public int? Size { get; set; }
    }

    public sealed record GmailThreadEventResponse(
        string Id,
        string Type,
        string Timestamp,
        string Description,
        string From,
        string To,
        string Subject,
        string Body,
        string ThreadId,
        bool Unread,
        string DetectedPoNumber,
        string RfcMessageId,
        string ReferencesHeader,
        List<GmailAttachmentDescriptor> Attachments,
        bool IsSystemInitiated
    );

    public sealed record GmailThreadResponse(
        List<GmailThreadEventResponse> Events,
        int UnreadReplyCount,
        bool HasReply,
        bool HasPo,
        string DetectedPoNumber,
        string LastReplyTimestamp,
        string SyncWarning,
        List<PoDetectionResponse> Detections,
        bool HasExternalDraftSend
    );

    private sealed class GmailTokenResponse
    {
        [JsonPropertyName("access_token")]
        public string AccessToken { get; set; } = "";

        [JsonPropertyName("refresh_token")]
        public string? RefreshToken { get; set; }

        [JsonPropertyName("expires_in")]
        public int ExpiresIn { get; set; }

        [JsonPropertyName("scope")]
        public string? Scope { get; set; }
    }

    private sealed class GmailUserInfoResponse
    {
        [JsonPropertyName("email")]
        public string Email { get; set; } = "";
    }

    public sealed record GmailAttachmentDescriptor(
        string FileName,
        string MimeType,
        int? Size,
        string? AttachmentId,
        string? CachedRelativePath = null,
        DateTime? CachedAtUtc = null,
        string? OcrText = null,
        DateTime? OcrExtractedAtUtc = null);

    private sealed record PoMatch(
        string PoNumber,
        string NormalizedPoNumber,
        int StartIndex,
        int MatchLength);

    private sealed record GmailMessageDetailContext(
        string? RfcMessageId,
        string? ReferencesHeader);

    private sealed class GmailExchangeResult
    {
        public bool Ok { get; private init; }
        public int StatusCode { get; private init; }
        public string? Error { get; private init; }
        public string AccessToken { get; private init; } = "";
        public string RefreshToken { get; private init; } = "";
        public int ExpiresIn { get; private init; }
        public string Scope { get; private init; } = "";

        public static GmailExchangeResult Fail(int statusCode, string error) =>
            new()
            {
                Ok = false,
                StatusCode = statusCode,
                Error = error,
            };

        public static GmailExchangeResult Success(
            string accessToken,
            string refreshToken,
            int expiresIn,
            string scope) =>
            new()
            {
                Ok = true,
                StatusCode = 200,
                AccessToken = accessToken,
                RefreshToken = refreshToken,
                ExpiresIn = expiresIn,
                Scope = scope,
            };
    }

    private sealed class GmailProfileResult
    {
        public bool Ok { get; private init; }
        public int StatusCode { get; private init; }
        public string? Error { get; private init; }
        public string Email { get; private init; } = "";

        public static GmailProfileResult Fail(int statusCode, string error) =>
            new()
            {
                Ok = false,
                StatusCode = statusCode,
                Error = error,
            };

        public static GmailProfileResult Success(string email) =>
            new()
            {
                Ok = true,
                StatusCode = 200,
                Email = email,
            };
    }
}
