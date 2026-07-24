using System.Buffers.Binary;
using System.Diagnostics;
using System.Globalization;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Workshop.Api.Data;
using Workshop.Api.DTOs;
using Workshop.Api.Models;
using Workshop.Api.Options;

namespace Workshop.Api.Services;

public sealed class JobInvoiceService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private const string InvoiceEmailLogoContentId = "nz-auto-tech-logo@nzautotech";

    private readonly AppDbContext _db;
    private readonly ReferenceDataCacheService _referenceDataCache;
    private readonly ServiceCatalogService _serviceCatalogService;
    private readonly XeroInvoiceService _xeroInvoiceService;
    private readonly XeroPaymentService _xeroPaymentService;
    private readonly GmailAccountService _gmailAccountService;
    private readonly GmailMessageSenderService _gmailMessageSenderService;
    private readonly NpgsqlDataSource _dataSource;
    private readonly JobLifecycleService _jobLifecycleService;
    private readonly XeroPaymentOptions _xeroPaymentOptions;
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<JobInvoiceService> _logger;

    public JobInvoiceService(
        AppDbContext db,
        ReferenceDataCacheService referenceDataCache,
        ServiceCatalogService serviceCatalogService,
        XeroInvoiceService xeroInvoiceService,
        XeroPaymentService xeroPaymentService,
        GmailAccountService gmailAccountService,
        GmailMessageSenderService gmailMessageSenderService,
        NpgsqlDataSource dataSource,
        JobLifecycleService jobLifecycleService,
        Microsoft.Extensions.Options.IOptions<XeroPaymentOptions> xeroPaymentOptions,
        IWebHostEnvironment environment,
        ILogger<JobInvoiceService> logger)
    {
        _db = db;
        _referenceDataCache = referenceDataCache;
        _serviceCatalogService = serviceCatalogService;
        _xeroInvoiceService = xeroInvoiceService;
        _xeroPaymentService = xeroPaymentService;
        _gmailAccountService = gmailAccountService;
        _gmailMessageSenderService = gmailMessageSenderService;
        _dataSource = dataSource;
        _jobLifecycleService = jobLifecycleService;
        _xeroPaymentOptions = xeroPaymentOptions.Value;
        _environment = environment;
        _logger = logger;
    }

    private async Task EnsureJobInvoicePdfColumnsAsync(CancellationToken ct)
    {
        if (!_db.Database.IsRelational())
            return;

        await _db.Database.ExecuteSqlRawAsync("""
            ALTER TABLE IF EXISTS job_invoices
              ADD COLUMN IF NOT EXISTS pdf_content BYTEA,
              ADD COLUMN IF NOT EXISTS pdf_preview_content BYTEA,
              ADD COLUMN IF NOT EXISTS pdf_file_path TEXT,
              ADD COLUMN IF NOT EXISTS pdf_preview_path TEXT,
              ADD COLUMN IF NOT EXISTS pdf_downloaded_at TIMESTAMPTZ,
              ADD COLUMN IF NOT EXISTS pdf_preview_generated_at TIMESTAMPTZ;
        """, ct);
    }

    public sealed record ServiceSelectionSnapshot(long ServiceCatalogItemId, string ServiceNameSnapshot);

    public async Task<JobInvoiceCreateResult> CreateDraftForJobAsync(long jobId, CancellationToken ct)
    {
        try
        {
            await EnsureJobInvoicePdfColumnsAsync(ct);
            var totalStopwatch = Stopwatch.StartNew();

            var existingLookupStopwatch = Stopwatch.StartNew();
            var existing = await _db.JobInvoices.AsNoTracking().FirstOrDefaultAsync(x => x.JobId == jobId, ct);
            existingLookupStopwatch.Stop();
            _logger.LogInformation(
                "Job invoice segment {Segment} completed in {ElapsedMs} ms for job {JobId}",
                "existing_lookup",
                existingLookupStopwatch.Elapsed.TotalMilliseconds,
                jobId);
            if (existing is not null)
            {
                totalStopwatch.Stop();
                _logger.LogInformation(
                    "Job invoice draft creation completed in {ElapsedMs} ms for job {JobId} (ok: {Ok}, alreadyExists: {AlreadyExists})",
                    totalStopwatch.Elapsed.TotalMilliseconds,
                    jobId,
                    true,
                    true);
                return JobInvoiceCreateResult.Success(existing, alreadyExists: true);
            }

            var dataLoadStopwatch = Stopwatch.StartNew();
            var row = await (
                    from j in _db.Jobs.AsNoTracking()
                    join v in _db.Vehicles.AsNoTracking() on j.VehicleId equals v.Id
                    join c in _db.Customers.AsNoTracking() on j.CustomerId equals c.Id
                    where j.Id == jobId
                    select new
                    {
                        Job = j,
                        Vehicle = v,
                        Customer = c,
                    }
                )
                .FirstOrDefaultAsync(ct);

            if (row is null)
            {
                totalStopwatch.Stop();
                _logger.LogInformation(
                    "Job invoice draft creation completed in {ElapsedMs} ms for job {JobId} (ok: {Ok}, alreadyExists: {AlreadyExists})",
                    totalStopwatch.Elapsed.TotalMilliseconds,
                    jobId,
                    false,
                    false);
                return JobInvoiceCreateResult.Fail(404, "Job not found.");
            }

            var partsServices = await _db.JobPartsServices.AsNoTracking()
                .Where(x => x.JobId == jobId)
                .OrderBy(x => x.CreatedAt)
                .ToListAsync(ct);
            var paintService = await _db.JobPaintServices.AsNoTracking()
                .Where(x => x.JobId == jobId)
                .OrderBy(x => x.CreatedAt)
                .FirstOrDefaultAsync(ct);
            var serviceSelections = await _db.JobServiceSelections.AsNoTracking()
                .Where(x => x.JobId == jobId)
                .OrderBy(x => x.CreatedAt)
                .ThenBy(x => x.Id)
                .ToListAsync(ct);
            dataLoadStopwatch.Stop();
            _logger.LogInformation(
                "Job invoice segment {Segment} completed in {ElapsedMs} ms for job {JobId}",
                "load_job_data",
                dataLoadStopwatch.Elapsed.TotalMilliseconds,
                jobId);

            CreateXeroInvoiceRequest request;
            var requestBuildStopwatch = Stopwatch.StartNew();
            try
            {
                request = await BuildCatalogMappedCreateRequestAsync(
                    row.Job,
                    row.Customer,
                    row.Vehicle,
                    serviceSelections,
                    partsServices,
                    paintService,
                    ct);
            }
            catch (InvalidOperationException ex)
            {
                totalStopwatch.Stop();
                _logger.LogInformation(
                    "Job invoice draft creation completed in {ElapsedMs} ms for job {JobId} (ok: {Ok}, alreadyExists: {AlreadyExists})",
                    totalStopwatch.Elapsed.TotalMilliseconds,
                    jobId,
                    false,
                    false);
                return JobInvoiceCreateResult.Fail(400, ex.Message);
            }

            requestBuildStopwatch.Stop();
            _logger.LogInformation(
                "Job invoice segment {Segment} completed in {ElapsedMs} ms for job {JobId}",
                "build_request",
                requestBuildStopwatch.Elapsed.TotalMilliseconds,
                jobId);

            var xeroCreateStopwatch = Stopwatch.StartNew();
            var createResult = await _xeroInvoiceService.CreateInvoiceAsync(
                request,
                new XeroInvoiceCreateOptions
                {
                    SummarizeErrors = true,
                    IdempotencyKey = $"nzat-job-{jobId}-draft",
                },
                ct);
            xeroCreateStopwatch.Stop();
            _logger.LogInformation(
                "Job invoice segment {Segment} completed in {ElapsedMs} ms for job {JobId} (ok: {Ok}, statusCode: {StatusCode})",
                "xero_create_invoice",
                xeroCreateStopwatch.Elapsed.TotalMilliseconds,
                jobId,
                createResult.Ok,
                createResult.StatusCode);

            if (!createResult.Ok)
            {
                totalStopwatch.Stop();
                _logger.LogInformation(
                    "Job invoice draft creation completed in {ElapsedMs} ms for job {JobId} (ok: {Ok}, alreadyExists: {AlreadyExists})",
                    totalStopwatch.Elapsed.TotalMilliseconds,
                    jobId,
                    false,
                    false);
                return JobInvoiceCreateResult.Fail(
                    createResult.StatusCode,
                    createResult.Error ?? "Failed to create Xero draft invoice.",
                    createResult.Payload,
                    request,
                    createResult.RefreshToken,
                    createResult.RefreshTokenUpdated,
                    createResult.Scope,
                    createResult.ExpiresIn);
            }

            var persistStopwatch = Stopwatch.StartNew();
            var jobInvoice = BuildJobInvoice(jobId, request, createResult.Payload, createResult.TenantId);
            _db.JobInvoices.Add(jobInvoice);
            await _db.SaveChangesAsync(ct);
            persistStopwatch.Stop();
            _logger.LogInformation(
                "Job invoice segment {Segment} completed in {ElapsedMs} ms for job {JobId}",
                "persist_invoice",
                persistStopwatch.Elapsed.TotalMilliseconds,
                jobId);

            totalStopwatch.Stop();
            _logger.LogInformation(
                "Job invoice draft creation completed in {ElapsedMs} ms for job {JobId} (ok: {Ok}, alreadyExists: {AlreadyExists})",
                totalStopwatch.Elapsed.TotalMilliseconds,
                jobId,
                true,
                false);

            return JobInvoiceCreateResult.Success(
                jobInvoice,
                alreadyExists: false,
                payload: createResult.Payload,
                requestBody: request,
                refreshToken: createResult.RefreshToken,
                refreshTokenUpdated: createResult.RefreshTokenUpdated,
                scope: createResult.Scope,
                expiresIn: createResult.ExpiresIn);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(
                ex,
                "Job invoice draft creation threw an exception for job {JobId} ({ExceptionType}: {ExceptionMessage})",
                jobId,
                ex.GetType().Name,
                ex.Message);
            throw;
        }
    }

    public async Task<JobInvoiceCreateResult> UpdateDraftReferenceAsync(long jobId, string reference, CancellationToken ct)
    {
        var jobInvoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (jobInvoice is null)
            return JobInvoiceCreateResult.Fail(404, "Job invoice not found.");

        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == jobId, ct);
        if (job is null)
            return JobInvoiceCreateResult.Fail(404, "Job not found.");

        if (string.IsNullOrWhiteSpace(jobInvoice.ExternalInvoiceId) || !Guid.TryParse(jobInvoice.ExternalInvoiceId, out var invoiceId))
            return JobInvoiceCreateResult.Fail(400, "Missing Xero invoice id.");

        if (!string.Equals(jobInvoice.ExternalStatus, "DRAFT", StringComparison.OrdinalIgnoreCase))
            return JobInvoiceCreateResult.Fail(400, "Only Xero draft invoices can have their reference updated from PO TODO.");

        var request = BuildReferenceUpdateRequestFromExistingInvoice(jobInvoice, invoiceId, reference);
        return await SyncDraftForJobAsync(jobInvoice, job, request, jobInvoice.InvoiceNote, sanitizeLineItems: false, ct);
    }

    public async Task<JobInvoiceCreateResult> UpdatePoReferenceAsync(long jobId, string poNumber, CancellationToken ct)
    {
        var syncResult = await SyncFromXeroAsync(jobId, ct);
        if (!syncResult.Ok)
            return syncResult;

        var invoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (invoice is null)
            return JobInvoiceCreateResult.Fail(404, "Job invoice not found.");
        if (!Guid.TryParse(invoice.ExternalInvoiceId, out var invoiceId))
            return JobInvoiceCreateResult.Fail(400, "Missing Xero invoice id.");

        var status = invoice.ExternalStatus?.Trim().ToUpperInvariant() ?? "";
        if (status is "PAID" or "VOIDED" or "DELETED")
            return JobInvoiceCreateResult.Fail(409, $"Xero invoice is {status} and cannot be processed from PO TODO.");

        var reference = PoReferenceBuilder.BuildReference(invoice.Reference, poNumber);

        if (string.Equals(invoice.Reference?.Trim(), reference.Trim(), StringComparison.OrdinalIgnoreCase))
            return JobInvoiceCreateResult.Success(invoice, alreadyExists: true);

        var update = await _xeroInvoiceService.UpdateInvoiceReferenceAsync(invoiceId, reference, ct);
        if (!update.Ok)
            return JobInvoiceCreateResult.Fail(update.StatusCode, update.Error ?? "Failed to update Xero invoice reference.", update.Payload);

        var verify = await SyncFromXeroAsync(jobId, ct);
        if (!verify.Ok)
            return verify;

        invoice = await _db.JobInvoices.FirstAsync(x => x.JobId == jobId, ct);
        return string.Equals(invoice.Reference?.Trim(), reference.Trim(), StringComparison.OrdinalIgnoreCase)
            ? JobInvoiceCreateResult.Success(invoice, alreadyExists: false, payload: update.Payload)
            : JobInvoiceCreateResult.Fail(409, "Xero reference update could not be verified.");
    }

    public Task<JobInvoiceCreateResult> EmailInvoiceAsync(long jobId, CancellationToken ct) =>
        SendInvoiceEmailCoreAsync(jobId, previewOnly: false, ct);

    public Task<JobInvoiceCreateResult> SendInvoicePreviewAsync(long jobId, CancellationToken ct) =>
        SendInvoiceEmailCoreAsync(jobId, previewOnly: true, ct);

    public async Task<JobInvoiceCreateResult> RepairInvoiceSentToContactAsync(long jobId, CancellationToken ct)
    {
        var jobInvoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (jobInvoice is null || !Guid.TryParse(jobInvoice.ExternalInvoiceId, out var invoiceId))
            return JobInvoiceCreateResult.Fail(404, "Xero invoice not found.");

        var lockKey = BuildInvoiceEmailLockKey(invoiceId);
        NpgsqlConnection? lockConnection = null;
        try
        {
            lockConnection = await AcquireInvoiceEmailLockAsync(lockKey, ct);
            var existingSend = await FindSentInvoiceEmailAsync(BuildInvoiceEmailCorrelationId(invoiceId), ct);
            if (existingSend is null)
            {
                return JobInvoiceCreateResult.Success(
                    jobInvoice,
                    alreadyExists: true,
                    payload: new InvoiceSentRepairPayload(false, false, null));
            }

            var verification = await MarkInvoiceSentAndRefreshAsync(jobInvoice, invoiceId, ct);
            return JobInvoiceCreateResult.Success(
                jobInvoice,
                alreadyExists: true,
                payload: new InvoiceSentRepairPayload(true, verification.Verified, verification.Error));
        }
        finally
        {
            await ReleaseInvoiceEmailLockAsync(lockConnection, lockKey);
        }
    }

    private async Task<JobInvoiceCreateResult> SendInvoiceEmailCoreAsync(
        long jobId,
        bool previewOnly,
        CancellationToken ct)
    {
        var jobInvoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (jobInvoice is null || !Guid.TryParse(jobInvoice.ExternalInvoiceId, out var invoiceId))
            return JobInvoiceCreateResult.Fail(404, "Xero invoice not found.");

        if (previewOnly)
            return await SendInvoiceEmailAfterLockAsync(jobId, jobInvoice, invoiceId, previewOnly: true, ct);

        var lockKey = BuildInvoiceEmailLockKey(invoiceId);
        NpgsqlConnection? lockConnection = null;
        try
        {
            lockConnection = await AcquireInvoiceEmailLockAsync(lockKey, ct);
            return await SendInvoiceEmailAfterLockAsync(jobId, jobInvoice, invoiceId, previewOnly: false, ct);
        }
        finally
        {
            await ReleaseInvoiceEmailLockAsync(lockConnection, lockKey);
        }
    }

    private async Task<JobInvoiceCreateResult> SendInvoiceEmailAfterLockAsync(
        long jobId,
        JobInvoice jobInvoice,
        Guid invoiceId,
        bool previewOnly,
        CancellationToken ct)
    {

        var correlationId = BuildInvoiceEmailCorrelationId(invoiceId);
        if (!previewOnly)
        {
            var existingSend = await FindSentInvoiceEmailAsync(correlationId, ct);
            if (existingSend is not null)
            {
                var markVerification = await MarkInvoiceSentAndRefreshAsync(jobInvoice, invoiceId, ct);
                if (!markVerification.Verified)
                {
                    _logger.LogWarning(
                        "Invoice Gmail delivery already existed, but Xero SentToContact repair failed for job {JobId} / invoice {InvoiceId}: {Error}",
                        jobId,
                        invoiceId,
                        markVerification.Error);
                }

                return JobInvoiceCreateResult.Success(
                    jobInvoice,
                    alreadyExists: true,
                    payload: new InvoiceEmailDeliveryPayload(
                        existingSend.GmailMessageId,
                        existingSend.GmailThreadId ?? "",
                        existingSend.ToAddress ?? existingSend.CounterpartyEmail,
                        existingSend.GmailAccountEmail,
                        null,
                        jobInvoice.ExternalInvoiceNumber ?? "",
                        "",
                        BuildPdfDownloadFileName(jobInvoice),
                        markVerification.Verified,
                        markVerification.Error,
                        false));
            }
        }

        var xeroInvoice = await _xeroInvoiceService.GetInvoiceByIdAsync(invoiceId, ct);
        if (!xeroInvoice.Ok)
        {
            return JobInvoiceCreateResult.Fail(
                xeroInvoice.StatusCode,
                xeroInvoice.Error ?? "Failed to read the invoice from Xero.",
                xeroInvoice.Payload);
        }

        var emailContext = ExtractInvoiceEmailContext(xeroInvoice.Payload);
        if (emailContext is null)
            return JobInvoiceCreateResult.Fail(502, "Xero returned an invalid invoice response.", xeroInvoice.Payload);

        if (string.Equals(emailContext.Status, "DRAFT", StringComparison.OrdinalIgnoreCase))
            return JobInvoiceCreateResult.Fail(409, "The Xero invoice must be Awaiting Payment before it can be emailed.", xeroInvoice.Payload);

        var xeroRecipient = NormalizeEmailAddress(emailContext.ContactEmailAddress);
        if (string.IsNullOrWhiteSpace(xeroRecipient))
        {
            return JobInvoiceCreateResult.Fail(
                400,
                "The Xero invoice contact does not have a valid primary email address.",
                xeroInvoice.Payload);
        }

        var gmailAccount = await _gmailAccountService.GetEffectiveAccountAsync(ct);
        if (gmailAccount is null || string.IsNullOrWhiteSpace(NormalizeEmailAddress(gmailAccount.Email)))
            return JobInvoiceCreateResult.Fail(500, "No active Gmail account is configured for invoice delivery.");

        var pdfResult = await _xeroInvoiceService.GetInvoicePdfByIdAsync(invoiceId, ct);
        if (!pdfResult.Ok || pdfResult.PdfBytes is null || pdfResult.PdfBytes.Length == 0)
        {
            return JobInvoiceCreateResult.Fail(
                pdfResult.Ok ? 502 : pdfResult.StatusCode,
                pdfResult.Error ?? "Failed to download the official invoice PDF from Xero.",
                pdfResult.Payload);
        }

        var onlineInvoice = await _xeroInvoiceService.GetOnlineInvoiceUrlAsync(invoiceId, ct);
        if (!onlineInvoice.Ok || !IsSafeOnlineInvoiceUrl(onlineInvoice.OnlineInvoiceUrl))
        {
            return JobInvoiceCreateResult.Fail(
                onlineInvoice.Ok ? 502 : onlineInvoice.StatusCode,
                onlineInvoice.Error ?? "Failed to retrieve the online invoice URL from Xero.",
                onlineInvoice.Payload);
        }

        var latestRequest = BuildRequestFromPayload(xeroInvoice.Payload, jobInvoice);
        ApplyInvoiceUpdate(jobInvoice, latestRequest, xeroInvoice.Payload, xeroInvoice.TenantId);
        jobInvoice.PdfContent = pdfResult.PdfBytes;
        jobInvoice.PdfDownloadedAt = DateTime.UtcNow;
        jobInvoice.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        var invoiceNumber = FirstNonEmpty(emailContext.InvoiceNumber, jobInvoice.ExternalInvoiceNumber)
            ?? $"Invoice {jobInvoice.Id.ToString(CultureInfo.InvariantCulture)}";
        var customerName = FirstNonEmpty(emailContext.ContactName, jobInvoice.ContactName);
        var recipient = previewOnly ? gmailAccount.Email.Trim() : xeroRecipient;
        var bcc = previewOnly || string.Equals(recipient, gmailAccount.Email, StringComparison.OrdinalIgnoreCase)
            ? null
            : gmailAccount.Email.Trim();
        var subject = $"{(previewOnly ? "[TEST] " : "")}Invoice {invoiceNumber} from NZ AUTO TECH" +
            (customerName is null ? "" : $" for {customerName}");
        var plainBody = BuildInvoiceEmailPlainBody(emailContext, invoiceNumber, onlineInvoice.OnlineInvoiceUrl, previewOnly);
        var pdfFileName = BuildPdfDownloadFileName(jobInvoice);
        var logoBytes = TryLoadInvoiceEmailLogo();
        var logoContentId = logoBytes is { Length: > 0 } ? InvoiceEmailLogoContentId : null;
        var htmlBody = BuildInvoiceEmailHtmlBody(
            emailContext,
            invoiceNumber,
            onlineInvoice.OnlineInvoiceUrl,
            previewOnly,
            logoContentId);
        var emailAttachments = new List<GmailMessageAttachment>
        {
            new(pdfFileName, "application/pdf", pdfResult.PdfBytes),
        };
        if (logoBytes is { Length: > 0 })
        {
            emailAttachments.Add(new GmailMessageAttachment(
                "nzat-logo.jpg",
                "image/jpeg",
                logoBytes,
                InvoiceEmailLogoContentId));
        }

        var sendResult = await _gmailMessageSenderService.SendAsync(
            new GmailMessageSendRequest(
                To: recipient,
                Subject: subject,
                Body: plainBody,
                CorrelationId: previewOnly ? $"{correlationId}:preview" : correlationId,
                ThreadId: null,
                ReplyToRfcMessageId: null,
                ReferencesHeader: null,
                GmailAccountId: gmailAccount.Id,
                IsHtmlBody: true,
                HtmlBodyOverride: htmlBody,
                BypassDuplicateProtection: previewOnly,
                Attachments: emailAttachments,
                Cc: null,
                Bcc: bcc),
            ct);

        if (!sendResult.Ok)
        {
            if (!previewOnly && sendResult.StatusCode == 409)
            {
                var racedSend = await FindSentInvoiceEmailAsync(correlationId, ct);
                if (racedSend is not null)
                    return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true, payload: racedSend);
            }

            return JobInvoiceCreateResult.Fail(
                sendResult.StatusCode,
                sendResult.Error ?? "Failed to send the invoice through Gmail.",
                sendResult);
        }

        var xeroMarkedSent = false;
        string? xeroMarkError = null;
        if (!previewOnly)
        {
            var markVerification = await MarkInvoiceSentAndRefreshAsync(jobInvoice, invoiceId, ct);
            xeroMarkedSent = markVerification.Verified;
            xeroMarkError = markVerification.Error;
            if (!markVerification.Verified)
            {
                _logger.LogWarning(
                    "Invoice email was sent through Gmail, but Xero SentToContact update failed for job {JobId} / invoice {InvoiceId}: {Error}",
                    jobId,
                    invoiceId,
                    markVerification.Error);
            }
        }

        return JobInvoiceCreateResult.Success(
            jobInvoice,
            alreadyExists: false,
            payload: new InvoiceEmailDeliveryPayload(
                sendResult.MessageId,
                sendResult.ThreadId,
                recipient,
                sendResult.GmailAccountEmail,
                bcc,
                invoiceNumber,
                onlineInvoice.OnlineInvoiceUrl,
                pdfFileName,
                xeroMarkedSent,
                xeroMarkError,
                previewOnly));
    }

    private Task<GmailMessageLog?> FindSentInvoiceEmailAsync(string correlationId, CancellationToken ct) =>
        _db.GmailMessageLogs.AsNoTracking()
            .Where(item => item.Direction == "sent" && item.CorrelationId == correlationId)
            .OrderByDescending(item => item.CreatedAt)
            .ThenByDescending(item => item.Id)
            .FirstOrDefaultAsync(ct);

    private async Task<InvoiceSentMarkVerification> MarkInvoiceSentAndRefreshAsync(
        JobInvoice jobInvoice,
        Guid invoiceId,
        CancellationToken ct)
    {
        try
        {
            var markResult = await _xeroInvoiceService.MarkInvoiceSentToContactAsync(invoiceId, ct);
            if (!markResult.Ok)
            {
                return InvoiceSentMarkVerification.Warning(
                    markResult.Error ?? "Xero rejected the SentToContact update.");
            }

            var fullInvoice = await _xeroInvoiceService.GetInvoiceByIdAsync(invoiceId, ct);
            if (!fullInvoice.Ok)
            {
                return InvoiceSentMarkVerification.Warning(
                    $"Xero accepted the SentToContact update, but the full invoice could not be reloaded: {fullInvoice.Error ?? "unknown Xero error"}");
            }

            if (!IsSentToContactVerified(fullInvoice.Payload, invoiceId))
            {
                return InvoiceSentMarkVerification.Warning(
                    "Xero accepted the SentToContact update, but the refreshed invoice did not confirm SentToContact=true.");
            }

            var refreshedRequest = BuildRequestFromPayload(fullInvoice.Payload, jobInvoice);
            ApplyInvoiceUpdate(jobInvoice, refreshedRequest, fullInvoice.Payload, fullInvoice.TenantId);
            await _db.SaveChangesAsync(ct);
            return InvoiceSentMarkVerification.Success();
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            return InvoiceSentMarkVerification.Warning(
                $"Xero SentToContact verification failed: {ex.Message}");
        }
    }

    private static bool IsSentToContactVerified(object? payload, Guid expectedInvoiceId)
    {
        if (payload is null)
            return false;

        try
        {
            using var document = JsonDocument.Parse(JsonSerializer.Serialize(payload, JsonOptions));
            if (!TryGetInvoices(document.RootElement, out var invoices))
                return false;

            foreach (var invoice in invoices.EnumerateArray())
            {
                if (!Guid.TryParse(TryGetString(invoice, "InvoiceID"), out var invoiceId) || invoiceId != expectedInvoiceId)
                    continue;

                return invoice.TryGetProperty("SentToContact", out var sentToContact) &&
                       sentToContact.ValueKind == JsonValueKind.True;
            }
        }
        catch (JsonException)
        {
        }

        return false;
    }

    private async Task<NpgsqlConnection?> AcquireInvoiceEmailLockAsync(long lockKey, CancellationToken ct)
    {
        if (!_db.Database.IsRelational())
            return null;

        if (!string.Equals(
                _db.Database.ProviderName,
                "Npgsql.EntityFrameworkCore.PostgreSQL",
                StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Invoice email advisory locking requires PostgreSQL.");
        }

        var connection = await _dataSource.OpenConnectionAsync(ct);
        try
        {
            await using var command = connection.CreateCommand();
            command.CommandText = "SELECT pg_advisory_lock(@lock_key);";
            command.Parameters.AddWithValue("lock_key", lockKey);
            await command.ExecuteNonQueryAsync(ct);
            return connection;
        }
        catch
        {
            await connection.DisposeAsync();
            throw;
        }
    }

    private async Task ReleaseInvoiceEmailLockAsync(NpgsqlConnection? connection, long lockKey)
    {
        if (connection is null)
            return;

        var released = false;
        try
        {
            if (connection.State == System.Data.ConnectionState.Open)
            {
                await using var command = connection.CreateCommand();
                command.CommandText = "SELECT pg_advisory_unlock(@lock_key);";
                command.CommandTimeout = 5;
                command.Parameters.AddWithValue("lock_key", lockKey);
                released = await command.ExecuteScalarAsync(CancellationToken.None) is true;
            }

            if (!released)
            {
                _logger.LogWarning(
                    "PostgreSQL reported that invoice email advisory lock {LockKey} was not held during release.",
                    lockKey);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to explicitly release invoice email advisory lock {LockKey}.", lockKey);
        }
        finally
        {
            if (!released)
                NpgsqlConnection.ClearPool(connection);

            await connection.DisposeAsync();
        }
    }

    private static long BuildInvoiceEmailLockKey(Guid invoiceId)
    {
        var hash = SHA256.HashData(invoiceId.ToByteArray());
        return BinaryPrimitives.ReadInt64BigEndian(hash);
    }

    private static string BuildInvoiceEmailCorrelationId(Guid invoiceId) =>
        $"xero-invoice:{invoiceId:D}";

    private static string? NormalizeEmailAddress(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) ||
            !System.Net.Mail.MailAddress.TryCreate(value.Trim(), out var address) ||
            string.IsNullOrWhiteSpace(address.Address))
        {
            return null;
        }

        return address.Address.Trim();
    }

    private static bool IsSafeOnlineInvoiceUrl(string? value) =>
        Uri.TryCreate(value, UriKind.Absolute, out var uri) &&
        string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) &&
        (string.Equals(uri.Host, "xero.com", StringComparison.OrdinalIgnoreCase) ||
         uri.Host.EndsWith(".xero.com", StringComparison.OrdinalIgnoreCase));

    private static InvoiceEmailContext? ExtractInvoiceEmailContext(object? payload)
    {
        if (payload is null)
            return null;

        try
        {
            using var document = JsonDocument.Parse(JsonSerializer.Serialize(payload, JsonOptions));
            if (!TryGetInvoices(document.RootElement, out var invoices) || invoices.GetArrayLength() == 0)
                return null;

            var invoice = invoices[0];
            JsonElement contact = default;
            if (invoice.TryGetProperty("Contact", out var contactElement) && contactElement.ValueKind == JsonValueKind.Object)
                contact = contactElement;

            return new InvoiceEmailContext(
                TryGetString(invoice, "InvoiceNumber"),
                TryGetString(invoice, "Status"),
                contact.ValueKind == JsonValueKind.Object ? TryGetString(contact, "Name") : null,
                contact.ValueKind == JsonValueKind.Object ? TryGetString(contact, "EmailAddress") : null,
                ParseXeroDate(invoice, "DateString", "Date"),
                TryGetString(invoice, "CurrencyCode"),
                TryGetDecimal(invoice, "AmountDue") ?? TryGetDecimal(invoice, "Total"),
                TryGetString(invoice, "Reference"));
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static decimal? TryGetDecimal(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var value))
            return null;

        if (value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var number))
            return number;

        return value.ValueKind == JsonValueKind.String &&
               decimal.TryParse(value.GetString(), NumberStyles.Number, CultureInfo.InvariantCulture, out number)
            ? number
            : null;
    }

    private static DateOnly? ParseXeroDate(JsonElement invoice, params string[] propertyNames)
    {
        foreach (var propertyName in propertyNames)
        {
            var raw = TryGetString(invoice, propertyName);
            if (string.IsNullOrWhiteSpace(raw))
                continue;

            if (DateOnly.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.AllowWhiteSpaces, out var date))
                return date;
            if (DateTimeOffset.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.AllowWhiteSpaces, out var dateTime))
                return DateOnly.FromDateTime(dateTime.DateTime);
        }

        return null;
    }

    private static string BuildInvoiceEmailPlainBody(
        InvoiceEmailContext context,
        string invoiceNumber,
        string onlineInvoiceUrl,
        bool previewOnly)
    {
        var lines = new List<string>();
        if (previewOnly)
            lines.Add("TEST COPY — this preview has not marked the invoice as sent in Xero.");

        lines.Add("Hi Team,");
        lines.Add("");
        lines.Add("Thank you for choosing NZ AUTO TECH.");
        lines.Add($"Please find invoice {invoiceNumber} attached as a PDF for your records. You can also view it securely online using the link below.");
        lines.Add("");
        if (context.AmountDue.HasValue)
            lines.Add($"Amount Due: {FormatInvoiceAmount(context.AmountDue.Value, context.CurrencyCode)}");
        if (context.InvoiceDate.HasValue)
            lines.Add($"Invoice Date: {context.InvoiceDate.Value.ToString("dd MMMM yyyy", CultureInfo.GetCultureInfo("en-NZ"))}");
        if (!string.IsNullOrWhiteSpace(context.Reference))
            lines.Add($"Reference: {context.Reference.Trim()}");

        lines.Add("");
        lines.Add($"View Invoice Online: {onlineInvoiceUrl}");
        lines.Add("");
        lines.Add("A PDF copy of the invoice is attached to this email.");
        lines.Add("If you have any questions about this invoice, please let us know. We're happy to help.");
        lines.Add("");
        lines.Add("Kind regards,");
        lines.Add("NZ AUTO TECH");
        lines.Add("Phone: 09 213 1988");
        lines.Add("Email: info@nzautotech.co.nz");
        lines.Add("Address: 486 Ellerslie Panmure Highway,Mount Wellington, Auckland 1060");
        return string.Join(Environment.NewLine, lines);
    }

    private static string BuildInvoiceEmailHtmlBody(
        InvoiceEmailContext context,
        string invoiceNumber,
        string onlineInvoiceUrl,
        bool previewOnly,
        string? logoContentId)
    {
        Func<string?, string?> encode = System.Net.WebUtility.HtmlEncode;
        var amountRow = context.AmountDue.HasValue
            ? $"<tr><td style=\"padding:12px 16px;color:#667085;border-bottom:1px solid #eaecf0;\">Amount Due</td><td align=\"right\" style=\"padding:12px 16px;font-weight:700;color:#101828;border-bottom:1px solid #eaecf0;\">{encode(FormatInvoiceAmount(context.AmountDue.Value, context.CurrencyCode))}</td></tr>"
            : "";
        var invoiceDateRow = context.InvoiceDate.HasValue
            ? $"<tr><td style=\"padding:12px 16px;color:#667085;border-bottom:1px solid #eaecf0;\">Invoice Date</td><td align=\"right\" style=\"padding:12px 16px;font-weight:600;color:#101828;border-bottom:1px solid #eaecf0;\">{encode(context.InvoiceDate.Value.ToString("dd MMMM yyyy", CultureInfo.GetCultureInfo("en-NZ")))}</td></tr>"
            : "";
        var referenceRow = !string.IsNullOrWhiteSpace(context.Reference)
            ? $"<tr><td style=\"padding:12px 16px;color:#667085;\">Reference</td><td align=\"right\" style=\"padding:12px 16px;font-weight:600;color:#101828;\">{encode(context.Reference.Trim())}</td></tr>"
            : "";
        var previewBanner = previewOnly
            ? "<div style=\"margin:0 0 20px;padding:12px 16px;border-radius:6px;background:#fff4e5;color:#8a4b08;font-weight:600;\">TEST COPY — this preview has not marked the invoice as sent in Xero.</div>"
            : "";
        var logoMarkup = string.IsNullOrWhiteSpace(logoContentId)
            ? "<div style=\"font-size:24px;font-weight:800;letter-spacing:.08em;color:#ffffff;\">NZ AUTO TECH</div>"
            : $"<img src=\"cid:{encode(logoContentId)}\" width=\"460\" alt=\"NZ AUTO TECH\" style=\"display:block;width:100%;max-width:460px;height:auto;margin:0 auto;border:0;\">";

        return $"""
            <!doctype html>
            <html>
              <body style="margin:0;background:#f5f7fa;font-family:Arial,sans-serif;color:#1d2939;">
                <div style="max-width:640px;margin:0 auto;padding:32px 16px;">
                  <div style="background:#ffffff;border:1px solid #e4e7ec;border-radius:10px;overflow:hidden;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#000000;">
                      <tr>
                        <td align="center" style="padding:24px 28px 12px;">{logoMarkup}</td>
                      </tr>
                      <tr>
                        <td align="center" style="padding:0 28px 24px;color:#ffffff;font-size:24px;font-weight:700;">Invoice {encode(invoiceNumber)}</td>
                      </tr>
                    </table>
                    <div style="padding:30px 28px 28px;">
                      {previewBanner}
                      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">Hi Team,</p>
                      <p style="margin:0 0 8px;font-size:15px;line-height:1.7;">Thank you for choosing NZ AUTO TECH.</p>
                      <p style="margin:0 0 24px;font-size:15px;line-height:1.7;">Please find invoice {encode(invoiceNumber)} attached as a PDF for your records.</p>
                      <p style="margin:0 0 24px;font-size:15px;line-height:1.7;">You can also view it online using the button below.</p>
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:0 0 26px;font-size:14px;border:1px solid #eaecf0;border-radius:8px;background:#f9fafb;">
                        {invoiceDateRow}{amountRow}{referenceRow}
                      </table>
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td align="center" style="padding:0 0 4px;">
                            <a href="{encode(onlineInvoiceUrl)}" style="display:inline-block;padding:13px 24px;border-radius:6px;background:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">View Invoice Online</a>
                          </td>
                        </tr>
                      </table>
                      <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#667085;">A PDF copy of the invoice is attached to this email.</p>
                      <p style="margin:16px 0 0;font-size:15px;line-height:1.7;">If you have any questions about this invoice, please let us know.</p>
                      <p style="margin:24px 0 0;font-size:15px;line-height:1.7;">Kind regards,<br><strong>NZ AUTO TECH</strong></p>
                    </div>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#111111;">
                      <tr>
                        <td align="center" style="padding:22px 24px;color:#d0d5dd;font-size:13px;line-height:1.8;">
                          <strong style="color:#ffffff;letter-spacing:.04em;">CONTACT</strong><br>
                          <a href="tel:+6492131988" style="color:#ffffff;text-decoration:none;">☎️:09 213 1988</a>
                          <span style="color:#667085;">&nbsp;&nbsp;|&nbsp;&nbsp;</span>
                          <a href="mailto:info@nzautotech.co.nz" style="color:#ffffff;text-decoration:none;">📧:info@nzautotech.co.nz</a><br>
                          486 Ellerslie Panmure Highway,Mount Wellington, Auckland 1060
                        </td>
                      </tr>
                    </table>
                  </div>
                </div>
              </body>
            </html>
            """;
    }

    private static string FormatInvoiceAmount(decimal amount, string? currencyCode)
    {
        var currency = string.IsNullOrWhiteSpace(currencyCode) ? "NZD" : currencyCode.Trim().ToUpperInvariant();
        return $"{currency} {amount.ToString("N2", CultureInfo.GetCultureInfo("en-NZ"))}";
    }

    private byte[]? TryLoadInvoiceEmailLogo()
    {
        try
        {
            var path = Path.Combine(AppContext.BaseDirectory, "Assets", "nzat-logo.jpg");
            if (!File.Exists(path))
            {
                _logger.LogWarning("Invoice email logo was not found at {LogoPath}; falling back to text branding.", path);
                return null;
            }

            var bytes = File.ReadAllBytes(path);
            return bytes.Length > 0 ? bytes : null;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Invoice email logo could not be loaded; falling back to text branding.");
            return null;
        }
    }

    private sealed record InvoiceEmailContext(
        string? InvoiceNumber,
        string? Status,
        string? ContactName,
        string? ContactEmailAddress,
        DateOnly? InvoiceDate,
        string? CurrencyCode,
        decimal? AmountDue,
        string? Reference);

    private sealed record InvoiceSentMarkVerification(bool Verified, string? Error)
    {
        public static InvoiceSentMarkVerification Success() => new(true, null);

        public static InvoiceSentMarkVerification Warning(string error) => new(false, error);
    }

    public async Task<JobInvoiceCreateResult> MarkInvoiceWaitingPaymentAsync(long jobId, CancellationToken ct)
    {
        var jobInvoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (jobInvoice is null)
            return JobInvoiceCreateResult.Fail(404, "Job invoice not found.");

        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == jobId, ct);
        if (job is null)
            return JobInvoiceCreateResult.Fail(404, "Job not found.");

        if (string.Equals(jobInvoice.ExternalStatus, "PAID", StringComparison.OrdinalIgnoreCase))
            return JobInvoiceCreateResult.Fail(400, "This Xero invoice is already Paid.");

        if (string.Equals(jobInvoice.ExternalStatus, "AUTHORISED", StringComparison.OrdinalIgnoreCase))
            return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true);

        if (string.IsNullOrWhiteSpace(jobInvoice.ExternalInvoiceId) || !Guid.TryParse(jobInvoice.ExternalInvoiceId, out _))
            return JobInvoiceCreateResult.Fail(400, "Missing Xero invoice id.");

        var statusResult = await SyncInvoiceStatusAsync(jobInvoice, "AUTHORISED", ct);
        if (!statusResult.Ok)
            return statusResult;

        job.InvoiceReference = jobInvoice.Reference;
        job.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return statusResult;
    }

    public async Task<JobInvoiceCreateResult> SyncDraftForJobAsync(long jobId, SyncJobInvoiceDraftRequest payload, CancellationToken ct)
    {
        var jobInvoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (jobInvoice is null)
            return JobInvoiceCreateResult.Fail(404, "Job invoice not found.");

        if (string.IsNullOrWhiteSpace(jobInvoice.ExternalInvoiceId) || !Guid.TryParse(jobInvoice.ExternalInvoiceId, out var invoiceId))
            return JobInvoiceCreateResult.Fail(400, "Missing Xero invoice id for sync.");

        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == jobId, ct);
        if (job is null)
            return JobInvoiceCreateResult.Fail(404, "Job not found.");

        var request = new CreateXeroInvoiceRequest
        {
            InvoiceId = invoiceId,
            Type = "ACCREC",
            Status = string.IsNullOrWhiteSpace(payload.Status) ? (jobInvoice.ExternalStatus ?? "DRAFT") : payload.Status.Trim(),
            LineAmountTypes = string.IsNullOrWhiteSpace(payload.LineAmountTypes) ? "Inclusive" : payload.LineAmountTypes.Trim(),
            Date = payload.Date ?? jobInvoice.InvoiceDate ?? DateOnly.FromDateTime(DateTime.UtcNow),
            Reference = string.IsNullOrWhiteSpace(payload.Reference) ? jobInvoice.Reference : payload.Reference.Trim(),
            Contact = new XeroInvoiceContactInput
            {
                Name = string.IsNullOrWhiteSpace(payload.ContactName) ? jobInvoice.ContactName : payload.ContactName.Trim(),
            },
            LineItems = await SanitizeLineItemsAsync(payload.LineItems, ct),
        };
        var normalizedInvoiceNote = string.IsNullOrWhiteSpace(payload.InvoiceNote) ? null : payload.InvoiceNote.Trim();

        return await SyncDraftForJobAsync(jobInvoice, job, request, normalizedInvoiceNote, sanitizeLineItems: true, ct);
    }

    private async Task<JobInvoiceCreateResult> SyncDraftForJobAsync(
        JobInvoice jobInvoice,
        Job job,
        CreateXeroInvoiceRequest request,
        string? normalizedInvoiceNote,
        bool sanitizeLineItems,
        CancellationToken ct)
    {
        if (request.LineItems.Count == 0)
            return JobInvoiceCreateResult.Fail(400, "At least one invoice line item is required.");

        if (sanitizeLineItems)
            request.LineItems = await SanitizeLineItemsAsync(request.LineItems, ct);

        if (request.LineItems.Count == 0)
            return JobInvoiceCreateResult.Fail(400, "At least one invoice line item is required.");

        var syncResult = await _xeroInvoiceService.CreateInvoiceAsync(
            request,
            new XeroInvoiceCreateOptions
            {
                SummarizeErrors = true,
            },
            ct);

        if (!syncResult.Ok)
        {
            return JobInvoiceCreateResult.Fail(
                syncResult.StatusCode,
                syncResult.Error ?? "Failed to sync Xero draft invoice.",
                syncResult.Payload,
                request,
                syncResult.RefreshToken,
                syncResult.RefreshTokenUpdated,
                syncResult.Scope,
                syncResult.ExpiresIn);
        }

        ApplyInvoiceUpdate(jobInvoice, request, syncResult.Payload, syncResult.TenantId);
        jobInvoice.InvoiceNote = normalizedInvoiceNote;
        job.InvoiceReference = request.Reference;
        job.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return JobInvoiceCreateResult.Success(
            jobInvoice,
            alreadyExists: false,
            payload: syncResult.Payload,
            requestBody: request,
            refreshToken: syncResult.RefreshToken,
            refreshTokenUpdated: syncResult.RefreshTokenUpdated,
            scope: syncResult.Scope,
            expiresIn: syncResult.ExpiresIn);
    }

    public async Task<JobInvoiceCreateResult> AttachExistingXeroInvoiceAsync(long jobId, string invoiceNumber, CancellationToken ct)
    {
        var normalizedInvoiceNumber = invoiceNumber?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedInvoiceNumber))
            return JobInvoiceCreateResult.Fail(400, "Invoice number is required.");

        var existing = await _db.JobInvoices.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (existing is not null)
            return JobInvoiceCreateResult.Fail(409, "This job already has a linked invoice.");

        var jobExists = await _db.Jobs.AsNoTracking().AnyAsync(x => x.Id == jobId, ct);
        if (!jobExists)
            return JobInvoiceCreateResult.Fail(404, "Job not found.");

        var xeroLookup = await _xeroInvoiceService.GetInvoicesByNumberAsync(normalizedInvoiceNumber, ct);
        if (!xeroLookup.Ok)
        {
            return JobInvoiceCreateResult.Fail(
                xeroLookup.StatusCode,
                xeroLookup.Error ?? "Failed to find invoice in Xero.",
                xeroLookup.Payload);
        }

        var matchedInvoices = ExtractInvoiceSummaries(xeroLookup.Payload)
            .Where(x => string.Equals(x.InvoiceNumber, normalizedInvoiceNumber, StringComparison.OrdinalIgnoreCase))
            .ToList();

        if (matchedInvoices.Count == 0)
            return JobInvoiceCreateResult.Fail(404, $"Invoice '{normalizedInvoiceNumber}' was not found in Xero.");

        if (matchedInvoices.Count > 1)
            return JobInvoiceCreateResult.Fail(409, $"Multiple Xero invoices matched '{normalizedInvoiceNumber}'.");

        var matchedInvoice = matchedInvoices[0];
        if (string.IsNullOrWhiteSpace(matchedInvoice.InvoiceId) || !Guid.TryParse(matchedInvoice.InvoiceId, out var invoiceId))
        {
            return JobInvoiceCreateResult.Fail(502, "Xero returned an invoice without a valid InvoiceID.", xeroLookup.Payload);
        }

        var linkedInvoice = await _db.JobInvoices.AsNoTracking()
            .FirstOrDefaultAsync(x => x.ExternalInvoiceId == invoiceId.ToString(), ct);
        if (linkedInvoice is not null && linkedInvoice.JobId != jobId)
        {
            return JobInvoiceCreateResult.Fail(
                409,
                $"Invoice '{normalizedInvoiceNumber}' is already linked to job {linkedInvoice.JobId}.");
        }

        var now = DateTime.UtcNow;
        var jobInvoice = new JobInvoice
        {
            JobId = jobId,
            Provider = "xero",
            ExternalInvoiceId = invoiceId.ToString(),
            ExternalInvoiceNumber = matchedInvoice.InvoiceNumber,
            ExternalStatus = matchedInvoice.Status,
            Reference = matchedInvoice.Reference,
            ContactName = matchedInvoice.ContactName,
            InvoiceDate = matchedInvoice.Date,
            LineAmountTypes = "Exclusive",
            TenantId = xeroLookup.TenantId,
            CreatedAt = now,
            UpdatedAt = now,
        };

        _db.JobInvoices.Add(jobInvoice);
        await _db.SaveChangesAsync(ct);

        var syncResult = await SyncFromXeroInvoiceIdAsync(invoiceId, ct);
        if (!syncResult.Ok)
        {
            _db.JobInvoices.Remove(jobInvoice);
            await _db.SaveChangesAsync(ct);
            return syncResult;
        }

        return syncResult;
    }

    public async Task<JobInvoiceCreateResult> ReplaceExistingXeroInvoiceAsync(long jobId, string invoiceNumber, CancellationToken ct)
    {
        var normalizedInvoiceNumber = invoiceNumber?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedInvoiceNumber))
            return JobInvoiceCreateResult.Fail(400, "Invoice number is required.");

        var currentInvoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (currentInvoice is null)
            return await AttachExistingXeroInvoiceAsync(jobId, normalizedInvoiceNumber, ct);

        var hasPayment = await _db.JobPayments.AsNoTracking().AnyAsync(x => x.JobInvoiceId == currentInvoice.Id, ct);
        if (hasPayment)
            return JobInvoiceCreateResult.Fail(409, "This invoice has a recorded payment and cannot be replaced.");

        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == jobId, ct);
        if (job is null)
            return JobInvoiceCreateResult.Fail(404, "Job not found.");

        var xeroLookup = await _xeroInvoiceService.GetInvoicesByNumberAsync(normalizedInvoiceNumber, ct);
        if (!xeroLookup.Ok)
        {
            return JobInvoiceCreateResult.Fail(
                xeroLookup.StatusCode,
                xeroLookup.Error ?? "Failed to find invoice in Xero.",
                xeroLookup.Payload);
        }

        var matchedInvoices = ExtractInvoiceSummaries(xeroLookup.Payload)
            .Where(x => string.Equals(x.InvoiceNumber, normalizedInvoiceNumber, StringComparison.OrdinalIgnoreCase))
            .ToList();
        if (matchedInvoices.Count == 0)
            return JobInvoiceCreateResult.Fail(404, $"Invoice '{normalizedInvoiceNumber}' was not found in Xero.");
        if (matchedInvoices.Count > 1)
            return JobInvoiceCreateResult.Fail(409, $"Multiple Xero invoices matched '{normalizedInvoiceNumber}'.");

        var matchedInvoice = matchedInvoices[0];
        if (string.IsNullOrWhiteSpace(matchedInvoice.InvoiceId) || !Guid.TryParse(matchedInvoice.InvoiceId, out var invoiceId))
            return JobInvoiceCreateResult.Fail(502, "Xero returned an invoice without a valid InvoiceID.", xeroLookup.Payload);

        if (string.Equals(currentInvoice.ExternalInvoiceId, invoiceId.ToString(), StringComparison.OrdinalIgnoreCase))
            return await SyncFromXeroInvoiceIdAsync(invoiceId, ct);

        var linkedElsewhere = await _db.JobInvoices.AsNoTracking()
            .AnyAsync(x => x.ExternalInvoiceId == invoiceId.ToString() && x.JobId != jobId, ct);
        if (linkedElsewhere)
            return JobInvoiceCreateResult.Fail(409, $"Invoice '{normalizedInvoiceNumber}' is already linked to another job.");

        var fullInvoice = await _xeroInvoiceService.GetInvoiceByIdAsync(invoiceId, ct);
        if (!fullInvoice.Ok)
        {
            return JobInvoiceCreateResult.Fail(
                fullInvoice.StatusCode,
                fullInvoice.Error ?? "Failed to load the replacement invoice from Xero.",
                fullInvoice.Payload);
        }

        if (string.Equals(currentInvoice.Provider, "xero", StringComparison.OrdinalIgnoreCase)
            && string.Equals(currentInvoice.ExternalStatus, "DRAFT", StringComparison.OrdinalIgnoreCase)
            && !string.IsNullOrWhiteSpace(currentInvoice.ExternalInvoiceId)
            && Guid.TryParse(currentInvoice.ExternalInvoiceId, out _))
        {
            var deleteResult = await SyncInvoiceStatusAsync(currentInvoice, "DELETED", ct);
            if (!deleteResult.Ok && deleteResult.StatusCode is not 400 and not 404)
            {
                return JobInvoiceCreateResult.Fail(
                    deleteResult.StatusCode,
                    deleteResult.Error ?? "Failed to delete the old Xero draft invoice.",
                    deleteResult.Payload);
            }
        }

        DeleteInvoiceDocuments(currentInvoice.Id);
        currentInvoice.PdfContent = null;
        currentInvoice.PdfPreviewContent = null;
        currentInvoice.PdfFilePath = null;
        currentInvoice.PdfPreviewPath = null;
        currentInvoice.PdfDownloadedAt = null;
        currentInvoice.PdfPreviewGeneratedAt = null;

        var request = BuildRequestFromPayload(fullInvoice.Payload, currentInvoice);
        ApplyInvoiceUpdate(currentInvoice, request, fullInvoice.Payload, fullInvoice.TenantId);
        job.InvoiceReference = currentInvoice.Reference;
        job.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        await _jobLifecycleService.EvaluateAsync(job.Id, ct);

        return JobInvoiceCreateResult.Success(
            currentInvoice,
            alreadyExists: true,
            payload: fullInvoice.Payload,
            requestBody: request);
    }

    public Task<JobInvoiceCreateResult> SyncFromXeroAsync(long jobId, CancellationToken ct)
        => SyncFromXeroAsync(jobId, true, ct);

    private async Task<JobInvoiceCreateResult> SyncFromXeroAsync(
        long jobId,
        bool evaluateLifecycle,
        CancellationToken ct)
    {
        await EnsureJobInvoicePdfColumnsAsync(ct);
        var jobInvoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (jobInvoice is null)
            return JobInvoiceCreateResult.Fail(404, "Job invoice not found.");

        if (string.IsNullOrWhiteSpace(jobInvoice.ExternalInvoiceId) || !Guid.TryParse(jobInvoice.ExternalInvoiceId, out var invoiceId))
            return JobInvoiceCreateResult.Fail(400, "Missing Xero invoice id.");

        return await SyncFromXeroInvoiceIdAsync(invoiceId, evaluateLifecycle, ct);
    }

    public Task<JobInvoiceCreateResult> SyncFromXeroInvoiceIdAsync(Guid invoiceId, CancellationToken ct)
        => SyncFromXeroInvoiceIdAsync(invoiceId, true, ct);

    private async Task<JobInvoiceCreateResult> SyncFromXeroInvoiceIdAsync(
        Guid invoiceId,
        bool evaluateLifecycle,
        CancellationToken ct)
    {
        await EnsureJobInvoicePdfColumnsAsync(ct);
        var jobInvoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.ExternalInvoiceId == invoiceId.ToString(), ct);
        if (jobInvoice is null)
            return JobInvoiceCreateResult.Fail(404, "Linked job invoice not found.");

        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == jobInvoice.JobId, ct);
        if (job is null)
            return JobInvoiceCreateResult.Fail(404, "Job not found.");

        var xeroResult = await _xeroInvoiceService.GetInvoiceByIdAsync(invoiceId, ct);
        if (!xeroResult.Ok)
        {
            return JobInvoiceCreateResult.Fail(
                xeroResult.StatusCode,
                xeroResult.Error ?? "Failed to fetch invoice from Xero.",
                xeroResult.Payload);
        }

        var request = BuildRequestFromPayload(xeroResult.Payload, jobInvoice);
        ApplyInvoiceUpdate(jobInvoice, request, xeroResult.Payload, xeroResult.TenantId);
        job.InvoiceReference = jobInvoice.Reference;
        job.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        if (evaluateLifecycle)
            await _jobLifecycleService.EvaluateAsync(job.Id, ct);

        return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true, payload: xeroResult.Payload, requestBody: request);
    }

    public async Task<JobInvoiceBulkSyncResult> SyncFromXeroAsync(IReadOnlyCollection<JobInvoiceXeroSyncTarget> targets, CancellationToken ct)
    {
        await EnsureJobInvoicePdfColumnsAsync(ct);
        if (targets.Count == 0)
            return JobInvoiceBulkSyncResult.Success(0, 0, null);

        var syncTargets = new List<(JobInvoice Invoice, Guid InvoiceId)>();
        foreach (var target in targets)
        {
            if (target.JobId <= 0 ||
                target.JobInvoiceId <= 0 ||
                string.IsNullOrWhiteSpace(target.ExternalInvoiceId) ||
                !Guid.TryParse(target.ExternalInvoiceId, out var invoiceId))
            {
                continue;
            }

            var invoice = GetOrAttachJobInvoice(target.JobInvoiceId, target.JobId, target.ExternalInvoiceId);
            syncTargets.Add((invoice, invoiceId));
        }

        if (syncTargets.Count == 0)
            return JobInvoiceBulkSyncResult.Success(targets.Count, 0, null);

        var xeroResult = await _xeroInvoiceService.GetInvoicesByIdsAsync(
            syncTargets.Select(x => x.InvoiceId).Distinct().ToArray(),
            ct);
        if (!xeroResult.Ok)
        {
            return JobInvoiceBulkSyncResult.Fail(
                xeroResult.StatusCode,
                xeroResult.Error ?? "Failed to fetch invoices from Xero.",
                targets.Count,
                0,
                xeroResult.Payload);
        }

        var payloadsByInvoiceId = ExtractSingleInvoicePayloadsById(xeroResult.Payload);
        if (payloadsByInvoiceId.Count == 0)
            return JobInvoiceBulkSyncResult.Success(targets.Count, 0, xeroResult.Payload);

        var synced = 0;
        var syncedJobIds = new HashSet<long>();
        var now = DateTime.UtcNow;
        foreach (var (jobInvoice, invoiceId) in syncTargets)
        {
            if (!payloadsByInvoiceId.TryGetValue(invoiceId, out var payload))
                continue;

            var request = BuildRequestFromPayload(payload, jobInvoice);
            ApplyInvoiceUpdate(jobInvoice, request, payload, xeroResult.TenantId);

            var job = GetOrAttachJob(jobInvoice.JobId);
            job.InvoiceReference = jobInvoice.Reference;
            job.UpdatedAt = now;

            synced++;
            syncedJobIds.Add(jobInvoice.JobId);
        }

        if (synced > 0)
        {
            await _db.SaveChangesAsync(ct);
            foreach (var jobId in syncedJobIds)
                await _jobLifecycleService.EvaluateAsync(jobId, ct);
        }

        return JobInvoiceBulkSyncResult.Success(
            targets.Count,
            synced,
            xeroResult.Payload,
            syncedJobIds.ToArray());
    }

    private JobInvoice GetOrAttachJobInvoice(long jobInvoiceId, long jobId, string externalInvoiceId)
    {
        var tracked = _db.JobInvoices.Local.FirstOrDefault(x => x.Id == jobInvoiceId);
        if (tracked is not null)
            return tracked;

        var invoice = new JobInvoice
        {
            Id = jobInvoiceId,
            JobId = jobId,
            ExternalInvoiceId = externalInvoiceId,
        };
        _db.JobInvoices.Attach(invoice);
        return invoice;
    }

    private Job GetOrAttachJob(long jobId)
    {
        var tracked = _db.Jobs.Local.FirstOrDefault(x => x.Id == jobId);
        if (tracked is not null)
            return tracked;

        var job = new Job
        {
            Id = jobId,
        };
        _db.Jobs.Attach(job);
        return job;
    }

    public async Task<JobInvoiceCreateResult> SyncInvoicePdfAsync(long jobId, CancellationToken ct)
    {
        await EnsureJobInvoicePdfColumnsAsync(ct);
        var jobInvoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (jobInvoice is null)
            return JobInvoiceCreateResult.Fail(404, "Job invoice not found.");

        if (!string.Equals(jobInvoice.Provider, "xero", StringComparison.OrdinalIgnoreCase))
            return JobInvoiceCreateResult.Fail(400, "Only Xero invoice PDFs can be pulled.");

        if (string.IsNullOrWhiteSpace(jobInvoice.ExternalInvoiceId) || !Guid.TryParse(jobInvoice.ExternalInvoiceId, out var invoiceId))
            return JobInvoiceCreateResult.Fail(400, "Missing Xero invoice id.");

        var pulled = await TrySyncInvoicePdfAsync(jobInvoice, invoiceId, ct);
        if (!pulled.Ok)
            return JobInvoiceCreateResult.Fail(
                pulled.StatusCode,
                pulled.Error ?? "Failed to pull invoice PDF from Xero.");

        return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true);
    }

    public async Task<JobInvoiceCreateResult> SyncWofItemsToDraftAsync(long jobId, CancellationToken ct)
    {
        await EnsureJobInvoicePdfColumnsAsync(ct);
        var synced = await SyncFromXeroAsync(jobId, ct);
        if (!synced.Ok)
            return synced;

        var jobInvoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (jobInvoice is null)
            return JobInvoiceCreateResult.Fail(404, "Job invoice not found.");

        if (!string.Equals(jobInvoice.Provider, "xero", StringComparison.OrdinalIgnoreCase))
            return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true);

        if (!string.Equals(jobInvoice.ExternalStatus, "DRAFT", StringComparison.OrdinalIgnoreCase))
            return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true);

        var row = await (
                from j in _db.Jobs.AsNoTracking()
                join v in _db.Vehicles.AsNoTracking() on j.VehicleId equals v.Id
                join c in _db.Customers.AsNoTracking() on j.CustomerId equals c.Id
                where j.Id == jobId
                select new
                {
                    Job = j,
                    Vehicle = v,
                    Customer = c,
                }
            )
            .FirstOrDefaultAsync(ct);

        if (row is null)
            return JobInvoiceCreateResult.Fail(404, "Job not found.");

        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == jobId, ct);
        if (job is null)
            return JobInvoiceCreateResult.Fail(404, "Job not found.");

        var serviceSelections = await _db.JobServiceSelections.AsNoTracking()
            .Where(x => x.JobId == jobId)
            .OrderBy(x => x.CreatedAt)
            .ThenBy(x => x.Id)
            .ToListAsync(ct);

        var wofSelectionIds = (await _referenceDataCache.GetServiceCatalogItemsAsync(ct))
            .Where(x => string.Equals(x.ServiceType, "wof", StringComparison.OrdinalIgnoreCase))
            .Select(x => x.Id)
            .ToHashSet();

        var wofSelections = serviceSelections
            .Where(x => wofSelectionIds.Contains(x.ServiceCatalogItemId))
            .ToList();

        if (wofSelections.Count == 0)
            return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true);

        var wofLineItems = await BuildCatalogMappedServiceLineItemsAsync(
            row.Customer,
            jobId,
            wofSelections,
            paintService: null,
            ct);

        if (wofLineItems.Count == 0)
            return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true);

        var request = BuildRequestFromPayload(jobInvoice.ResponsePayloadJson, jobInvoice);
        var existingKeys = new HashSet<string>(
            request.LineItems.Select(BuildLineItemIdentity),
            StringComparer.OrdinalIgnoreCase);

        var appended = false;
        foreach (var lineItem in wofLineItems)
        {
            var key = BuildLineItemIdentity(lineItem);
            if (existingKeys.Contains(key))
                continue;

            request.LineItems.Add(lineItem);
            existingKeys.Add(key);
            appended = true;
        }

        if (!appended)
            return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true);

        request.Status = "DRAFT";
        request.LineItems = await SanitizeLineItemsAsync(request.LineItems, ct);

        var syncResult = await _xeroInvoiceService.CreateInvoiceAsync(
            request,
            new XeroInvoiceCreateOptions
            {
                SummarizeErrors = true,
            },
            ct);

        if (!syncResult.Ok)
        {
            return JobInvoiceCreateResult.Fail(
                syncResult.StatusCode,
                syncResult.Error ?? "Failed to sync WOF item to Xero draft invoice.",
                syncResult.Payload,
                request,
                syncResult.RefreshToken,
                syncResult.RefreshTokenUpdated,
                syncResult.Scope,
                syncResult.ExpiresIn);
        }

        ApplyInvoiceUpdate(jobInvoice, request, syncResult.Payload, syncResult.TenantId);
        job.InvoiceReference = jobInvoice.Reference;
        job.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return JobInvoiceCreateResult.Success(
            jobInvoice,
            alreadyExists: true,
            payload: syncResult.Payload,
            requestBody: request,
            refreshToken: syncResult.RefreshToken,
            refreshTokenUpdated: syncResult.RefreshTokenUpdated,
            scope: syncResult.Scope,
            expiresIn: syncResult.ExpiresIn);
    }

    public async Task<JobInvoiceCreateResult> SyncManagedJobContentToDraftAsync(
        long jobId,
        IReadOnlyCollection<string>? legacyNoteDescriptions,
        CancellationToken ct)
    {
        await EnsureJobInvoicePdfColumnsAsync(ct);
        var jobInvoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (jobInvoice is null)
        {
            var invoiceIsStillBeingLinked = await _db.OutboxMessages.AsNoTracking().AnyAsync(
                x => x.AggregateType == InvoiceOutboxService.JobAggregateType
                    && x.AggregateId == jobId
                    && (x.MessageType == InvoiceOutboxService.CreateDraftMessageType
                        || x.MessageType == InvoiceOutboxService.AttachExistingMessageType
                        || x.MessageType == InvoiceOutboxService.ReplaceExistingMessageType)
                    && (x.Status == "pending" || x.Status == "processing"),
                ct);
            if (invoiceIsStillBeingLinked)
                return JobInvoiceCreateResult.Fail(408, "Invoice is still being created or linked.");

            return JobInvoiceCreateResult.Success(null, alreadyExists: true);
        }

        if (!string.Equals(jobInvoice.Provider, "xero", StringComparison.OrdinalIgnoreCase) ||
            !string.Equals(jobInvoice.ExternalStatus, "DRAFT", StringComparison.OrdinalIgnoreCase))
        {
            return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true);
        }

        var pulled = await SyncFromXeroAsync(jobId, ct);
        if (!pulled.Ok)
            return pulled;

        jobInvoice = await _db.JobInvoices.FirstAsync(x => x.JobId == jobId, ct);
        if (!string.Equals(jobInvoice.ExternalStatus, "DRAFT", StringComparison.OrdinalIgnoreCase))
            return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true);

        var job = await _db.Jobs.AsNoTracking().FirstOrDefaultAsync(x => x.Id == jobId, ct);
        if (job is null)
            return JobInvoiceCreateResult.Fail(404, "Job not found.");

        var request = BuildRequestFromPayload(jobInvoice.ResponsePayloadJson, jobInvoice);
        var legacyNotes = new HashSet<string>(
            (legacyNoteDescriptions ?? [])
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Select(x => x.Trim()),
            StringComparer.Ordinal);
        if (!string.IsNullOrWhiteSpace(job.Notes))
            legacyNotes.Add(job.Notes.Trim());
        request.LineItems = request.LineItems
            .Where(item => !IsManagedJobContentLine(item.Description)
                && !legacyNotes.Contains(item.Description.Trim()))
            .ToList();

        AppendManagedJobContentLine(request.LineItems, "JOB-NOTES", job.Notes);
        AppendManagedJobContentLine(request.LineItems, "OTHER-NOTES", job.PrivateNotes);

        var selectedServiceNames = (await _db.JobServiceSelections.AsNoTracking()
                .Where(x => x.JobId == jobId)
                .Select(x => x.ServiceNameSnapshot)
                .ToListAsync(ct))
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.Trim())
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var extraMechItems = await _db.JobMechServices.AsNoTracking()
            .Where(x => x.JobId == jobId)
            .OrderBy(x => x.CreatedAt)
            .Select(x => x.Description)
            .ToListAsync(ct);
        foreach (var description in extraMechItems.Where(x => !selectedServiceNames.Contains(x.Trim())))
            AppendManagedJobContentLine(request.LineItems, "MECH", description);

        var extraPartsItems = await _db.JobPartsServices.AsNoTracking()
            .Where(x => x.JobId == jobId && x.CreatedAt > jobInvoice.CreatedAt)
            .OrderBy(x => x.CreatedAt)
            .Select(x => x.Description)
            .ToListAsync(ct);
        foreach (var description in extraPartsItems)
            AppendManagedJobContentLine(request.LineItems, "PARTS", description);

        var extraPaint = await _db.JobPaintServices.AsNoTracking()
            .Where(x => x.JobId == jobId && x.CreatedAt > jobInvoice.CreatedAt)
            .OrderBy(x => x.CreatedAt)
            .Select(x => new { x.Panels })
            .FirstOrDefaultAsync(ct);
        if (extraPaint is not null)
            AppendManagedJobContentLine(request.LineItems, "PAINT", $"Paint service ({extraPaint.Panels} panels)");

        if (request.LineItems.Count == 0)
            AppendManagedJobContentLine(request.LineItems, "JOB", "Job draft");

        request.Status = "DRAFT";
        request.LineItems = await SanitizeLineItemsAsync(request.LineItems, ct);
        var syncResult = await _xeroInvoiceService.CreateInvoiceAsync(
            request,
            new XeroInvoiceCreateOptions { SummarizeErrors = true },
            ct);
        if (!syncResult.Ok)
        {
            return JobInvoiceCreateResult.Fail(
                syncResult.StatusCode,
                syncResult.Error ?? "Failed to sync job content to Xero draft invoice.",
                syncResult.Payload,
                request,
                syncResult.RefreshToken,
                syncResult.RefreshTokenUpdated,
                syncResult.Scope,
                syncResult.ExpiresIn);
        }

        ApplyInvoiceUpdate(jobInvoice, request, syncResult.Payload, syncResult.TenantId);
        await _db.SaveChangesAsync(ct);
        return JobInvoiceCreateResult.Success(
            jobInvoice,
            alreadyExists: true,
            payload: syncResult.Payload,
            requestBody: request,
            refreshToken: syncResult.RefreshToken,
            refreshTokenUpdated: syncResult.RefreshTokenUpdated,
            scope: syncResult.Scope,
            expiresIn: syncResult.ExpiresIn);
    }

    public async Task<JobInvoiceCreateResult> SyncVehicleReferenceToXeroAsync(long jobId, CancellationToken ct)
    {
        await EnsureJobInvoicePdfColumnsAsync(ct);
        var jobInvoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (jobInvoice is null)
        {
            var invoiceIsStillBeingLinked = await _db.OutboxMessages.AsNoTracking().AnyAsync(
                x => x.AggregateType == InvoiceOutboxService.JobAggregateType
                    && x.AggregateId == jobId
                    && (x.MessageType == InvoiceOutboxService.CreateDraftMessageType
                        || x.MessageType == InvoiceOutboxService.AttachExistingMessageType
                        || x.MessageType == InvoiceOutboxService.ReplaceExistingMessageType)
                    && (x.Status == "pending" || x.Status == "processing"),
                ct);
            if (invoiceIsStillBeingLinked)
                return JobInvoiceCreateResult.Fail(408, "Invoice is still being created or linked.");

            return JobInvoiceCreateResult.Success(null, alreadyExists: true);
        }

        if (!string.Equals(jobInvoice.Provider, "xero", StringComparison.OrdinalIgnoreCase))
            return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true);

        var job = await _db.Jobs
            .Include(x => x.Customer)
            .Include(x => x.Vehicle)
            .FirstOrDefaultAsync(x => x.Id == jobId, ct);
        if (job is null)
            return JobInvoiceCreateResult.Fail(404, "Job not found.");

        if (job.Customer is null || job.Vehicle is null)
            return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true);

        var isArchived = string.Equals(job.Status, "Archived", StringComparison.OrdinalIgnoreCase);
        if (isArchived && !HasVehicleReferencePlaceholder(jobInvoice.Reference))
            return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true);

        // Personal invoice references are intentionally managed outside the vehicle reference format.
        if (string.Equals(job.Customer.Type, "Personal", StringComparison.OrdinalIgnoreCase))
            return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true);

        if (!job.Vehicle.Year.HasValue ||
            job.Vehicle.Year.Value <= 0 ||
            string.IsNullOrWhiteSpace(job.Vehicle.Make) ||
            string.IsNullOrWhiteSpace(job.Vehicle.Model))
        {
            return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true);
        }

        if (!Guid.TryParse(jobInvoice.ExternalInvoiceId, out var invoiceId))
            return JobInvoiceCreateResult.Fail(400, "Missing Xero invoice id.");

        if (IsReferenceUpdateTerminalStatus(jobInvoice.ExternalStatus))
            return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true);

        var pulled = await SyncFromXeroAsync(jobId, ct);
        if (!pulled.Ok)
            return pulled;

        jobInvoice = await _db.JobInvoices.FirstAsync(x => x.JobId == jobId, ct);
        if (isArchived && !HasVehicleReferencePlaceholder(jobInvoice.Reference))
            return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true);

        if (!IsManagedVehicleReference(jobInvoice.Reference, job.Vehicle.Plate))
            return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true);

        var referencePoNumber = string.IsNullOrWhiteSpace(job.PoNumber)
            ? PoReferenceBuilder.ExtractPoNumber(jobInvoice.Reference)
            : job.PoNumber;
        var desiredReference = BuildReference(referencePoNumber, job.Customer, job.Vehicle);
        if (ReferencesMatch(jobInvoice.Reference, desiredReference))
            return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true);

        if (!IsReferenceUpdateAllowedStatus(jobInvoice.ExternalStatus))
            return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true);

        var update = await _xeroInvoiceService.UpdateInvoiceReferenceAsync(invoiceId, desiredReference, ct);
        if (!update.Ok)
        {
            return JobInvoiceCreateResult.Fail(
                update.StatusCode,
                update.Error ?? "Failed to update Xero invoice vehicle reference.",
                update.Payload);
        }

        var verified = await SyncFromXeroAsync(jobId, ct);
        if (!verified.Ok)
            return verified;

        jobInvoice = await _db.JobInvoices.FirstAsync(x => x.JobId == jobId, ct);
        return ReferencesMatch(jobInvoice.Reference, desiredReference)
            ? JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: false, payload: update.Payload)
            : JobInvoiceCreateResult.Fail(408, "Xero vehicle reference update could not be verified yet.");
    }

    private static bool IsReferenceUpdateTerminalStatus(string? status)
        => status?.Trim().ToUpperInvariant() is "PAID" or "VOIDED" or "DELETED";

    private static bool IsReferenceUpdateAllowedStatus(string? status)
        => status?.Trim().ToUpperInvariant() is "DRAFT" or "SUBMITTED" or "AUTHORISED";

    private static bool ReferencesMatch(string? left, string? right)
        => string.Equals(left?.Trim() ?? "", right?.Trim() ?? "", StringComparison.OrdinalIgnoreCase);

    private static bool IsManagedVehicleReference(string? reference, string? plate)
    {
        var normalized = reference?.Trim();
        if (string.IsNullOrWhiteSpace(normalized))
            return false;

        var normalizedPlate = plate?.Trim();
        var containsVehicleKey = normalized.Contains("[REGO]", StringComparison.OrdinalIgnoreCase) ||
                                 (!string.IsNullOrWhiteSpace(normalizedPlate) &&
                                  ContainsReferenceToken(normalized, normalizedPlate));
        if (!containsVehicleKey)
        {
            return false;
        }

        if (normalized.StartsWith("[PO]", StringComparison.OrdinalIgnoreCase) ||
            normalized.StartsWith("Pending", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (normalized.StartsWith("PO", StringComparison.OrdinalIgnoreCase))
        {
            var suffix = normalized[2..].TrimStart();
            if (suffix.StartsWith('#'))
                suffix = suffix[1..].TrimStart();
            if (suffix.Equals("Pending", StringComparison.OrdinalIgnoreCase) ||
                suffix.StartsWith("Pending ", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return PoReferenceBuilder.ExtractPoNumber(normalized) is not null;
    }

    private static bool HasVehicleReferencePlaceholder(string? reference)
        => reference?.Contains("[YEAR]", StringComparison.OrdinalIgnoreCase) == true ||
           reference?.Contains("[MAKE]", StringComparison.OrdinalIgnoreCase) == true ||
           reference?.Contains("[MODEL]", StringComparison.OrdinalIgnoreCase) == true ||
           reference?.Contains("[REGO]", StringComparison.OrdinalIgnoreCase) == true;

    private static bool ContainsReferenceToken(string value, string token)
    {
        var searchFrom = 0;
        while (searchFrom < value.Length)
        {
            var index = value.IndexOf(token, searchFrom, StringComparison.OrdinalIgnoreCase);
            if (index < 0)
                return false;

            var end = index + token.Length;
            var startsAtBoundary = index == 0 || !char.IsLetterOrDigit(value[index - 1]);
            var endsAtBoundary = end == value.Length || !char.IsLetterOrDigit(value[end]);
            if (startsAtBoundary && endsAtBoundary)
                return true;

            searchFrom = index + 1;
        }

        return false;
    }

    private static bool IsManagedJobContentLine(string? description)
        => description?.TrimStart().StartsWith("[NZAT:", StringComparison.OrdinalIgnoreCase) == true;

    private static void AppendManagedJobContentLine(
        ICollection<XeroInvoiceLineItemInput> lineItems,
        string category,
        string? description)
    {
        var normalized = description?.Trim();
        if (string.IsNullOrWhiteSpace(normalized))
            return;

        lineItems.Add(new XeroInvoiceLineItemInput
        {
            Description = $"[NZAT:{category}]\n{normalized}",
            Quantity = 1m,
            UnitAmount = 0m,
        });
    }

    public async Task<JobInvoiceCreateResult> RemoveServiceItemsFromDraftAsync(
        long jobId,
        IReadOnlyList<ServiceSelectionSnapshot> selections,
        CancellationToken ct)
    {
        await EnsureJobInvoicePdfColumnsAsync(ct);
        if (selections.Count == 0)
            return JobInvoiceCreateResult.Success(null, alreadyExists: true);

        var synced = await SyncFromXeroAsync(jobId, ct);
        if (!synced.Ok)
            return synced;

        var jobInvoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (jobInvoice is null)
            return JobInvoiceCreateResult.Fail(404, "Job invoice not found.");

        if (!string.Equals(jobInvoice.Provider, "xero", StringComparison.OrdinalIgnoreCase))
            return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true);

        if (!string.Equals(jobInvoice.ExternalStatus, "DRAFT", StringComparison.OrdinalIgnoreCase))
            return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true);

        var customer = await (
                from j in _db.Jobs.AsNoTracking()
                join c in _db.Customers.AsNoTracking() on j.CustomerId equals c.Id
                where j.Id == jobId
                select c
            )
            .FirstOrDefaultAsync(ct);

        if (customer is null)
            return JobInvoiceCreateResult.Fail(404, "Job customer not found.");

        var transientSelections = selections
            .Where(x => x.ServiceCatalogItemId > 0)
            .Select(x => new JobServiceSelection
            {
                JobId = jobId,
                ServiceCatalogItemId = x.ServiceCatalogItemId,
                ServiceNameSnapshot = x.ServiceNameSnapshot ?? "",
            })
            .ToList();

        var removalLineItems = await BuildCatalogMappedServiceLineItemsAsync(customer, jobId, transientSelections, paintService: null, ct);
        if (removalLineItems.Count == 0)
            return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true);

        var removalKeys = new HashSet<string>(removalLineItems.Select(BuildLineItemIdentity), StringComparer.OrdinalIgnoreCase);
        var request = BuildRequestFromPayload(jobInvoice.ResponsePayloadJson, jobInvoice);
        var filteredLineItems = request.LineItems
            .Where(x => !removalKeys.Contains(BuildLineItemIdentity(x)))
            .ToList();

        if (filteredLineItems.Count == request.LineItems.Count)
            return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true);

        if (filteredLineItems.Count == 0)
        {
            filteredLineItems.Add(new XeroInvoiceLineItemInput
            {
                Description = "Job draft",
                Quantity = 1m,
                UnitAmount = 0m,
            });
        }

        request.Status = "DRAFT";
        request.LineItems = await SanitizeLineItemsAsync(filteredLineItems, ct);

        var syncResult = await _xeroInvoiceService.CreateInvoiceAsync(
            request,
            new XeroInvoiceCreateOptions
            {
                SummarizeErrors = true,
            },
            ct);

        if (!syncResult.Ok)
        {
            return JobInvoiceCreateResult.Fail(
                syncResult.StatusCode,
                syncResult.Error ?? "Failed to remove service item from Xero draft invoice.",
                syncResult.Payload,
                request,
                syncResult.RefreshToken,
                syncResult.RefreshTokenUpdated,
                syncResult.Scope,
                syncResult.ExpiresIn);
        }

        ApplyInvoiceUpdate(jobInvoice, request, syncResult.Payload, syncResult.TenantId);
        await _db.SaveChangesAsync(ct);

        return JobInvoiceCreateResult.Success(
            jobInvoice,
            alreadyExists: true,
            payload: syncResult.Payload,
            requestBody: request,
            refreshToken: syncResult.RefreshToken,
            refreshTokenUpdated: syncResult.RefreshTokenUpdated,
            scope: syncResult.Scope,
            expiresIn: syncResult.ExpiresIn);
    }

    public async Task<JobInvoiceUnlinkResult> UnlinkInvoiceAsync(long jobId, CancellationToken ct)
    {
        var jobInvoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (jobInvoice is null)
            return JobInvoiceUnlinkResult.Fail(404, "Job invoice not found.");

        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == jobId, ct);
        if (job is null)
            return JobInvoiceUnlinkResult.Fail(404, "Job not found.");

        DeleteInvoiceDocuments(jobInvoice.Id);
        _db.JobInvoices.Remove(jobInvoice);
        job.InvoiceReference = null;
        job.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return JobInvoiceUnlinkResult.Success();
    }

    public async Task<JobInvoiceStateUpdateResult> UpdateXeroStateAsync(long jobId, UpdateJobInvoiceXeroStateRequest payload, CancellationToken ct)
    {
        await EnsureJobInvoicePdfColumnsAsync(ct);
        var jobInvoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (jobInvoice is null)
            return JobInvoiceStateUpdateResult.Fail(404, "Job invoice not found.");

        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == jobId, ct);
        if (job is null)
            return JobInvoiceStateUpdateResult.Fail(404, "Job not found.");

        var state = (payload.State ?? "").Trim().ToUpperInvariant();
        if (string.IsNullOrWhiteSpace(state))
            return JobInvoiceStateUpdateResult.Fail(400, "State is required.");
        var requiresExactPaymentMatch = payload.RequireExactAmountMatch
            && state is "PAID_CASH" or "PAID_EPOST" or "PAID_BANK_TRANSFER";

        if (state == "PAID_PARTIAL_CASH")
        {
            var paymentDate = payload.PaymentDate ?? DateOnly.FromDateTime(DateTime.UtcNow);
            var amount = payload.Amount is > 0
                ? payload.Amount.Value
                : ExtractAmountDue(jobInvoice.ResponsePayloadJson)
                ?? ExtractInvoiceTotal(jobInvoice.ResponsePayloadJson)
                ?? ExtractInvoiceTotal(jobInvoice.RequestPayloadJson);
            if (amount is null || amount <= 0)
                return JobInvoiceStateUpdateResult.Fail(400, "Unable to determine invoice payment amount.");

            var latestExistingPayment = await _db.JobPayments
                .Where(x => x.JobInvoiceId == jobInvoice.Id)
                .OrderByDescending(x => x.CreatedAt)
                .FirstOrDefaultAsync(ct);

            var paymentReference = FirstNonEmpty(payload.Reference);
            if (latestExistingPayment is null)
            {
                var jobPayment = BuildJobPayment(
                    jobInvoice,
                    "cash",
                    amount.Value,
                    paymentDate,
                    paymentReference,
                    jobInvoice.ExternalStatus ?? string.Empty);
                _db.JobPayments.Add(jobPayment);
            }
            else
            {
                latestExistingPayment.Method = "cash";
                latestExistingPayment.Amount = amount.Value;
                latestExistingPayment.PaymentDate = paymentDate;
                latestExistingPayment.Reference = paymentReference;
                latestExistingPayment.ExternalStatus = jobInvoice.ExternalStatus;
                latestExistingPayment.UpdatedAt = DateTime.UtcNow;
            }

            job.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);

            return await BuildStateUpdateResultAsync(jobInvoice, ct);
        }

        var synced = await SyncFromXeroAsync(jobId, !requiresExactPaymentMatch, ct);
        if (!synced.Ok || synced.Invoice is null)
            return JobInvoiceStateUpdateResult.Fail(synced.StatusCode, synced.Error ?? "Failed to sync invoice from Xero.", synced.Payload);

        if (string.IsNullOrWhiteSpace(jobInvoice.ExternalInvoiceId) || !Guid.TryParse(jobInvoice.ExternalInvoiceId, out var invoiceId))
            return JobInvoiceStateUpdateResult.Fail(400, "Missing Xero invoice id.");

        if (state == "DRAFT")
        {
            if (!string.Equals(jobInvoice.ExternalStatus, "DRAFT", StringComparison.OrdinalIgnoreCase))
                return JobInvoiceStateUpdateResult.Fail(400, "Xero does not allow reverting this invoice back to Draft from the system.");

            return await BuildStateUpdateResultAsync(jobInvoice, ct);
        }

        if (state == "AUTHORISED")
        {
            if (string.Equals(jobInvoice.ExternalStatus, "PAID", StringComparison.OrdinalIgnoreCase))
                return JobInvoiceStateUpdateResult.Fail(400, "This Xero invoice is already Paid.");

            if (!string.Equals(jobInvoice.ExternalStatus, "AUTHORISED", StringComparison.OrdinalIgnoreCase))
            {
                var authoriseResult = await SyncInvoiceStatusAsync(jobInvoice, "AUTHORISED", ct);
                if (!authoriseResult.Ok)
                    return JobInvoiceStateUpdateResult.Fail(authoriseResult.StatusCode, authoriseResult.Error ?? "Failed to update invoice status.", authoriseResult.Payload);

                job.InvoiceReference = jobInvoice.Reference;
                job.UpdatedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync(ct);
            }

            return await BuildStateUpdateResultAsync(jobInvoice, ct);
        }

        if (state is "PAID_CASH" or "PAID_EPOST" or "PAID_BANK_TRANSFER")
        {
            var paymentMethod = state switch
            {
                "PAID_CASH" => "cash",
                "PAID_EPOST" => "epost",
                _ => "bank_transfer",
            };

            var paymentDate = payload.PaymentDate ?? DateOnly.FromDateTime(DateTime.UtcNow);
            var amount = requiresExactPaymentMatch
                ? payload.Amount
                : payload.Amount is > 0
                    ? payload.Amount.Value
                    : ExtractAmountDue(jobInvoice.ResponsePayloadJson)
                    ?? ExtractInvoiceTotal(jobInvoice.ResponsePayloadJson)
                    ?? ExtractInvoiceTotal(jobInvoice.RequestPayloadJson);
            if (amount is null || (requiresExactPaymentMatch ? RoundMoney(amount.Value) <= 0 : amount.Value <= 0))
            {
                var error = requiresExactPaymentMatch
                    ? "EFTPOS payment amount must be greater than zero."
                    : "Unable to determine invoice payment amount.";
                return JobInvoiceStateUpdateResult.Fail(400, error);
            }

            if (requiresExactPaymentMatch)
            {
                var xeroAmountDue = ExtractAmountDue(jobInvoice.ResponsePayloadJson)
                    ?? ExtractInvoiceTotal(jobInvoice.ResponsePayloadJson);
                if (xeroAmountDue is null)
                {
                    return JobInvoiceStateUpdateResult.Fail(
                        409,
                        "Unable to verify the current Xero amount due. Refresh Xero and try matching again.");
                }

                var eftposAmount = RoundMoney(amount.Value);
                var expectedAmount = RoundMoney(xeroAmountDue.Value);
                if (eftposAmount != expectedAmount)
                {
                    return JobInvoiceStateUpdateResult.Fail(
                        409,
                        $"EFTPOS amount ${eftposAmount:0.00} does not match Xero amount due ${expectedAmount:0.00}. Correct Xero and try matching again.");
                }

                amount = eftposAmount;
            }

            var targetInvoiceStatus = paymentMethod == "cash" ? "DELETED" : "AUTHORISED";
            if (paymentMethod == "cash"
                && !string.Equals(jobInvoice.ExternalStatus, "DRAFT", StringComparison.OrdinalIgnoreCase)
                && !string.Equals(jobInvoice.ExternalStatus, "DELETED", StringComparison.OrdinalIgnoreCase))
            {
                return JobInvoiceStateUpdateResult.Fail(409, "Cash can only be saved while the Xero invoice is still Draft.");
            }

            if (!string.Equals(jobInvoice.ExternalStatus, targetInvoiceStatus, StringComparison.OrdinalIgnoreCase))
            {
                var statusSyncResult = await SyncInvoiceStatusAsync(jobInvoice, targetInvoiceStatus, ct);
                if (!statusSyncResult.Ok)
                {
                    var fallbackError = paymentMethod == "cash"
                        ? "Failed to delete invoice in Xero."
                        : "Failed to update invoice status in Xero.";
                    return JobInvoiceStateUpdateResult.Fail(
                        statusSyncResult.StatusCode,
                        statusSyncResult.Error ?? fallbackError,
                        statusSyncResult.Payload,
                        exactAmountVerified: requiresExactPaymentMatch);
                }

                job.InvoiceReference = jobInvoice.Reference;
                job.UpdatedAt = DateTime.UtcNow;
            }

            var latestExistingPayment = await _db.JobPayments
                .Where(x => x.JobInvoiceId == jobInvoice.Id)
                .OrderByDescending(x => x.CreatedAt)
                .FirstOrDefaultAsync(ct);

            var paymentReference = FirstNonEmpty(payload.Reference, paymentMethod == "epost" ? payload.EpostReferenceId : null);
            if (latestExistingPayment is null)
            {
                var jobPayment = BuildJobPayment(
                    jobInvoice,
                    paymentMethod,
                    amount.Value,
                    paymentDate,
                    paymentReference,
                    paymentMethod == "cash" ? "DELETED" : "AUTHORISED");
                _db.JobPayments.Add(jobPayment);
            }
            else
            {
                latestExistingPayment.Method = paymentMethod;
                latestExistingPayment.Amount = amount.Value;
                latestExistingPayment.PaymentDate = paymentDate;
                latestExistingPayment.Reference = paymentReference;
                latestExistingPayment.ExternalStatus = paymentMethod == "cash" ? "DELETED" : "AUTHORISED";
                latestExistingPayment.UpdatedAt = DateTime.UtcNow;
            }

            await _db.SaveChangesAsync(ct);

            return await BuildStateUpdateResultAsync(jobInvoice, ct, requiresExactPaymentMatch);
        }

        return JobInvoiceStateUpdateResult.Fail(400, $"Unsupported state '{payload.State}'.");
    }

    public async Task<JobInvoiceDeleteResult> DeleteDraftInXeroAsync(long jobId, CancellationToken ct)
    {
        await EnsureJobInvoicePdfColumnsAsync(ct);
        var jobInvoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (jobInvoice is null)
            return JobInvoiceDeleteResult.Success(false, "没有找到关联的 invoice，跳过 Xero 删除。");

        if (!string.Equals(jobInvoice.Provider, "xero", StringComparison.OrdinalIgnoreCase))
            return JobInvoiceDeleteResult.Success(false, "不是 Xero invoice，跳过 Xero 删除。");

        if (string.Equals(jobInvoice.ExternalStatus, "DELETED", StringComparison.OrdinalIgnoreCase))
            return JobInvoiceDeleteResult.Success(false, "Xero invoice 已经是 DELETED，跳过 Xero 删除。");

        if (string.IsNullOrWhiteSpace(jobInvoice.ExternalInvoiceId) || !Guid.TryParse(jobInvoice.ExternalInvoiceId, out var invoiceId))
            return JobInvoiceDeleteResult.Success(false, "没有找到 Xero invoice id，跳过 Xero 删除。");

        var remoteInvoiceResult = await _xeroInvoiceService.GetInvoiceByIdAsync(invoiceId, ct);
        if (!remoteInvoiceResult.Ok)
        {
            if (remoteInvoiceResult.StatusCode == 404)
                return JobInvoiceDeleteResult.Success(false, "Xero 中没有找到 invoice，跳过 Xero 删除。");

            return JobInvoiceDeleteResult.Fail(
                remoteInvoiceResult.StatusCode,
                remoteInvoiceResult.Error ?? "Failed to fetch Xero invoice before delete.",
                remoteInvoiceResult.Payload);
        }

        var remoteInvoice = ExtractInvoiceSummary(remoteInvoiceResult.Payload);
        if (string.Equals(remoteInvoice.Status, "DELETED", StringComparison.OrdinalIgnoreCase))
            return JobInvoiceDeleteResult.Success(false, "Xero invoice 已经是 DELETED，跳过 Xero 删除。");

        if (!string.Equals(jobInvoice.ExternalStatus, "DRAFT", StringComparison.OrdinalIgnoreCase))
        {
            return JobInvoiceDeleteResult.Fail(
                400,
                $"Only Xero draft invoices can be deleted when deleting a job. Current status: {jobInvoice.ExternalStatus ?? "UNKNOWN"}.");
        }

        var deleteResult = await SyncInvoiceStatusAsync(jobInvoice, "DELETED", ct);
        if (!deleteResult.Ok)
        {
            if (deleteResult.StatusCode == 404)
                return JobInvoiceDeleteResult.Success(false, "Xero 中没有找到 invoice，跳过 Xero 删除。");

            return JobInvoiceDeleteResult.Fail(deleteResult.StatusCode, deleteResult.Error ?? "Failed to delete Xero draft invoice.", deleteResult.Payload);
        }

        return JobInvoiceDeleteResult.Success(true, "Xero draft 已删除。");
    }

    public async Task<JobInvoiceContactUpdateResult> UpdateContactNameForJobAsync(long jobId, string contactName, CancellationToken ct)
    {
        await EnsureJobInvoicePdfColumnsAsync(ct);
        var normalizedContactName = contactName.Trim();
        if (string.IsNullOrWhiteSpace(normalizedContactName))
            return JobInvoiceContactUpdateResult.Fail(400, "Contact name is required.");

        var jobInvoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (jobInvoice is null)
            return JobInvoiceContactUpdateResult.Skipped("未找到关联 invoice，跳过 Contact Name 更新。");

        jobInvoice.ContactName = normalizedContactName;

        if (!string.Equals(jobInvoice.Provider, "xero", StringComparison.OrdinalIgnoreCase)
            || string.IsNullOrWhiteSpace(jobInvoice.ExternalInvoiceId)
            || !Guid.TryParse(jobInvoice.ExternalInvoiceId, out var invoiceId))
        {
            jobInvoice.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);
            return JobInvoiceContactUpdateResult.Success(jobInvoice, "已更新本地 invoice Contact Name。");
        }

        var request = BuildRequestFromPayload(jobInvoice.ResponsePayloadJson ?? jobInvoice.RequestPayloadJson, jobInvoice);
        request.InvoiceId = invoiceId;
        request.Contact.Name = normalizedContactName;

        if (request.LineItems.Count == 0)
        {
            jobInvoice.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);
            return JobInvoiceContactUpdateResult.Success(jobInvoice, "已更新本地 invoice Contact Name，但未能同步 Xero：缺少 line items。");
        }

        var syncResult = await _xeroInvoiceService.CreateInvoiceAsync(
            request,
            new XeroInvoiceCreateOptions
            {
                SummarizeErrors = true,
            },
            ct);

        if (!syncResult.Ok)
        {
            jobInvoice.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);
            return JobInvoiceContactUpdateResult.Fail(
                syncResult.StatusCode,
                syncResult.Error ?? "Failed to sync Xero draft invoice contact.",
                syncResult.Payload,
                jobInvoice);
        }

        ApplyInvoiceUpdate(jobInvoice, request, syncResult.Payload, syncResult.TenantId);
        await _db.SaveChangesAsync(ct);

        return JobInvoiceContactUpdateResult.Success(jobInvoice, "Invoice Contact Name 已更新。", syncResult.Payload);
    }

    private async Task<JobInvoiceCreateResult> SyncInvoiceStatusAsync(JobInvoice jobInvoice, string targetStatus, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(jobInvoice.ExternalInvoiceId) || !Guid.TryParse(jobInvoice.ExternalInvoiceId, out var invoiceId))
            return JobInvoiceCreateResult.Fail(400, "Missing Xero invoice id.");

        var request = BuildRequestFromPayload(jobInvoice.ResponsePayloadJson, jobInvoice);
        request.InvoiceId = invoiceId;
        request.Status = targetStatus;
        request.DueDate ??= request.Date ?? jobInvoice.InvoiceDate ?? DateOnly.FromDateTime(DateTime.UtcNow);

        var syncResult = await _xeroInvoiceService.UpdateInvoiceStatusAsync(invoiceId, targetStatus, request.DueDate, ct);

        if (!syncResult.Ok)
        {
            return JobInvoiceCreateResult.Fail(syncResult.StatusCode, syncResult.Error ?? "Failed to sync Xero invoice status.", syncResult.Payload, request);
        }

        ApplyInvoiceUpdate(jobInvoice, request, syncResult.Payload, syncResult.TenantId);
        return JobInvoiceCreateResult.Success(jobInvoice, alreadyExists: true, payload: syncResult.Payload, requestBody: request);
    }

    private async Task<(bool Ok, int StatusCode, string? Error)> TrySyncInvoicePdfAsync(
        JobInvoice jobInvoice,
        Guid invoiceId,
        CancellationToken ct)
    {
        try
        {
            var pdfResult = await _xeroInvoiceService.GetInvoicePdfByIdAsync(invoiceId, ct);
            if (!pdfResult.Ok || pdfResult.PdfBytes is null || pdfResult.PdfBytes.Length == 0)
            {
                _logger.LogWarning(
                    "Failed to sync invoice PDF for job invoice {JobInvoiceId} / Xero invoice {InvoiceId}: {Error}",
                    jobInvoice.Id,
                    invoiceId,
                    pdfResult.Error ?? "empty pdf response");
                return (
                    false,
                    pdfResult.StatusCode > 0 ? pdfResult.StatusCode : 502,
                    pdfResult.Error ?? "Failed to pull invoice PDF from Xero.");
            }

            var now = DateTime.UtcNow;
            var pdfPath = GetInvoicePdfPath(jobInvoice.Id);
            var previewPath = GetInvoicePdfPreviewPath(jobInvoice.Id);
            Directory.CreateDirectory(Path.GetDirectoryName(pdfPath)!);
            await File.WriteAllBytesAsync(pdfPath, pdfResult.PdfBytes, ct);

            var generatedPreviewPath = await TryGenerateInvoicePreviewAsync(pdfPath, previewPath, ct);
            byte[]? previewBytes = null;
            if (!string.IsNullOrWhiteSpace(generatedPreviewPath) && File.Exists(generatedPreviewPath))
            {
                previewBytes = await File.ReadAllBytesAsync(generatedPreviewPath, ct);
            }

            jobInvoice.PdfContent = pdfResult.PdfBytes;
            jobInvoice.PdfPreviewContent = previewBytes;
            jobInvoice.PdfFilePath = pdfPath;
            jobInvoice.PdfDownloadedAt = now;
            jobInvoice.PdfPreviewPath = generatedPreviewPath;
            jobInvoice.PdfPreviewGeneratedAt = generatedPreviewPath is null ? null : now;
            jobInvoice.UpdatedAt = now;
            await _db.SaveChangesAsync(ct);

            return (true, 200, null);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(
                ex,
                "Failed to store invoice PDF for job invoice {JobInvoiceId} / Xero invoice {InvoiceId}",
                jobInvoice.Id,
                invoiceId);
            return (false, 502, ex.Message);
        }
    }

    public async Task<JobInvoiceDocumentResult?> GetPdfAsync(long jobId, CancellationToken ct)
    {
        await EnsureJobInvoicePdfColumnsAsync(ct);
        var jobInvoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (jobInvoice is null)
            return null;

        var bytes = await ResolvePdfBytesAsync(jobInvoice, ct);
        if (bytes is null || bytes.Length == 0)
            return null;

        return new JobInvoiceDocumentResult(bytes, "application/pdf", BuildPdfDownloadFileName(jobInvoice));
    }

    public async Task<JobInvoiceDocumentResult?> GetPdfPreviewAsync(long jobId, CancellationToken ct)
    {
        await EnsureJobInvoicePdfColumnsAsync(ct);
        var jobInvoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (jobInvoice is null)
            return null;

        var bytes = await ResolvePreviewBytesAsync(jobInvoice, ct);
        if (bytes is null || bytes.Length == 0)
            return null;

        return new JobInvoiceDocumentResult(bytes, "image/png", BuildPdfPreviewFileName(jobInvoice));
    }

    private async Task<string?> TryGenerateInvoicePreviewAsync(string pdfPath, string previewPath, CancellationToken ct)
    {
        if (File.Exists(previewPath))
            File.Delete(previewPath);

        if (!OperatingSystem.IsMacOS() || !File.Exists("/usr/bin/qlmanage"))
            return null;

        var previewDirectory = Path.GetDirectoryName(previewPath);
        if (string.IsNullOrWhiteSpace(previewDirectory))
            return null;

        Directory.CreateDirectory(previewDirectory);

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

        if (File.Exists(previewPath))
            return previewPath;

        var expectedPrefix = Path.GetFileName(pdfPath);
        var generatedPreview = Directory.GetFiles(previewDirectory, $"{expectedPrefix}*.png")
            .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
            .FirstOrDefault();
        if (string.IsNullOrWhiteSpace(generatedPreview) || !File.Exists(generatedPreview))
            return null;

        File.Copy(generatedPreview, previewPath, overwrite: true);
        return previewPath;
    }

    private string GetInvoiceDirectory(long jobInvoiceId)
    {
        var dir = Path.Combine(_environment.ContentRootPath, "App_Data", "xero-invoices", jobInvoiceId.ToString(CultureInfo.InvariantCulture));
        Directory.CreateDirectory(dir);
        return dir;
    }

    private string GetInvoicePdfPath(long jobInvoiceId) => Path.Combine(GetInvoiceDirectory(jobInvoiceId), "invoice.pdf");

    private string GetInvoicePdfPreviewPath(long jobInvoiceId) => Path.Combine(GetInvoiceDirectory(jobInvoiceId), "invoice.pdf.png");

    private string? ResolvePdfPath(JobInvoice jobInvoice)
    {
        if (!string.IsNullOrWhiteSpace(jobInvoice.PdfFilePath))
            return jobInvoice.PdfFilePath;

        var derived = GetInvoicePdfPath(jobInvoice.Id);
        return File.Exists(derived) ? derived : null;
    }

    private string? ResolvePreviewPath(JobInvoice jobInvoice)
    {
        if (!string.IsNullOrWhiteSpace(jobInvoice.PdfPreviewPath))
            return jobInvoice.PdfPreviewPath;

        var derived = GetInvoicePdfPreviewPath(jobInvoice.Id);
        return File.Exists(derived) ? derived : null;
    }

    private async Task<byte[]?> ResolvePdfBytesAsync(JobInvoice jobInvoice, CancellationToken ct)
    {
        if (jobInvoice.PdfContent is { Length: > 0 })
            return jobInvoice.PdfContent;

        var pdfPath = ResolvePdfPath(jobInvoice);
        if (string.IsNullOrWhiteSpace(pdfPath) || !File.Exists(pdfPath))
            return null;

        var bytes = await File.ReadAllBytesAsync(pdfPath, ct);
        if (bytes.Length == 0)
            return null;

        jobInvoice.PdfContent = bytes;
        jobInvoice.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return bytes;
    }

    private async Task<byte[]?> ResolvePreviewBytesAsync(JobInvoice jobInvoice, CancellationToken ct)
    {
        if (jobInvoice.PdfPreviewContent is { Length: > 0 })
            return jobInvoice.PdfPreviewContent;

        var previewPath = ResolvePreviewPath(jobInvoice);
        if (string.IsNullOrWhiteSpace(previewPath) || !File.Exists(previewPath))
            return null;

        var bytes = await File.ReadAllBytesAsync(previewPath, ct);
        if (bytes.Length == 0)
            return null;

        jobInvoice.PdfPreviewContent = bytes;
        jobInvoice.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return bytes;
    }

    private static string BuildPdfDownloadFileName(JobInvoice jobInvoice)
    {
        var baseName = string.IsNullOrWhiteSpace(jobInvoice.ExternalInvoiceNumber)
            ? $"job-invoice-{jobInvoice.JobId.ToString(CultureInfo.InvariantCulture)}"
            : jobInvoice.ExternalInvoiceNumber.Trim();
        return $"{SanitizeFileName(baseName)}.pdf";
    }

    private static string BuildPdfPreviewFileName(JobInvoice jobInvoice)
    {
        var baseName = string.IsNullOrWhiteSpace(jobInvoice.ExternalInvoiceNumber)
            ? $"job-invoice-{jobInvoice.JobId.ToString(CultureInfo.InvariantCulture)}"
            : jobInvoice.ExternalInvoiceNumber.Trim();
        return $"{SanitizeFileName(baseName)}.png";
    }

    private static string SanitizeFileName(string fileName)
    {
        var raw = string.IsNullOrWhiteSpace(fileName) ? "attachment" : fileName.Trim();
        var invalid = Path.GetInvalidFileNameChars();
        var cleaned = new string(raw.Select(ch => invalid.Contains(ch) ? '_' : ch).ToArray());
        return string.IsNullOrWhiteSpace(cleaned) ? "attachment" : cleaned;
    }

    private void DeleteInvoiceDocuments(long jobInvoiceId)
    {
        var dir = Path.Combine(_environment.ContentRootPath, "App_Data", "xero-invoices", jobInvoiceId.ToString(CultureInfo.InvariantCulture));
        if (!Directory.Exists(dir))
            return;

        try
        {
            Directory.Delete(dir, recursive: true);
        }
        catch (IOException)
        {
        }
        catch (UnauthorizedAccessException)
        {
        }
    }

    private async Task<JobInvoiceStateUpdateResult> BuildStateUpdateResultAsync(
        JobInvoice jobInvoice,
        CancellationToken ct,
        bool exactAmountVerified = false)
    {
        var latestPayment = await _db.JobPayments.AsNoTracking()
            .Where(x => x.JobInvoiceId == jobInvoice.Id)
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefaultAsync(ct);

        return JobInvoiceStateUpdateResult.Success(jobInvoice, latestPayment, exactAmountVerified);
    }

    private string? ResolvePaymentAccountCode(string method) =>
        method switch
        {
            "cash" => FirstNonEmpty(_xeroPaymentOptions.CashAccountCode, _xeroPaymentOptions.DefaultAccountCode),
            "epost" => FirstNonEmpty(_xeroPaymentOptions.EpostAccountCode, _xeroPaymentOptions.DefaultAccountCode),
            "bank_transfer" => FirstNonEmpty(_xeroPaymentOptions.BankTransferAccountCode, _xeroPaymentOptions.DefaultAccountCode),
            _ => FirstNonEmpty(_xeroPaymentOptions.DefaultAccountCode),
        };

    private static string? FirstNonEmpty(params string?[] values) =>
        values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))?.Trim();

    private static JobPayment BuildJobPayment(
        JobInvoice jobInvoice,
        string method,
        decimal amount,
        DateOnly paymentDate,
        string? reference,
        string externalStatus)
    {
        var now = DateTime.UtcNow;
        return new JobPayment
        {
            JobId = jobInvoice.JobId,
            JobInvoiceId = jobInvoice.Id,
            Provider = "system",
            ExternalPaymentId = null,
            ExternalInvoiceId = jobInvoice.ExternalInvoiceId,
            Method = method,
            Amount = amount,
            PaymentDate = paymentDate,
            Reference = reference,
            AccountCode = null,
            ExternalStatus = externalStatus,
            RequestPayloadJson = null,
            ResponsePayloadJson = null,
            CreatedAt = now,
            UpdatedAt = now,
        };
    }

    private static decimal? ExtractAmountDue(string? payloadJson) => ExtractDecimalFromInvoicePayload(payloadJson, "AmountDue");

    private static decimal? ExtractInvoiceTotal(string? payloadJson) => ExtractDecimalFromInvoicePayload(payloadJson, "Total");

    private static decimal RoundMoney(decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);

    private static decimal? ExtractDecimalFromInvoicePayload(string? payloadJson, string propertyName)
    {
        if (string.IsNullOrWhiteSpace(payloadJson)) return null;
        try
        {
            using var document = JsonDocument.Parse(payloadJson);
            if (!document.RootElement.TryGetProperty("Invoices", out var invoices) || invoices.ValueKind != JsonValueKind.Array)
                return null;
            var invoice = invoices.EnumerateArray().FirstOrDefault();
            if (invoice.ValueKind == JsonValueKind.Undefined)
                return null;
            if (!invoice.TryGetProperty(propertyName, out var property))
                return null;
            return property.TryGetDecimal(out var value) ? value : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private async Task<CreateXeroInvoiceRequest> BuildCatalogMappedCreateRequestAsync(
        Job job,
        Customer customer,
        Vehicle vehicle,
        IReadOnlyList<JobServiceSelection> serviceSelections,
        IReadOnlyList<JobPartsService> partsServices,
        JobPaintService? paintService,
        CancellationToken ct)
    {
        await EnsureServiceCatalogSeededAsync(ct);

        var reference = BuildReference(job, customer, vehicle);
        var contactName = BuildContactName(customer, vehicle);
        if (string.IsNullOrWhiteSpace(contactName))
            throw new InvalidOperationException("Unable to derive contact name for invoice.");

        var serviceContext = await LoadCatalogMappedServiceContextAsync(customer, serviceSelections, ct);
        var requestedCodes = new HashSet<string>(serviceContext.RequestedCodes, StringComparer.OrdinalIgnoreCase);
        if (partsServices.Any(x => !string.IsNullOrWhiteSpace(x.Description)))
            requestedCodes.Add(JobInvoicePartsLineItemBuilder.DefaultItemCode);

        var inventoryByCode = await LoadInventoryByCodesAsync(requestedCodes, ct);
        var lineItems = BuildCatalogMappedServiceLineItems(
            customer,
            job.Id,
            serviceSelections,
            paintService,
            serviceContext.CatalogItemsById,
            serviceContext.OverrideByServiceId,
            inventoryByCode);

        inventoryByCode.TryGetValue(JobInvoicePartsLineItemBuilder.DefaultItemCode, out var partsInventoryItem);
        lineItems.AddRange(JobInvoicePartsLineItemBuilder.Build(partsServices, partsInventoryItem));

        AppendManagedJobContentLine(lineItems, "JOB-NOTES", job.Notes);
        AppendManagedJobContentLine(lineItems, "OTHER-NOTES", job.PrivateNotes);

        if (lineItems.Count == 0)
        {
            lineItems.Add(new XeroInvoiceLineItemInput
            {
                Description = "Job draft",
                Quantity = 1m,
                UnitAmount = 0m,
            });
        }

        lineItems = await SanitizeLineItemsAsync(lineItems, ct, inventoryByCode);

        return new CreateXeroInvoiceRequest
        {
            Type = "ACCREC",
            Status = "DRAFT",
            LineAmountTypes = "Exclusive",
            Date = DateOnly.FromDateTime(DateTime.UtcNow),
            Reference = reference,
            Contact = new XeroInvoiceContactInput
            {
                Name = contactName,
            },
            LineItems = lineItems,
        };
    }

    private async Task<List<XeroInvoiceLineItemInput>> BuildCatalogMappedServiceLineItemsAsync(
        Customer customer,
        long jobId,
        IReadOnlyList<JobServiceSelection> serviceSelections,
        JobPaintService? paintService,
        CancellationToken ct)
    {
        await EnsureServiceCatalogSeededAsync(ct);

        var serviceContext = await LoadCatalogMappedServiceContextAsync(customer, serviceSelections, ct);
        var inventoryByCode = await LoadInventoryByCodesAsync(serviceContext.RequestedCodes, ct);
        return BuildCatalogMappedServiceLineItems(
            customer,
            jobId,
            serviceSelections,
            paintService,
            serviceContext.CatalogItemsById,
            serviceContext.OverrideByServiceId,
            inventoryByCode);
    }

    private async Task<List<XeroInvoiceLineItemInput>> SanitizeLineItemsAsync(
        IEnumerable<XeroInvoiceLineItemInput> lineItems,
        CancellationToken ct,
        IReadOnlyDictionary<string, InventoryItem>? preloadedInventoryByCode = null)
    {
        var normalized = lineItems
            .Where(item => !string.IsNullOrWhiteSpace(item.Description))
            .Select(item => new XeroInvoiceLineItemInput
            {
                Description = item.Description.Trim(),
                Quantity = item.Quantity,
                UnitAmount = item.UnitAmount,
                LineAmount = item.LineAmount,
                ItemCode = item.ItemCode?.Trim(),
                AccountCode = item.AccountCode?.Trim(),
                TaxType = NormalizeXeroTaxType(item.TaxType),
                TaxAmount = item.TaxAmount,
                DiscountRate = item.DiscountRate,
                DiscountAmount = item.DiscountAmount,
            })
            .ToList();

        if (normalized.Count == 0)
            return normalized;

        var requestedCodes = normalized
            .Select(item => item.ItemCode)
            .Where(code => !string.IsNullOrWhiteSpace(code))
            .Cast<string>()
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var inventoryByCode = preloadedInventoryByCode is null
            ? new Dictionary<string, InventoryItem>(StringComparer.OrdinalIgnoreCase)
            : new Dictionary<string, InventoryItem>(preloadedInventoryByCode, StringComparer.OrdinalIgnoreCase);
        var missingCodes = requestedCodes
            .Where(code => !inventoryByCode.ContainsKey(code))
            .ToArray();

        if (missingCodes.Length > 0)
        {
            foreach (var entry in await LoadInventoryByCodesAsync(missingCodes, ct))
                inventoryByCode[entry.Key] = entry.Value;
        }

        return normalized
            .Select(item =>
            {
                inventoryByCode.TryGetValue(item.ItemCode ?? "", out var inventoryItem);

                return new XeroInvoiceLineItemInput
                {
                    Description = inventoryItem is null
                        ? item.Description
                        : ResolveInventoryLineDescription(inventoryItem, item.Description),
                    Quantity = item.Quantity,
                    UnitAmount = item.UnitAmount,
                    LineAmount = item.LineAmount,
                    ItemCode = inventoryItem?.ItemCode ?? item.ItemCode?.Trim(),
                    AccountCode = item.AccountCode,
                    TaxType = item.TaxType,
                    TaxAmount = item.TaxAmount,
                    DiscountRate = item.DiscountRate,
                    DiscountAmount = item.DiscountAmount,
                };
            })
            .ToList();
    }

    private async Task<CatalogMappedServiceContext> LoadCatalogMappedServiceContextAsync(
        Customer customer,
        IReadOnlyList<JobServiceSelection> serviceSelections,
        CancellationToken ct)
    {
        var selectionIds = serviceSelections
            .Select(x => x.ServiceCatalogItemId)
            .Distinct()
            .ToArray();

        if (selectionIds.Length == 0)
        {
            return new CatalogMappedServiceContext(
                new Dictionary<long, ServiceCatalogItem>(),
                new Dictionary<long, string>(),
                new HashSet<string>(StringComparer.OrdinalIgnoreCase));
        }

        var catalogItemsById = await _referenceDataCache.GetServiceCatalogItemsByIdsAsync(selectionIds, ct);
        var overrideByServiceId = (await _referenceDataCache.GetCustomerServicePricesAsync(customer.Id, ct))
            .Where(x => x.IsActive && selectionIds.Contains(x.ServiceCatalogItemId))
            .GroupBy(x => x.ServiceCatalogItemId)
            .ToDictionary(x => x.Key, x => x.First().XeroItemCode.Trim());

        var requestedCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var selection in serviceSelections)
        {
            if (!catalogItemsById.TryGetValue(selection.ServiceCatalogItemId, out var catalogItem))
                continue;

            var resolvedCode = ResolveCatalogItemCode(customer, catalogItem, overrideByServiceId);
            if (!string.IsNullOrWhiteSpace(resolvedCode))
                requestedCodes.Add(resolvedCode);
        }

        return new CatalogMappedServiceContext(catalogItemsById, overrideByServiceId, requestedCodes);
    }

    private async Task<Dictionary<string, InventoryItem>> LoadInventoryByCodesAsync(
        IEnumerable<string> requestedCodes,
        CancellationToken ct)
    {
        var normalizedCodes = requestedCodes
            .Where(code => !string.IsNullOrWhiteSpace(code))
            .Select(code => code.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (normalizedCodes.Length == 0)
            return new Dictionary<string, InventoryItem>(StringComparer.OrdinalIgnoreCase);

        return await _referenceDataCache.GetInventoryByCodesAsync(normalizedCodes, ct);
    }

    private List<XeroInvoiceLineItemInput> BuildCatalogMappedServiceLineItems(
        Customer customer,
        long jobId,
        IReadOnlyList<JobServiceSelection> serviceSelections,
        JobPaintService? paintService,
        IReadOnlyDictionary<long, ServiceCatalogItem> catalogItemsById,
        IReadOnlyDictionary<long, string> overrideByServiceId,
        IReadOnlyDictionary<string, InventoryItem> inventoryByCode)
    {
        var lineItems = new List<XeroInvoiceLineItemInput>();
        foreach (var selection in serviceSelections)
        {
            if (!catalogItemsById.TryGetValue(selection.ServiceCatalogItemId, out var catalogItem))
                continue;

            overrideByServiceId.TryGetValue(catalogItem.Id, out var overrideCode);
            var trace = ResolveCatalogItemCodeTrace(customer, catalogItem, overrideCode);
            var description = ResolveSelectionDescription(selection, catalogItem, paintService);
            inventoryByCode.TryGetValue(trace.ResolvedCode ?? "", out var inventoryItem);

            _logger.LogInformation(
                "Job invoice code trace for job {JobId}: customer {CustomerId} ({CustomerType}), service {ServiceCatalogItemId} {ServiceType}/{Category}, source {Source}, sourceCode {SourceCode}, resolvedCode {ResolvedCode}, inventoryMatched {InventoryMatched}",
                jobId,
                customer.Id,
                customer.Type,
                catalogItem.Id,
                catalogItem.ServiceType,
                catalogItem.Category,
                trace.Source,
                trace.SourceCode ?? "<null>",
                trace.ResolvedCode ?? "<null>",
                inventoryItem is not null);

            lineItems.Add(BuildConfiguredLineItem(trace.ResolvedCode, description, inventoryItem, fallbackUnitAmount: 0m, useInventoryPrice: true));
        }

        return lineItems;
    }

    private sealed record CatalogItemCodeTrace(string? ResolvedCode, string Source, string? SourceCode);

    private sealed record CatalogMappedServiceContext(
        Dictionary<long, ServiceCatalogItem> CatalogItemsById,
        Dictionary<long, string> OverrideByServiceId,
        HashSet<string> RequestedCodes);

    private static string? ResolveCatalogItemCode(
        Customer customer,
        ServiceCatalogItem catalogItem,
        IReadOnlyDictionary<long, string> overrideByServiceId)
    {
        overrideByServiceId.TryGetValue(catalogItem.Id, out var overrideCode);
        return ResolveCatalogItemCodeTrace(customer, catalogItem, overrideCode).ResolvedCode;
    }

    private static CatalogItemCodeTrace ResolveCatalogItemCodeTrace(
        Customer customer,
        ServiceCatalogItem catalogItem,
        string? overrideCode)
    {
        var normalizedOverrideCode = overrideCode?.Trim();
        if (!string.IsNullOrWhiteSpace(normalizedOverrideCode))
        {
            return new CatalogItemCodeTrace(
                normalizedOverrideCode,
                "customer_service_price.override",
                normalizedOverrideCode);
        }

        var isPersonal = string.Equals(customer.Type, "Personal", StringComparison.OrdinalIgnoreCase);
        var defaultCode = isPersonal ? catalogItem.PersonalLinkCode : catalogItem.DealershipLinkCode;
        var normalizedDefaultCode = defaultCode?.Trim();
        if (!string.IsNullOrWhiteSpace(normalizedDefaultCode))
        {
            return new CatalogItemCodeTrace(
                normalizedDefaultCode,
                isPersonal ? "catalog.personal_link_code" : "catalog.dealership_link_code",
                normalizedDefaultCode);
        }

        var fallbackCode = ResolveRootFallbackCode(customer, catalogItem);
        if (!string.IsNullOrWhiteSpace(fallbackCode))
        {
            var source = string.Equals(customer.Type, "Personal", StringComparison.OrdinalIgnoreCase)
                ? "catalog.root_personal_fallback_code"
                : "catalog.root_fallback_code";
            return new CatalogItemCodeTrace(fallbackCode, source, fallbackCode);
        }

        return new CatalogItemCodeTrace(null, "catalog.none", null);
    }

    private static string? ResolveRootFallbackCode(Customer customer, ServiceCatalogItem catalogItem)
    {
        if (!string.Equals(catalogItem.Category, "root", StringComparison.OrdinalIgnoreCase))
            return null;

        var isPersonal = string.Equals(customer.Type, "Personal", StringComparison.OrdinalIgnoreCase);

        return catalogItem.ServiceType.Trim().ToLowerInvariant() switch
        {
            "wof" => isPersonal ? "208-WOF" : "WOF-DEALERSHIP",
            "mech" => isPersonal ? "666WORSHOP Labour Fee" : "203-Services",
            "paint" => "206-PNP-L",
            _ => null,
        };
    }

    private Task EnsureServiceCatalogSeededAsync(CancellationToken ct)
        => _serviceCatalogService.EnsureSeededAsync(ct);

    private static string ResolveSelectionDescription(
        JobServiceSelection selection,
        ServiceCatalogItem catalogItem,
        JobPaintService? paintService)
    {
        var description = string.IsNullOrWhiteSpace(selection.ServiceNameSnapshot)
            ? catalogItem.Name.Trim()
            : selection.ServiceNameSnapshot.Trim();

        if (catalogItem.ServiceType == "paint" &&
            string.Equals(catalogItem.Category, "root", StringComparison.OrdinalIgnoreCase) &&
            paintService is not null &&
            paintService.Panels > 0)
        {
            return $"{description} - {paintService.Panels} panel(s)";
        }

        return description;
    }

    private static XeroInvoiceLineItemInput BuildConfiguredLineItem(
        string? itemCode,
        string description,
        InventoryItem? inventoryItem,
        decimal fallbackUnitAmount,
        bool useInventoryPrice)
    {
        if (inventoryItem is not null)
        {
            return new XeroInvoiceLineItemInput
            {
                ItemCode = string.IsNullOrWhiteSpace(itemCode) ? inventoryItem.ItemCode : itemCode.Trim(),
                Description = ResolveInventoryLineDescription(inventoryItem, description),
                Quantity = 1m,
                UnitAmount = useInventoryPrice
                    ? inventoryItem.SalesUnitPrice ?? inventoryItem.PurchasesUnitPrice ?? fallbackUnitAmount
                    : fallbackUnitAmount,
                AccountCode = inventoryItem.SalesAccount ?? inventoryItem.PurchasesAccount,
                TaxType = NormalizeXeroTaxType(inventoryItem.SalesTaxRate ?? inventoryItem.PurchasesTaxRate),
            };
        }

        return new XeroInvoiceLineItemInput
        {
            ItemCode = string.IsNullOrWhiteSpace(itemCode) ? null : itemCode.Trim(),
            Description = description,
            Quantity = 1m,
            UnitAmount = fallbackUnitAmount,
        };
    }

    private static string ResolveInventoryLineDescription(InventoryItem inventoryItem, string fallbackDescription)
    {
        var salesDescription = inventoryItem.SalesDescription?.Trim();
        if (!string.IsNullOrWhiteSpace(salesDescription))
            return salesDescription;

        var itemName = inventoryItem.ItemName?.Trim();
        if (!string.IsNullOrWhiteSpace(itemName))
            return itemName;

        return fallbackDescription;
    }

    private static string? NormalizeXeroTaxType(string? value)
    {
        var normalized = value?.Trim();
        if (string.IsNullOrWhiteSpace(normalized))
            return null;

        return normalized switch
        {
            "15% GST on Income" => "OUTPUT2",
            "15% GST on Expenses" => "INPUT2",
            "No GST" => "NONE",
            _ when normalized.Contains(' ') || normalized.Contains('%') => null,
            _ => normalized,
        };
    }

    private static string BuildLineItemIdentity(XeroInvoiceLineItemInput item)
    {
        var itemCode = item.ItemCode?.Trim().ToUpperInvariant() ?? "";
        var description = item.Description.Trim().ToUpperInvariant();
        var quantity = (item.Quantity ?? 0m).ToString("0.####", System.Globalization.CultureInfo.InvariantCulture);
        var unitAmount = (item.UnitAmount ?? 0m).ToString("0.####", System.Globalization.CultureInfo.InvariantCulture);
        return $"{itemCode}|{description}|{quantity}|{unitAmount}";
    }

    private static string BuildReference(Job job, Customer customer, Vehicle vehicle)
        => BuildReference(job.PoNumber, customer, vehicle);

    private static string BuildReference(string? poNumber, Customer customer, Vehicle vehicle)
    {
        if (string.Equals(customer.Type, "Personal", StringComparison.OrdinalIgnoreCase))
            return string.Empty;

        var rego = string.IsNullOrWhiteSpace(vehicle.Plate) ? "[REGO]" : vehicle.Plate.Trim().ToUpperInvariant();
        var poPrefix = string.IsNullOrWhiteSpace(poNumber)
            ? "PO# Pending"
            : $"PO# {poNumber.Trim()}";
        var year = vehicle.Year.HasValue && vehicle.Year.Value > 0 ? vehicle.Year.Value.ToString() : "[YEAR]";
        var make = string.IsNullOrWhiteSpace(vehicle.Make) ? "[MAKE]" : vehicle.Make.Trim();
        var model = string.IsNullOrWhiteSpace(vehicle.Model) ? "[MODEL]" : vehicle.Model.Trim();

        return $"{poPrefix} {rego} {year} {make} {model}";
    }

    private static string BuildContactName(Customer customer, Vehicle vehicle)
    {
        if (!string.Equals(customer.Type, "Personal", StringComparison.OrdinalIgnoreCase))
            return customer.Name.Trim();

        var rego = vehicle.Plate?.Trim().ToUpperInvariant();
        var vehicleSummary = string.Join(
            ' ',
            new[]
            {
                vehicle.Year > 0 ? vehicle.Year.ToString() : null,
                vehicle.Make,
                vehicle.Model,
            }
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x!.Trim().ToUpperInvariant()));

        if (!string.IsNullOrWhiteSpace(rego) && !string.IsNullOrWhiteSpace(vehicleSummary))
            return $"{rego}-{vehicleSummary}";

        if (!string.IsNullOrWhiteSpace(rego))
            return rego;

        return !string.IsNullOrWhiteSpace(vehicleSummary)
            ? vehicleSummary
            : customer.Name.Trim();
    }

    private static JobInvoice BuildJobInvoice(long jobId, CreateXeroInvoiceRequest request, object? payload, string? tenantId)
    {
        var now = DateTime.UtcNow;
        var jobInvoice = new JobInvoice
        {
            JobId = jobId,
            Provider = "xero",
            CreatedAt = now,
            UpdatedAt = now,
        };
        ApplyInvoiceUpdate(jobInvoice, request, payload, tenantId);
        return jobInvoice;
    }

    internal static CreateXeroInvoiceRequest BuildReferenceUpdateRequestFromExistingInvoice(
        JobInvoice invoice,
        Guid invoiceId,
        string reference)
    {
        var fallback = new CreateXeroInvoiceRequest
        {
            InvoiceId = invoiceId,
            Status = invoice.ExternalStatus ?? "DRAFT",
            Reference = invoice.Reference,
            Date = invoice.InvoiceDate,
            LineAmountTypes = invoice.LineAmountTypes,
            Contact = new XeroInvoiceContactInput
            {
                Name = invoice.ContactName,
            },
        };

        var storedRequest = TryDeserializeStoredRequest(invoice.RequestPayloadJson) ?? new CreateXeroInvoiceRequest();
        var request = MergeRequestWithFallback(storedRequest, fallback);
        request.InvoiceId = invoiceId;
        request.Reference = reference.Trim();
        return request;
    }

    private static CreateXeroInvoiceRequest BuildRequestFromPayload(object? payload, JobInvoice existing)
    {
        var fallback = new CreateXeroInvoiceRequest
        {
            InvoiceId = Guid.TryParse(existing.ExternalInvoiceId, out var existingId) ? existingId : null,
            Status = existing.ExternalStatus ?? "DRAFT",
            Reference = existing.Reference,
            Date = existing.InvoiceDate,
            LineAmountTypes = existing.LineAmountTypes,
            Contact = new XeroInvoiceContactInput
            {
                Name = existing.ContactName,
            },
        };
        var storedRequest = TryDeserializeStoredRequest(existing.RequestPayloadJson) ?? new CreateXeroInvoiceRequest();
        var baseRequest = MergeRequestWithFallback(storedRequest, fallback);

        if (payload is null)
            return baseRequest;

        try
        {
            using var document = payload switch
            {
                string raw when !string.IsNullOrWhiteSpace(raw) => JsonDocument.Parse(raw),
                _ => JsonDocument.Parse(JsonSerializer.Serialize(payload, JsonOptions)),
            };
            if (!TryGetInvoices(document.RootElement, out var invoices))
                return baseRequest;

            var invoice = invoices.EnumerateArray().FirstOrDefault();
            if (invoice.ValueKind == JsonValueKind.Undefined)
                return baseRequest;

            var request = new CreateXeroInvoiceRequest
            {
                InvoiceId = invoice.TryGetProperty("InvoiceID", out var invoiceIdProp) &&
                            invoiceIdProp.ValueKind == JsonValueKind.String &&
                            Guid.TryParse(invoiceIdProp.GetString(), out var parsedInvoiceId)
                    ? parsedInvoiceId
                    : baseRequest.InvoiceId,
                Type = invoice.TryGetProperty("Type", out var typeProp) && typeProp.ValueKind == JsonValueKind.String
                    ? typeProp.GetString() ?? baseRequest.Type
                    : baseRequest.Type,
                Status = invoice.TryGetProperty("Status", out var statusProp) && statusProp.ValueKind == JsonValueKind.String
                    ? statusProp.GetString() ?? baseRequest.Status
                    : baseRequest.Status,
                LineAmountTypes = invoice.TryGetProperty("LineAmountTypes", out var lineAmountProp) && lineAmountProp.ValueKind == JsonValueKind.String
                    ? lineAmountProp.GetString() ?? baseRequest.LineAmountTypes
                    : baseRequest.LineAmountTypes,
                Date = invoice.TryGetProperty("DateString", out var dateStringProp) &&
                       dateStringProp.ValueKind == JsonValueKind.String &&
                       DateOnly.TryParse(dateStringProp.GetString(), out var parsedDate)
                    ? parsedDate
                    : baseRequest.Date,
                Reference = invoice.TryGetProperty("Reference", out var referenceProp) && referenceProp.ValueKind == JsonValueKind.String
                    ? referenceProp.GetString() ?? baseRequest.Reference
                    : baseRequest.Reference,
                InvoiceNumber = invoice.TryGetProperty("InvoiceNumber", out var invoiceNumberProp) && invoiceNumberProp.ValueKind == JsonValueKind.String
                    ? invoiceNumberProp.GetString() ?? baseRequest.InvoiceNumber
                    : baseRequest.InvoiceNumber,
                DueDate = baseRequest.DueDate,
                ExpectedPaymentDate = baseRequest.ExpectedPaymentDate,
                PlannedPaymentDate = baseRequest.PlannedPaymentDate,
                BrandingThemeId = baseRequest.BrandingThemeId,
                CurrencyCode = baseRequest.CurrencyCode,
                CurrencyRate = baseRequest.CurrencyRate,
                SentToContact = baseRequest.SentToContact,
                Url = baseRequest.Url,
                Contact = new XeroInvoiceContactInput
                {
                    ContactId = baseRequest.Contact.ContactId,
                    Name = invoice.TryGetProperty("Contact", out var contactProp) &&
                           contactProp.ValueKind == JsonValueKind.Object &&
                           contactProp.TryGetProperty("Name", out var contactNameProp) &&
                           contactNameProp.ValueKind == JsonValueKind.String
                        ? contactNameProp.GetString() ?? baseRequest.Contact.Name
                        : baseRequest.Contact.Name,
                    EmailAddress = baseRequest.Contact.EmailAddress,
                    ContactNumber = baseRequest.Contact.ContactNumber,
                },
            };

            if (invoice.TryGetProperty("LineItems", out var lineItemsProp) && lineItemsProp.ValueKind == JsonValueKind.Array)
            {
                request.LineItems = lineItemsProp.EnumerateArray()
                    .Select((item, index) =>
                    {
                        var storedLineItem = index < baseRequest.LineItems.Count ? baseRequest.LineItems[index] : null;
                        return new XeroInvoiceLineItemInput
                        {
                            Description = item.TryGetProperty("Description", out var descriptionProp) && descriptionProp.ValueKind == JsonValueKind.String
                                ? descriptionProp.GetString() ?? storedLineItem?.Description ?? ""
                                : storedLineItem?.Description ?? "",
                            Quantity = item.TryGetProperty("Quantity", out var quantityProp) && quantityProp.TryGetDecimal(out var quantity)
                                ? quantity
                                : storedLineItem?.Quantity ?? 1m,
                            UnitAmount = item.TryGetProperty("UnitAmount", out var unitAmountProp) && unitAmountProp.TryGetDecimal(out var unitAmount)
                                ? unitAmount
                                : storedLineItem?.UnitAmount,
                            LineAmount = item.TryGetProperty("LineAmount", out var lineAmountItemProp) && lineAmountItemProp.TryGetDecimal(out var lineAmount)
                                ? lineAmount
                                : storedLineItem?.LineAmount,
                            ItemCode = item.TryGetProperty("ItemCode", out var itemCodeProp) && itemCodeProp.ValueKind == JsonValueKind.String
                                ? itemCodeProp.GetString() ?? storedLineItem?.ItemCode
                                : storedLineItem?.ItemCode,
                            AccountCode = item.TryGetProperty("AccountCode", out var accountCodeProp) && accountCodeProp.ValueKind == JsonValueKind.String
                                ? accountCodeProp.GetString() ?? storedLineItem?.AccountCode
                                : storedLineItem?.AccountCode,
                            TaxType = item.TryGetProperty("TaxType", out var taxTypeProp) && taxTypeProp.ValueKind == JsonValueKind.String
                                ? taxTypeProp.GetString() ?? storedLineItem?.TaxType
                                : storedLineItem?.TaxType,
                            TaxAmount = item.TryGetProperty("TaxAmount", out var taxAmountProp) && taxAmountProp.TryGetDecimal(out var taxAmount)
                                ? taxAmount
                                : storedLineItem?.TaxAmount,
                            DiscountRate = item.TryGetProperty("DiscountRate", out var discountRateProp) && discountRateProp.TryGetDecimal(out var discountRate)
                                ? discountRate
                                : storedLineItem?.DiscountRate,
                            DiscountAmount = item.TryGetProperty("DiscountAmount", out var discountAmountProp) && discountAmountProp.TryGetDecimal(out var discountAmount)
                                ? discountAmount
                                : storedLineItem?.DiscountAmount,
                        };
                    })
                    .Where(x => !string.IsNullOrWhiteSpace(x.Description) || !string.IsNullOrWhiteSpace(x.ItemCode))
                    .ToList();
            }
            else
            {
                request.LineItems = baseRequest.LineItems;
            }

            return request;
        }
        catch (JsonException)
        {
            return baseRequest;
        }
    }

    private static CreateXeroInvoiceRequest? TryDeserializeStoredRequest(string? payloadJson)
    {
        if (string.IsNullOrWhiteSpace(payloadJson))
            return null;

        try
        {
            return JsonSerializer.Deserialize<CreateXeroInvoiceRequest>(payloadJson, JsonOptions);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static CreateXeroInvoiceRequest MergeRequestWithFallback(CreateXeroInvoiceRequest source, CreateXeroInvoiceRequest fallback)
    {
        return new CreateXeroInvoiceRequest
        {
            InvoiceId = source.InvoiceId ?? fallback.InvoiceId,
            Type = string.IsNullOrWhiteSpace(source.Type) ? fallback.Type : source.Type,
            Status = string.IsNullOrWhiteSpace(source.Status) ? fallback.Status : source.Status,
            LineAmountTypes = string.IsNullOrWhiteSpace(source.LineAmountTypes) ? fallback.LineAmountTypes : source.LineAmountTypes,
            Date = source.Date ?? fallback.Date,
            DueDate = source.DueDate ?? fallback.DueDate,
            ExpectedPaymentDate = source.ExpectedPaymentDate ?? fallback.ExpectedPaymentDate,
            PlannedPaymentDate = source.PlannedPaymentDate ?? fallback.PlannedPaymentDate,
            InvoiceNumber = string.IsNullOrWhiteSpace(source.InvoiceNumber) ? fallback.InvoiceNumber : source.InvoiceNumber,
            Reference = string.IsNullOrWhiteSpace(source.Reference) ? fallback.Reference : source.Reference,
            BrandingThemeId = source.BrandingThemeId ?? fallback.BrandingThemeId,
            CurrencyCode = string.IsNullOrWhiteSpace(source.CurrencyCode) ? fallback.CurrencyCode : source.CurrencyCode,
            CurrencyRate = source.CurrencyRate ?? fallback.CurrencyRate,
            SentToContact = source.SentToContact ?? fallback.SentToContact,
            Url = string.IsNullOrWhiteSpace(source.Url) ? fallback.Url : source.Url,
            Contact = new XeroInvoiceContactInput
            {
                ContactId = source.Contact.ContactId ?? fallback.Contact.ContactId,
                Name = string.IsNullOrWhiteSpace(source.Contact.Name) ? fallback.Contact.Name : source.Contact.Name,
                EmailAddress = string.IsNullOrWhiteSpace(source.Contact.EmailAddress) ? fallback.Contact.EmailAddress : source.Contact.EmailAddress,
                ContactNumber = string.IsNullOrWhiteSpace(source.Contact.ContactNumber) ? fallback.Contact.ContactNumber : source.Contact.ContactNumber,
            },
            LineItems = source.LineItems.Count > 0 ? source.LineItems : fallback.LineItems,
        };
    }

    private static void ApplyInvoiceUpdate(JobInvoice jobInvoice, CreateXeroInvoiceRequest request, object? payload, string? tenantId)
    {
        var extracted = ExtractInvoiceSummary(payload);
        jobInvoice.ExternalInvoiceId = extracted.InvoiceId ?? request.InvoiceId?.ToString();
        jobInvoice.ExternalInvoiceNumber = extracted.InvoiceNumber;
        jobInvoice.ExternalStatus = extracted.Status ?? request.Status;
        jobInvoice.Reference = extracted.Reference ?? request.Reference;
        jobInvoice.ContactName = extracted.ContactName ?? request.Contact.Name;
        jobInvoice.InvoiceDate = extracted.Date ?? request.Date;
        jobInvoice.LineAmountTypes = request.LineAmountTypes;
        jobInvoice.TenantId = tenantId;
        jobInvoice.RequestPayloadJson = JsonSerializer.Serialize(request, JsonOptions);
        jobInvoice.ResponsePayloadJson = payload is null ? null : JsonSerializer.Serialize(payload, JsonOptions);
        jobInvoice.UpdatedAt = DateTime.UtcNow;
    }

    private static ExtractedInvoiceSummary ExtractInvoiceSummary(object? payload) =>
        ExtractInvoiceSummaries(payload).FirstOrDefault() ?? new ExtractedInvoiceSummary();

    private static List<ExtractedInvoiceSummary> ExtractInvoiceSummaries(object? payload)
    {
        if (payload is null)
            return [];

        var json = JsonSerializer.Serialize(payload, JsonOptions);
        if (string.IsNullOrWhiteSpace(json))
            return [];

        try
        {
            using var document = JsonDocument.Parse(json);
            if (!TryGetInvoices(document.RootElement, out var invoices))
                return [];

            return invoices.EnumerateArray()
                .Select(invoice =>
                {
                    var contactName = invoice.TryGetProperty("Contact", out var contact) && contact.ValueKind == JsonValueKind.Object &&
                                      contact.TryGetProperty("Name", out var nameElement)
                        ? nameElement.GetString()
                        : null;

                    DateOnly? date = null;
                    if (invoice.TryGetProperty("DateString", out var dateStringElement) && dateStringElement.ValueKind == JsonValueKind.String &&
                        DateOnly.TryParse(dateStringElement.GetString(), out var parsedDateString))
                    {
                        date = parsedDateString;
                    }
                    else if (invoice.TryGetProperty("Date", out var dateElement) && dateElement.ValueKind == JsonValueKind.String &&
                             DateTime.TryParse(dateElement.GetString(), out var parsedDateTime))
                    {
                        date = DateOnly.FromDateTime(parsedDateTime);
                    }

                    return new ExtractedInvoiceSummary
                    {
                        InvoiceId = TryGetString(invoice, "InvoiceID"),
                        InvoiceNumber = TryGetString(invoice, "InvoiceNumber"),
                        Status = TryGetString(invoice, "Status"),
                        Reference = TryGetString(invoice, "Reference"),
                        ContactName = contactName,
                        Date = date,
                    };
                })
                .ToList();
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static Dictionary<Guid, object> ExtractSingleInvoicePayloadsById(object? payload)
    {
        if (payload is null)
            return [];

        var json = JsonSerializer.Serialize(payload, JsonOptions);
        if (string.IsNullOrWhiteSpace(json))
            return [];

        try
        {
            using var document = JsonDocument.Parse(json);
            if (!TryGetInvoices(document.RootElement, out var invoices))
                return [];

            var payloadsByInvoiceId = new Dictionary<Guid, object>();
            foreach (var invoice in invoices.EnumerateArray())
            {
                if (!Guid.TryParse(TryGetString(invoice, "InvoiceID"), out var invoiceId))
                    continue;

                payloadsByInvoiceId[invoiceId] = new Dictionary<string, object>
                {
                    ["Invoices"] = new[] { invoice.Clone() },
                };
            }

            return payloadsByInvoiceId;
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static string? TryGetString(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var value) || value.ValueKind != JsonValueKind.String)
            return null;

        return value.GetString();
    }

    private static bool TryGetInvoices(JsonElement element, out JsonElement invoices)
    {
        if (element.TryGetProperty("Invoices", out invoices) && invoices.ValueKind == JsonValueKind.Array)
            return true;

        if (element.TryGetProperty("invoices", out invoices) && invoices.ValueKind == JsonValueKind.Array)
            return true;

        if (element.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in element.EnumerateObject())
            {
                if (string.Equals(property.Name, "Invoices", StringComparison.OrdinalIgnoreCase) &&
                    property.Value.ValueKind == JsonValueKind.Array)
                {
                    invoices = property.Value;
                    return true;
                }
            }
        }

        invoices = default;
        return false;
    }

    private sealed class ExtractedInvoiceSummary
    {
        public string? InvoiceId { get; init; }
        public string? InvoiceNumber { get; init; }
        public string? Status { get; init; }
        public string? Reference { get; init; }
        public string? ContactName { get; init; }
        public DateOnly? Date { get; init; }
    }

}

public sealed class JobInvoiceCreateResult
{
    public bool Ok { get; private init; }
    public int StatusCode { get; private init; }
    public string? Error { get; private init; }
    public bool AlreadyExists { get; private init; }
    public JobInvoice? Invoice { get; private init; }
    public object? Payload { get; private init; }
    public CreateXeroInvoiceRequest? RequestBody { get; private init; }
    public string Scope { get; private init; } = "";
    public int AccessTokenExpiresIn { get; private init; }
    public string LatestRefreshToken { get; private init; } = "";
    public bool RefreshTokenUpdated { get; private init; }

    public static JobInvoiceCreateResult Success(
        JobInvoice? invoice,
        bool alreadyExists,
        object? payload = null,
        CreateXeroInvoiceRequest? requestBody = null,
        string? refreshToken = null,
        bool refreshTokenUpdated = false,
        string? scope = null,
        int expiresIn = 0) =>
        new()
        {
            Ok = true,
            StatusCode = alreadyExists ? 200 : 201,
            AlreadyExists = alreadyExists,
            Invoice = invoice,
            Payload = payload,
            RequestBody = requestBody,
            LatestRefreshToken = refreshToken ?? "",
            RefreshTokenUpdated = refreshTokenUpdated,
            Scope = scope ?? "",
            AccessTokenExpiresIn = expiresIn,
        };

    public static JobInvoiceCreateResult Fail(
        int statusCode,
        string error,
        object? payload = null,
        CreateXeroInvoiceRequest? requestBody = null,
        string? refreshToken = null,
        bool refreshTokenUpdated = false,
        string? scope = null,
        int expiresIn = 0) =>
        new()
        {
            Ok = false,
            StatusCode = statusCode,
            Error = error,
            Payload = payload,
            RequestBody = requestBody,
            LatestRefreshToken = refreshToken ?? "",
            RefreshTokenUpdated = refreshTokenUpdated,
            Scope = scope ?? "",
            AccessTokenExpiresIn = expiresIn,
        };
}

public sealed record JobInvoiceXeroSyncTarget(long JobId, long JobInvoiceId, string ExternalInvoiceId);

public sealed record InvoiceEmailDeliveryPayload(
    string MessageId,
    string ThreadId,
    string RecipientEmail,
    string? GmailAccountEmail,
    string? BccEmail,
    string InvoiceNumber,
    string OnlineInvoiceUrl,
    string PdfFileName,
    bool XeroMarkedSent,
    string? XeroMarkError,
    bool PreviewOnly);

public sealed record InvoiceSentRepairPayload(
    bool GmailDeliveryFound,
    bool XeroMarkedSent,
    string? Error);

public sealed class JobInvoiceBulkSyncResult
{
    public bool Ok { get; private init; }
    public int StatusCode { get; private init; }
    public string? Error { get; private init; }
    public int RequestedJobs { get; private init; }
    public int SyncedInvoices { get; private init; }
    public IReadOnlyCollection<long> SyncedJobIds { get; private init; } = Array.Empty<long>();
    public object? Payload { get; private init; }

    public static JobInvoiceBulkSyncResult Success(
        int requestedJobs,
        int syncedInvoices,
        object? payload,
        IReadOnlyCollection<long>? syncedJobIds = null) =>
        new()
        {
            Ok = true,
            StatusCode = 200,
            RequestedJobs = requestedJobs,
            SyncedInvoices = syncedInvoices,
            SyncedJobIds = syncedJobIds ?? Array.Empty<long>(),
            Payload = payload,
        };

    public static JobInvoiceBulkSyncResult Fail(
        int statusCode,
        string error,
        int requestedJobs,
        int syncedInvoices,
        object? payload) =>
        new()
        {
            Ok = false,
            StatusCode = statusCode,
            Error = error,
            RequestedJobs = requestedJobs,
            SyncedInvoices = syncedInvoices,
            Payload = payload,
        };
}

public sealed class JobInvoiceStateUpdateResult
{
    public bool Ok { get; private init; }
    public int StatusCode { get; private init; }
    public string? Error { get; private init; }
    public JobInvoice? Invoice { get; private init; }
    public JobPayment? LatestPayment { get; private init; }
    public object? Payload { get; private init; }
    public bool ExactAmountVerified { get; private init; }

    public static JobInvoiceStateUpdateResult Success(
        JobInvoice invoice,
        JobPayment? latestPayment,
        bool exactAmountVerified = false) =>
        new()
        {
            Ok = true,
            StatusCode = 200,
            Invoice = invoice,
            LatestPayment = latestPayment,
            ExactAmountVerified = exactAmountVerified,
        };

    public static JobInvoiceStateUpdateResult Fail(
        int statusCode,
        string error,
        object? payload = null,
        bool exactAmountVerified = false) =>
        new()
        {
            Ok = false,
            StatusCode = statusCode,
            Error = error,
            Payload = payload,
            ExactAmountVerified = exactAmountVerified,
        };
}

public sealed class JobInvoiceDeleteResult
{
    public bool Ok { get; private init; }
    public int StatusCode { get; private init; }
    public string? Error { get; private init; }
    public object? Payload { get; private init; }
    public bool DeletedInXero { get; private init; }
    public string? Message { get; private init; }

    public static JobInvoiceDeleteResult Success(bool deletedInXero, string? message = null) =>
        new()
        {
            Ok = true,
            StatusCode = 200,
            DeletedInXero = deletedInXero,
            Message = message,
        };

    public static JobInvoiceDeleteResult Fail(int statusCode, string error, object? payload = null) =>
        new()
        {
            Ok = false,
            StatusCode = statusCode,
            Error = error,
            Payload = payload,
        };
}

public sealed class JobInvoiceContactUpdateResult
{
    public bool Ok { get; private init; }
    public bool WasSkipped { get; private init; }
    public int StatusCode { get; private init; }
    public string? Error { get; private init; }
    public string? Message { get; private init; }
    public object? Payload { get; private init; }
    public JobInvoice? Invoice { get; private init; }

    public static JobInvoiceContactUpdateResult Success(JobInvoice? invoice, string? message = null, object? payload = null) =>
        new()
        {
            Ok = true,
            StatusCode = 200,
            Invoice = invoice,
            Message = message,
            Payload = payload,
        };

    public static JobInvoiceContactUpdateResult Skipped(string? message) =>
        new()
        {
            Ok = true,
            WasSkipped = true,
            StatusCode = 200,
            Message = message,
        };

    public static JobInvoiceContactUpdateResult Fail(int statusCode, string error, object? payload = null, JobInvoice? invoice = null) =>
        new()
        {
            Ok = false,
            StatusCode = statusCode,
            Error = error,
            Payload = payload,
            Invoice = invoice,
        };
}

public sealed class JobInvoiceUnlinkResult
{
    public bool Ok { get; private init; }
    public int StatusCode { get; private init; }
    public string? Error { get; private init; }

    public static JobInvoiceUnlinkResult Success() =>
        new()
        {
            Ok = true,
            StatusCode = 200,
        };

    public static JobInvoiceUnlinkResult Fail(int statusCode, string error) =>
        new()
        {
            Ok = false,
            StatusCode = statusCode,
            Error = error,
        };
}

public sealed class JobInvoiceDocumentResult
{
    public byte[] Bytes { get; }
    public string ContentType { get; }
    public string FileName { get; }

    public JobInvoiceDocumentResult(byte[] bytes, string contentType, string fileName)
    {
        Bytes = bytes;
        ContentType = contentType;
        FileName = fileName;
    }
}
