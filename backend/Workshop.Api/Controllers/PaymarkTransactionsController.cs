using System.Globalization;
using System.Text.Json;
using CarjamImporter;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.DTOs;
using Workshop.Api.Models;
using Workshop.Api.Services;
using Workshop.Api.Utils;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/paymark-transactions")]
public sealed class PaymarkTransactionsController : ControllerBase
{
    private const string JobsListVersionCacheKey = "jobs:list:version:v1";
    private static readonly TimeSpan JobsListVersionCacheDuration = TimeSpan.FromDays(30);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly AppDbContext _db;
    private readonly IAppCache _appCache;
    private readonly PaymarkTransactionSyncService _syncService;
    private readonly NewJobCreationService _newJobCreationService;
    private readonly JobInvoiceService _jobInvoiceService;
    private readonly JobPoStateService _jobPoStateService;
    private readonly XeroInvoiceService _xeroInvoiceService;
    private readonly CarjamImportService _carjamImportService;

    public PaymarkTransactionsController(
        AppDbContext db,
        IAppCache appCache,
        PaymarkTransactionSyncService syncService,
        NewJobCreationService newJobCreationService,
        JobInvoiceService jobInvoiceService,
        JobPoStateService jobPoStateService,
        XeroInvoiceService xeroInvoiceService,
        CarjamImportService carjamImportService)
    {
        _db = db;
        _appCache = appCache;
        _syncService = syncService;
        _newJobCreationService = newJobCreationService;
        _jobInvoiceService = jobInvoiceService;
        _jobPoStateService = jobPoStateService;
        _xeroInvoiceService = xeroInvoiceService;
        _carjamImportService = carjamImportService;
    }

    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] string? fromUtc, [FromQuery] string? toUtc, CancellationToken ct)
    {
        var range = ParseRange(fromUtc, toUtc);
        if (range is null)
            return BadRequest(new { error = "fromUtc and toUtc must be valid UTC date/time values." });

        var rows = await _syncService.GetTransactionsAsync(range.Value.FromUtc, range.Value.ToUtc, ct);
        return Ok(new
        {
            transactions = await MapTransactionsAsync(rows, ct),
        });
    }

    [HttpPost("sync")]
    public async Task<IActionResult> Sync([FromBody] PaymarkSyncRequest? request, CancellationToken ct)
    {
        var range = ParseRange(request?.FromUtc, request?.ToUtc);
        if (range is null)
            return BadRequest(new { error = "fromUtc and toUtc must be valid UTC date/time values." });

        var result = await _syncService.SyncAsync(range.Value.FromUtc, range.Value.ToUtc, ct);
        if (!result.Success)
            return StatusCode(result.StatusCode, new { error = result.Error });

        var rows = await _syncService.GetTransactionsAsync(range.Value.FromUtc, range.Value.ToUtc, ct);
        return Ok(new
        {
            imported = result.ImportedCount,
            updated = result.UpdatedCount,
            totalResults = result.TotalResults,
            transactions = await MapTransactionsAsync(rows, ct),
        });
    }

    [HttpGet("quick-job-options")]
    public async Task<IActionResult> GetQuickJobOptions(CancellationToken ct)
    {
        var rows = await _db.PaymarkQuickJobOptions.AsNoTracking()
            .OrderBy(x => x.SortOrder)
            .ThenBy(x => x.Label)
            .ToListAsync(ct);

        return Ok(new { options = rows.Select(MapQuickJobOption) });
    }

    [HttpPost("quick-job-options")]
    public async Task<IActionResult> CreateQuickJobOption([FromBody] PaymarkQuickJobOptionUpsertRequest? request, CancellationToken ct)
    {
        var normalized = NormalizeQuickJobOptionRequest(request);
        if (!normalized.Ok)
            return BadRequest(new { error = normalized.Error });

        var exists = await _db.PaymarkQuickJobOptions.AnyAsync(x => x.Code == normalized.Code, ct);
        if (exists)
            return BadRequest(new { error = "Quick job option code already exists." });

        var now = DateTime.UtcNow;
        var row = new PaymarkQuickJobOption
        {
            Code = normalized.Code,
            Label = normalized.Label,
            ServiceType = normalized.ServiceType,
            Description = normalized.Description,
            XeroItemCode = normalized.XeroItemCode,
            AccountCode = normalized.AccountCode,
            TaxType = normalized.TaxType,
            DefaultAmountInclGst = normalized.DefaultAmountInclGst,
            IsActive = normalized.IsActive,
            SortOrder = normalized.SortOrder,
            CreatedAt = now,
            UpdatedAt = now,
        };

        _db.PaymarkQuickJobOptions.Add(row);
        await _db.SaveChangesAsync(ct);
        return Ok(new { option = MapQuickJobOption(row) });
    }

    [HttpPut("quick-job-options/{optionId:long}")]
    public async Task<IActionResult> UpdateQuickJobOption(long optionId, [FromBody] PaymarkQuickJobOptionUpsertRequest? request, CancellationToken ct)
    {
        var row = await _db.PaymarkQuickJobOptions.FirstOrDefaultAsync(x => x.Id == optionId, ct);
        if (row is null)
            return NotFound(new { error = "Quick job option not found." });

        var normalized = NormalizeQuickJobOptionRequest(request, row.Code);
        if (!normalized.Ok)
            return BadRequest(new { error = normalized.Error });

        if (!string.Equals(row.Code, normalized.Code, StringComparison.OrdinalIgnoreCase)
            && await _db.PaymarkQuickJobOptions.AnyAsync(x => x.Code == normalized.Code && x.Id != optionId, ct))
        {
            return BadRequest(new { error = "Quick job option code already exists." });
        }

        row.Code = normalized.Code;
        row.Label = normalized.Label;
        row.ServiceType = normalized.ServiceType;
        row.Description = normalized.Description;
        row.XeroItemCode = normalized.XeroItemCode;
        row.AccountCode = normalized.AccountCode;
        row.TaxType = normalized.TaxType;
        row.DefaultAmountInclGst = normalized.DefaultAmountInclGst;
        row.IsActive = normalized.IsActive;
        row.SortOrder = normalized.SortOrder;
        row.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return Ok(new { option = MapQuickJobOption(row) });
    }

    [HttpDelete("quick-job-options/{optionId:long}")]
    public async Task<IActionResult> DeleteQuickJobOption(long optionId, CancellationToken ct)
    {
        var row = await _db.PaymarkQuickJobOptions.FirstOrDefaultAsync(x => x.Id == optionId, ct);
        if (row is null)
            return NotFound(new { error = "Quick job option not found." });

        _db.PaymarkQuickJobOptions.Remove(row);
        await _db.SaveChangesAsync(ct);
        return Ok(new { success = true });
    }

    [HttpPut("{id:long}/note")]
    public async Task<IActionResult> UpdateNote(long id, [FromBody] PaymarkUpdateNoteRequest? request, CancellationToken ct)
    {
        var row = await _db.PaymarkTransactions.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (row is null)
            return NotFound(new { error = "Paymark transaction not found." });

        row.LocalNote = string.IsNullOrWhiteSpace(request?.Note) ? null : request.Note.Trim();
        row.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return Ok(new { transaction = await MapTransactionAsync(row, ct) });
    }

    [HttpPut("{id:long}/match")]
    public async Task<IActionResult> MatchJob(long id, [FromBody] PaymarkMatchJobRequest? request, CancellationToken ct)
    {
        if (request?.JobId is null or <= 0)
            return BadRequest(new { error = "Job id is required." });

        var row = await _db.PaymarkTransactions.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (row is null)
            return NotFound(new { error = "Paymark transaction not found." });

        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == request.JobId.Value, ct);
        if (job is null)
            return NotFound(new { error = "Job not found." });

        var settlement = await TryRecordPaymarkPaymentAndArchiveAsync(row, job, ct);
        if (!settlement.Ok)
            return StatusCode(settlement.StatusCode, new { error = settlement.Error });

        row.MatchedJobId = request.JobId.Value;
        if (!string.IsNullOrWhiteSpace(request.Note))
            row.LocalNote = request.Note.Trim();
        row.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            transaction = await MapTransactionAsync(row, ct),
            paymentRecorded = settlement.PaymentRecorded,
            archived = settlement.Archived,
            message = settlement.Message,
        });
    }

    [HttpPost("{id:long}/settle")]
    public async Task<IActionResult> RetrySettlement(long id, CancellationToken ct)
    {
        var row = await _db.PaymarkTransactions.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (row is null)
            return NotFound(new { error = "Paymark transaction not found." });
        if (!row.MatchedJobId.HasValue)
            return BadRequest(new { error = "Match this Paymark transaction to a job before updating settlement." });

        var jobId = row.MatchedJobId.Value;
        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == jobId, ct);
        if (job is null)
            return NotFound(new { error = "Matched job not found." });

        var invoice = await _db.JobInvoices.AsNoTracking().FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (invoice is null)
            return Conflict(new { error = "The matched job invoice is not ready yet." });
        if (!string.Equals(invoice.ExternalStatus, "AUTHORISED", StringComparison.OrdinalIgnoreCase))
            return Conflict(new { error = $"The matched job invoice is {invoice.ExternalStatus ?? "not ready"}; AUTHORISED is required." });

        var paymentAlreadyRecorded = await _db.JobPayments.AnyAsync(x => x.JobId == jobId, ct);
        if (paymentAlreadyRecorded && string.Equals(job.Status, "Archived", StringComparison.OrdinalIgnoreCase))
        {
            return Ok(new
            {
                transaction = await MapTransactionAsync(row, ct),
                paymentRecorded = true,
                archived = true,
                message = "Paymark payment was already recorded.",
            });
        }

        var settlement = await TryRecordPaymarkPaymentAndArchiveAsync(row, job, ct);
        if (!settlement.Ok)
            return StatusCode(settlement.StatusCode, new { error = settlement.Error });

        row.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            transaction = await MapTransactionAsync(row, ct),
            paymentRecorded = settlement.PaymentRecorded,
            archived = settlement.Archived,
            message = settlement.Message,
        });
    }

    [HttpPost("{id:long}/quick-job")]
    public async Task<IActionResult> CreateQuickJob(long id, [FromBody] PaymarkQuickJobRequest? request, CancellationToken ct)
    {
        if (request is null)
            return BadRequest(new { error = "Request body is required." });
        if (string.IsNullOrWhiteSpace(request.Plate))
            return BadRequest(new { error = "Rego/VIN/Chassis is required." });

        var row = await _db.PaymarkTransactions.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (row is null)
            return NotFound(new { error = "Paymark transaction not found." });
        if (row.MatchedJobId.HasValue)
            return BadRequest(new { error = "This Paymark transaction is already matched." });
        if (row.PurchaseAmount <= 0)
            return BadRequest(new { error = "Paymark purchase amount must be greater than zero." });

        var quickOption = await ResolveQuickJobOptionAsync(request.QuickService, ct);
        if (quickOption is null)
            return BadRequest(new { error = "Quick job option was not found or is inactive." });

        await TryImportVehicleForQuickJobAsync(request.Plate, ct);

        var jobRequest = BuildQuickJobRequest(row, request, quickOption);

        try
        {
            var result = await _newJobCreationService.CreateAsync(jobRequest, ct);
            var invoiceResult = await CreateAuthorisedQuickJobInvoiceAsync(result.JobId, row, quickOption, request, ct);
            if (!invoiceResult.Ok)
            {
                return StatusCode(invoiceResult.StatusCode, new
                {
                    error = invoiceResult.Error,
                    jobId = result.JobId.ToString(CultureInfo.InvariantCulture),
                    xero = invoiceResult.Payload,
                });
            }

            row.MatchedJobId = result.JobId;
            row.LocalNote = MergeNotes(row.LocalNote, request.Note);
            row.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);

            return Ok(new
            {
                jobId = result.JobId.ToString(CultureInfo.InvariantCulture),
                transaction = await MapTransactionAsync(row, ct),
                invoice = invoiceResult.Invoice is null ? null : new
                {
                    id = invoiceResult.Invoice.Id.ToString(CultureInfo.InvariantCulture),
                    invoiceResult.Invoice.ExternalInvoiceId,
                    invoiceResult.Invoice.ExternalInvoiceNumber,
                    invoiceResult.Invoice.ExternalStatus,
                },
            });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("quick-job")]
    public async Task<IActionResult> CreateStandaloneQuickJob([FromBody] PaymarkStandaloneQuickJobRequest? request, CancellationToken ct)
    {
        if (request is null)
            return BadRequest(new { error = "Request body is required." });
        if (string.IsNullOrWhiteSpace(request.Plate))
            return BadRequest(new { error = "Rego/VIN/Chassis is required." });

        var quickOption = await ResolveQuickJobOptionAsync(request.QuickService, ct);
        if (quickOption is null)
            return BadRequest(new { error = "Quick job option was not found or is inactive." });

        var amountInclGst = request.AmountInclGst ?? quickOption.DefaultAmountInclGst;
        if (amountInclGst <= 0)
            return BadRequest(new { error = "Amount incl. GST is required." });

        await TryImportVehicleForQuickJobAsync(request.Plate, ct);

        var quickRequest = new PaymarkQuickJobRequest
        {
            Plate = request.Plate,
            QuickService = request.QuickService,
            ServiceDescription = request.ServiceDescription,
            CustomerId = request.CustomerId,
            CustomerType = request.CustomerType,
            CustomerName = request.CustomerName,
            CustomerPhone = request.CustomerPhone,
            CustomerEmail = request.CustomerEmail,
            Note = request.Note,
        };
        var jobRequest = BuildQuickJobRequest(
            quickRequest,
            quickOption,
            [
                $"EFTPOS quick job pre-created {DateTimeHelper.FormatNz(DateTime.UtcNow)} ${amountInclGst:0.00} incl. GST",
            ]);

        try
        {
            var result = await _newJobCreationService.CreateAsync(jobRequest, ct);
            var invoiceResult = await CreateAuthorisedStandaloneQuickJobInvoiceAsync(
                result.JobId,
                amountInclGst,
                quickOption,
                quickRequest,
                ct);
            if (!invoiceResult.Ok)
            {
                return StatusCode(invoiceResult.StatusCode, new
                {
                    error = invoiceResult.Error,
                    jobId = result.JobId.ToString(CultureInfo.InvariantCulture),
                    xero = invoiceResult.Payload,
                });
            }

            return Ok(new
            {
                jobId = result.JobId.ToString(CultureInfo.InvariantCulture),
                invoice = invoiceResult.Invoice is null ? null : new
                {
                    id = invoiceResult.Invoice.Id.ToString(CultureInfo.InvariantCulture),
                    invoiceResult.Invoice.ExternalInvoiceId,
                    invoiceResult.Invoice.ExternalInvoiceNumber,
                    invoiceResult.Invoice.ExternalStatus,
                },
            });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    private async Task<IReadOnlyList<object>> MapTransactionsAsync(IReadOnlyCollection<PaymarkTransaction> rows, CancellationToken ct)
    {
        var matchedJobIds = rows
            .Where(row => row.MatchedJobId.HasValue)
            .Select(row => row.MatchedJobId!.Value)
            .Distinct()
            .ToArray();

        var paymentJobIds = matchedJobIds.Length == 0
            ? new HashSet<long>()
            : (await _db.JobPayments.AsNoTracking()
                .Where(payment => matchedJobIds.Contains(payment.JobId))
                .Select(payment => payment.JobId)
                .Distinct()
                .ToListAsync(ct)).ToHashSet();

        var invoices = matchedJobIds.Length == 0
            ? new Dictionary<long, PaymarkMatchedInvoiceSnapshot>()
            : await _db.JobInvoices.AsNoTracking()
                .Where(invoice => matchedJobIds.Contains(invoice.JobId))
                .Select(invoice => new PaymarkMatchedInvoiceSnapshot(
                    invoice.JobId,
                    invoice.ExternalStatus ?? "",
                    invoice.ExternalInvoiceNumber ?? ""))
                .ToDictionaryAsync(invoice => invoice.JobId, ct);

        return rows
            .Select(row =>
            {
                var hasMatchedJob = row.MatchedJobId.HasValue;
                var hasPayment = hasMatchedJob && paymentJobIds.Contains(row.MatchedJobId!.Value);
                var invoice = hasMatchedJob && invoices.TryGetValue(row.MatchedJobId!.Value, out var snapshot)
                    ? snapshot
                    : null;
                return MapTransaction(row, hasPayment, invoice?.ExternalStatus ?? "", invoice?.ExternalInvoiceNumber ?? "");
            })
            .ToList();
    }

    private async Task<object> MapTransactionAsync(PaymarkTransaction row, CancellationToken ct)
        => (await MapTransactionsAsync(new[] { row }, ct))[0];

    private static object MapQuickJobOption(PaymarkQuickJobOption row)
        => new
        {
            id = row.Id.ToString(CultureInfo.InvariantCulture),
            row.Code,
            row.Label,
            row.ServiceType,
            row.Description,
            row.XeroItemCode,
            row.AccountCode,
            row.TaxType,
            row.DefaultAmountInclGst,
            row.IsActive,
            row.SortOrder,
        };

    private static object MapTransaction(
        PaymarkTransaction row,
        bool paymentRecorded = false,
        string matchedInvoiceStatus = "",
        string matchedInvoiceNumber = "")
        => new
        {
            id = row.Id.ToString(CultureInfo.InvariantCulture),
            row.TransactionKey,
            row.CardAcceptorIdCode,
            row.TerminalId,
            row.RetrievalRef,
            transactionNumber = row.TransactionNumber.ToString(CultureInfo.InvariantCulture),
            transactionTimeUtc = row.TransactionTimeUtc.ToString("O", CultureInfo.InvariantCulture),
            transactionTime = DateTimeHelper.FormatNz(row.TransactionTimeUtc),
            settlementDate = row.SettlementDate?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? "",
            row.CardLogo,
            row.Suffix,
            row.TranType,
            row.TransactionAmount,
            row.PurchaseAmount,
            row.CashoutAmount,
            row.Status,
            row.ActionCode,
            row.Bin,
            matchedJobId = row.MatchedJobId?.ToString(CultureInfo.InvariantCulture) ?? "",
            paymentRecorded,
            matchedInvoiceStatus,
            matchedInvoiceNumber,
            row.LocalNote,
            importedAt = DateTimeHelper.FormatNz(row.ImportedAt),
            updatedAt = DateTimeHelper.FormatNz(row.UpdatedAt),
        };

    private async Task<PaymarkSettlementResult> TryRecordPaymarkPaymentAndArchiveAsync(
        PaymarkTransaction row,
        Job job,
        CancellationToken ct)
    {
        var jobInvoice = await _db.JobInvoices.FirstOrDefaultAsync(x => x.JobId == job.Id, ct);
        if (jobInvoice is null)
            return PaymarkSettlementResult.Success(false, false, "Matched. No Xero invoice was found yet.");

        var paymentDate = row.SettlementDate ?? DateOnly.FromDateTime(DateTimeHelper.ConvertUtcToNz(row.TransactionTimeUtc));
        var paymentReference =
            $"Paymark TXN {row.TransactionNumber.ToString(CultureInfo.InvariantCulture)} ****{row.Suffix}".Trim();
        var paymentResult = await _jobInvoiceService.UpdateXeroStateAsync(
            job.Id,
            new UpdateJobInvoiceXeroStateRequest
            {
                State = "PAID_EPOST",
                Amount = row.PurchaseAmount,
                PaymentDate = paymentDate,
                Reference = paymentReference,
                EpostReferenceId = row.RetrievalRef,
            },
            ct);

        var canRecordLocalPayment = PayloadIndicatesAuthorisedInvoice(paymentResult.Payload)
            || ErrorIndicatesAuthorisedInvoice(paymentResult.Error);
        if (!paymentResult.Ok)
        {
            if (canRecordLocalPayment)
            {
                await RecordLocalEftposPaymentAsync(jobInvoice, row, paymentDate, paymentReference, ct);
                jobInvoice.ExternalStatus = "AUTHORISED";
                jobInvoice.UpdatedAt = DateTime.UtcNow;
            }
            else
            {
                return PaymarkSettlementResult.Fail(
                    paymentResult.StatusCode,
                    paymentResult.Error ?? "Failed to record Paymark payment against the matched invoice.");
            }
        }

        job.InvoiceReference = jobInvoice.Reference;
        job.UpdatedAt = DateTime.UtcNow;

        var archivedNow = false;
        if (!string.Equals(job.Status, "Archived", StringComparison.OrdinalIgnoreCase))
        {
            job.Status = "Archived";
            job.UpdatedAt = DateTime.UtcNow;
            archivedNow = true;

            var correlationId = JobPoStateService.BuildCorrelationId(job.Id);
            var existingInactive = await _db.InactiveGmailCorrelations
                .FirstOrDefaultAsync(x => x.CorrelationId == correlationId, ct);
            if (existingInactive is null)
            {
                _db.InactiveGmailCorrelations.Add(new InactiveGmailCorrelation
                {
                    CorrelationId = correlationId,
                    Reason = $"Job {job.Id} archived by Paymark transaction {row.TransactionNumber}",
                    CreatedAt = DateTime.UtcNow,
                });
            }
        }

        await _db.SaveChangesAsync(ct);

        if (archivedNow)
        {
            await _jobPoStateService.SyncStateForJobAsync(job.Id, ct);
            await TouchJobsListVersionAsync(ct);
        }

        return PaymarkSettlementResult.Success(true, true, "Paymark payment recorded and job archived.");
    }

    private async Task RecordLocalEftposPaymentAsync(
        JobInvoice jobInvoice,
        PaymarkTransaction row,
        DateOnly paymentDate,
        string paymentReference,
        CancellationToken ct)
    {
        var existingPayment = await _db.JobPayments
            .Where(x => x.JobInvoiceId == jobInvoice.Id)
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefaultAsync(ct);

        var now = DateTime.UtcNow;
        if (existingPayment is null)
        {
            _db.JobPayments.Add(new JobPayment
            {
                JobId = jobInvoice.JobId,
                JobInvoiceId = jobInvoice.Id,
                Provider = "system",
                ExternalPaymentId = null,
                ExternalInvoiceId = jobInvoice.ExternalInvoiceId,
                Method = "epost",
                Amount = row.PurchaseAmount,
                PaymentDate = paymentDate,
                Reference = paymentReference,
                AccountCode = null,
                ExternalStatus = "AUTHORISED",
                RequestPayloadJson = null,
                ResponsePayloadJson = null,
                CreatedAt = now,
                UpdatedAt = now,
            });
            return;
        }

        existingPayment.Method = "epost";
        existingPayment.Amount = row.PurchaseAmount;
        existingPayment.PaymentDate = paymentDate;
        existingPayment.Reference = paymentReference;
        existingPayment.ExternalInvoiceId = jobInvoice.ExternalInvoiceId;
        existingPayment.ExternalStatus = "AUTHORISED";
        existingPayment.UpdatedAt = now;
    }

    private static bool PayloadIndicatesAuthorisedInvoice(object? payload)
    {
        if (payload is null)
            return false;

        try
        {
            var serialized = JsonSerializer.Serialize(payload);
            return ErrorIndicatesAuthorisedInvoice(serialized);
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static bool ErrorIndicatesAuthorisedInvoice(string? value)
        => !string.IsNullOrWhiteSpace(value)
            && value.Contains("AUTHORISED", StringComparison.OrdinalIgnoreCase)
            && value.Contains("Invoice", StringComparison.OrdinalIgnoreCase);

    private async Task<PaymarkQuickJobOption?> ResolveQuickJobOptionAsync(string? value, CancellationToken ct)
    {
        var normalized = SlugifyQuickJobCode(value);
        if (string.IsNullOrWhiteSpace(normalized))
            normalized = "puncture";

        var option = await _db.PaymarkQuickJobOptions.AsNoTracking()
            .FirstOrDefaultAsync(x => x.IsActive && x.Code == normalized, ct);
        if (option is not null)
            return option;

        return await _db.PaymarkQuickJobOptions.AsNoTracking()
            .Where(x => x.IsActive)
            .OrderBy(x => x.SortOrder)
            .ThenBy(x => x.Label)
            .FirstOrDefaultAsync(ct);
    }

    private async Task TryImportVehicleForQuickJobAsync(string plate, CancellationToken ct)
    {
        var normalized = NormalizeRegoLikeValue(plate);
        if (normalized.Length is < 2 or > 10)
            return;

        try
        {
            await _carjamImportService.ImportByPlateAsync(normalized, ct);
        }
        catch
        {
            // Quick Job still works when CarJam is slow, blocked, or the input is not a plate.
        }
    }

    private static NewJobRequest BuildQuickJobRequest(
        PaymarkTransaction row,
        PaymarkQuickJobRequest request,
        PaymarkQuickJobOption option)
        => BuildQuickJobRequest(
            request,
            option,
            [
                $"Paymark TXN #{row.TransactionNumber} {DateTimeHelper.FormatNz(row.TransactionTimeUtc)} ${row.PurchaseAmount:0.00} {row.CardLogo} ****{row.Suffix}".Trim(),
            ]);

    private static NewJobRequest BuildQuickJobRequest(
        PaymarkQuickJobRequest request,
        PaymarkQuickJobOption option,
        IEnumerable<string> leadingNoteParts)
    {
        var serviceType = NormalizeQuickJobServiceType(option.ServiceType);
        var description = BuildQuickJobDescription(option, request);
        var services = serviceType switch
        {
            "wof" => new[] { "wof" },
            "paint" => new[] { "paint" },
            _ => new[] { "mech" },
        };
        var mechItems = serviceType == "mech" ? new[] { description } : Array.Empty<string>();

        var noteParts = leadingNoteParts
            .Select(part => part.Trim())
            .Where(part => !string.IsNullOrWhiteSpace(part))
            .ToList();
        if (!string.IsNullOrWhiteSpace(request.Note))
            noteParts.Add(request.Note.Trim());

        var isBusiness = request.CustomerId is > 0
            && string.Equals(request.CustomerType, "Business", StringComparison.OrdinalIgnoreCase);

        return new NewJobRequest
        {
            Plate = request.Plate.Trim(),
            Services = services,
            MechItems = mechItems,
            PaintPanels = serviceType == "paint" ? 1 : null,
            CreateNewInvoice = false,
            SkipInvoice = true,
            UseServiceCatalogMapping = false,
            NeedsPo = false,
            Notes = string.Join(Environment.NewLine, noteParts),
            BusinessId = isBusiness ? request.CustomerId!.Value.ToString(CultureInfo.InvariantCulture) : null,
            Customer = new NewJobRequest.CustomerInput
            {
                Type = isBusiness ? "Business" : "Personal",
                ExistingCustomerId = !isBusiness && request.CustomerId is > 0 ? request.CustomerId : null,
                Name = string.IsNullOrWhiteSpace(request.CustomerName) ? "WI" : request.CustomerName.Trim(),
                Phone = string.IsNullOrWhiteSpace(request.CustomerPhone) ? null : request.CustomerPhone.Trim(),
                Email = string.IsNullOrWhiteSpace(request.CustomerEmail) ? null : request.CustomerEmail.Trim(),
            },
        };
    }

    private static string BuildQuickJobDescription(PaymarkQuickJobOption option, PaymarkQuickJobRequest request)
        => option.Code == "other" && !string.IsNullOrWhiteSpace(request.ServiceDescription)
            ? request.ServiceDescription.Trim()
            : FirstNonEmpty(option.Description, option.Label, request.ServiceDescription, "Quick Job")!;

    private async Task<PaymarkQuickInvoiceResult> CreateAuthorisedQuickJobInvoiceAsync(
        long jobId,
        PaymarkTransaction row,
        PaymarkQuickJobOption option,
        PaymarkQuickJobRequest request,
        CancellationToken ct)
    {
        var jobData = await (
                from job in _db.Jobs
                join vehicle in _db.Vehicles on job.VehicleId equals vehicle.Id
                join customer in _db.Customers on job.CustomerId equals customer.Id
                where job.Id == jobId
                select new
                {
                    Job = job,
                    Vehicle = vehicle,
                    Customer = customer,
                }
            )
            .FirstOrDefaultAsync(ct);
        if (jobData is null)
            return PaymarkQuickInvoiceResult.Fail(404, "Quick job was created, but the job data could not be loaded.");

        var paymentDate = row.SettlementDate ?? DateOnly.FromDateTime(DateTimeHelper.ConvertUtcToNz(row.TransactionTimeUtc));
        var invoiceRequest = BuildQuickJobInvoiceRequest(jobData.Job, jobData.Vehicle, jobData.Customer, row.PurchaseAmount, option, request, paymentDate);
        var createResult = await _xeroInvoiceService.CreateInvoiceAsync(
            invoiceRequest,
            new XeroInvoiceCreateOptions
            {
                SummarizeErrors = true,
                UnitDp = 4,
                IdempotencyKey = $"paymark-quick-job-{row.Id.ToString(CultureInfo.InvariantCulture)}",
            },
            ct);

        if (!createResult.Ok)
        {
            return PaymarkQuickInvoiceResult.Fail(
                createResult.StatusCode,
                createResult.Error ?? "Failed to create Xero invoice for quick job.",
                createResult.Payload);
        }

        var jobInvoice = BuildQuickJobInvoice(jobId, invoiceRequest, createResult.Payload, createResult.TenantId);
        _db.JobInvoices.Add(jobInvoice);
        await _db.SaveChangesAsync(ct);

        var paymentReference =
            $"Paymark TXN {row.TransactionNumber.ToString(CultureInfo.InvariantCulture)} ****{row.Suffix}".Trim();
        await RecordLocalEftposPaymentAsync(jobInvoice, row, paymentDate, paymentReference, ct);

        jobData.Job.InvoiceReference = jobInvoice.Reference;
        jobData.Job.UpdatedAt = DateTime.UtcNow;

        var archivedNow = false;
        if (!string.Equals(jobData.Job.Status, "Archived", StringComparison.OrdinalIgnoreCase))
        {
            jobData.Job.Status = "Archived";
            jobData.Job.UpdatedAt = DateTime.UtcNow;
            archivedNow = true;

            var correlationId = JobPoStateService.BuildCorrelationId(jobData.Job.Id);
            var existingInactive = await _db.InactiveGmailCorrelations
                .FirstOrDefaultAsync(x => x.CorrelationId == correlationId, ct);
            if (existingInactive is null)
            {
                _db.InactiveGmailCorrelations.Add(new InactiveGmailCorrelation
                {
                    CorrelationId = correlationId,
                    Reason = $"Job {jobData.Job.Id} archived by Paymark quick job transaction {row.TransactionNumber}",
                    CreatedAt = DateTime.UtcNow,
                });
            }
        }

        await _db.SaveChangesAsync(ct);
        if (archivedNow)
        {
            await _jobPoStateService.SyncStateForJobAsync(jobData.Job.Id, ct);
            await TouchJobsListVersionAsync(ct);
        }

        return PaymarkQuickInvoiceResult.Success(jobInvoice, createResult.Payload);
    }

    private async Task<PaymarkQuickInvoiceResult> CreateAuthorisedStandaloneQuickJobInvoiceAsync(
        long jobId,
        decimal amountInclGst,
        PaymarkQuickJobOption option,
        PaymarkQuickJobRequest request,
        CancellationToken ct)
    {
        var jobData = await (
                from job in _db.Jobs
                join vehicle in _db.Vehicles on job.VehicleId equals vehicle.Id
                join customer in _db.Customers on job.CustomerId equals customer.Id
                where job.Id == jobId
                select new
                {
                    Job = job,
                    Vehicle = vehicle,
                    Customer = customer,
                }
            )
            .FirstOrDefaultAsync(ct);
        if (jobData is null)
            return PaymarkQuickInvoiceResult.Fail(404, "Quick job was created, but the job data could not be loaded.");

        var invoiceDate = DateOnly.FromDateTime(DateTimeHelper.ConvertUtcToNz(DateTime.UtcNow));
        var invoiceRequest = BuildQuickJobInvoiceRequest(
            jobData.Job,
            jobData.Vehicle,
            jobData.Customer,
            amountInclGst,
            option,
            request,
            invoiceDate);
        var createResult = await _xeroInvoiceService.CreateInvoiceAsync(
            invoiceRequest,
            new XeroInvoiceCreateOptions
            {
                SummarizeErrors = true,
                UnitDp = 4,
                IdempotencyKey = $"paymark-standalone-quick-job-{jobId.ToString(CultureInfo.InvariantCulture)}",
            },
            ct);

        if (!createResult.Ok)
        {
            return PaymarkQuickInvoiceResult.Fail(
                createResult.StatusCode,
                createResult.Error ?? "Failed to create Xero invoice for quick job.",
                createResult.Payload);
        }

        var jobInvoice = BuildQuickJobInvoice(jobId, invoiceRequest, createResult.Payload, createResult.TenantId);
        _db.JobInvoices.Add(jobInvoice);
        jobData.Job.InvoiceReference = jobInvoice.Reference;
        jobData.Job.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return PaymarkQuickInvoiceResult.Success(jobInvoice, createResult.Payload);
    }

    private static CreateXeroInvoiceRequest BuildQuickJobInvoiceRequest(
        Job job,
        Vehicle vehicle,
        Customer customer,
        decimal amountInclGst,
        PaymarkQuickJobOption option,
        PaymarkQuickJobRequest request,
        DateOnly paymentDate)
    {
        var description = BuildQuickJobDescription(option, request);
        return new CreateXeroInvoiceRequest
        {
            Type = "ACCREC",
            Status = "AUTHORISED",
            LineAmountTypes = "Inclusive",
            Date = paymentDate,
            DueDate = paymentDate,
            Contact = new XeroInvoiceContactInput
            {
                Name = BuildQuickContactName(customer, vehicle),
                EmailAddress = TrimOrNull(request.CustomerEmail),
                ContactNumber = TrimOrNull(request.CustomerPhone),
            },
            Reference = BuildQuickReference(job, customer, vehicle),
            CurrencyCode = "NZD",
            LineItems =
            [
                new XeroInvoiceLineItemInput
                {
                    Description = description,
                    Quantity = 1m,
                    UnitAmount = amountInclGst,
                    ItemCode = TrimOrNull(option.XeroItemCode),
                    AccountCode = TrimOrNull(option.AccountCode),
                    TaxType = FirstNonEmpty(option.TaxType, "OUTPUT2"),
                },
            ],
        };
    }

    private static JobInvoice BuildQuickJobInvoice(
        long jobId,
        CreateXeroInvoiceRequest request,
        object? payload,
        string? tenantId)
    {
        var extracted = ExtractInvoiceSummary(payload);
        var now = DateTime.UtcNow;
        return new JobInvoice
        {
            JobId = jobId,
            Provider = "xero",
            ExternalInvoiceId = extracted.InvoiceId ?? request.InvoiceId?.ToString(),
            ExternalInvoiceNumber = extracted.InvoiceNumber,
            ExternalStatus = extracted.Status ?? request.Status,
            Reference = extracted.Reference ?? request.Reference,
            ContactName = extracted.ContactName ?? request.Contact.Name,
            InvoiceDate = extracted.Date ?? request.Date,
            LineAmountTypes = request.LineAmountTypes,
            TenantId = tenantId,
            RequestPayloadJson = JsonSerializer.Serialize(request, JsonOptions),
            ResponsePayloadJson = payload is null ? null : JsonSerializer.Serialize(payload, JsonOptions),
            CreatedAt = now,
            UpdatedAt = now,
        };
    }

    private static string BuildQuickReference(Job job, Customer customer, Vehicle vehicle)
    {
        if (string.Equals(customer.Type, "Personal", StringComparison.OrdinalIgnoreCase))
            return string.Empty;

        var rego = string.IsNullOrWhiteSpace(vehicle.Plate) ? "[REGO]" : vehicle.Plate.Trim().ToUpperInvariant();
        var poPrefix = string.IsNullOrWhiteSpace(job.PoNumber)
            ? $"PO# Pending {rego}"
            : $"{job.PoNumber.Trim()} {rego}";
        var year = vehicle.Year.HasValue && vehicle.Year.Value > 0 ? vehicle.Year.Value.ToString() : "[YEAR]";
        var make = string.IsNullOrWhiteSpace(vehicle.Make) ? "[MAKE]" : vehicle.Make.Trim();
        var model = string.IsNullOrWhiteSpace(vehicle.Model) ? "[MODEL]" : vehicle.Model.Trim();

        return $"{poPrefix} {year} {make} {model}";
    }

    private static string BuildQuickContactName(Customer customer, Vehicle vehicle)
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

    private static QuickInvoiceSummary ExtractInvoiceSummary(object? payload)
    {
        if (payload is null)
            return new QuickInvoiceSummary();

        var json = JsonSerializer.Serialize(payload, JsonOptions);
        if (string.IsNullOrWhiteSpace(json))
            return new QuickInvoiceSummary();

        try
        {
            using var document = JsonDocument.Parse(json);
            if (!document.RootElement.TryGetProperty("Invoices", out var invoices) || invoices.ValueKind != JsonValueKind.Array)
                return new QuickInvoiceSummary();

            var invoice = invoices.EnumerateArray().FirstOrDefault();
            if (invoice.ValueKind == JsonValueKind.Undefined)
                return new QuickInvoiceSummary();

            var contactName = invoice.TryGetProperty("Contact", out var contact) &&
                              contact.ValueKind == JsonValueKind.Object &&
                              contact.TryGetProperty("Name", out var nameElement)
                ? nameElement.GetString()
                : null;

            DateOnly? date = null;
            if (invoice.TryGetProperty("DateString", out var dateStringElement) &&
                dateStringElement.ValueKind == JsonValueKind.String &&
                DateOnly.TryParse(dateStringElement.GetString(), out var parsedDateString))
            {
                date = parsedDateString;
            }
            else if (invoice.TryGetProperty("Date", out var dateElement) &&
                     dateElement.ValueKind == JsonValueKind.String &&
                     DateTime.TryParse(dateElement.GetString(), out var parsedDateTime))
            {
                date = DateOnly.FromDateTime(parsedDateTime);
            }

            return new QuickInvoiceSummary
            {
                InvoiceId = TryGetString(invoice, "InvoiceID"),
                InvoiceNumber = TryGetString(invoice, "InvoiceNumber"),
                Status = TryGetString(invoice, "Status"),
                Reference = TryGetString(invoice, "Reference"),
                ContactName = contactName,
                Date = date,
            };
        }
        catch (JsonException)
        {
            return new QuickInvoiceSummary();
        }
    }

    private static QuickJobOptionNormalization NormalizeQuickJobOptionRequest(
        PaymarkQuickJobOptionUpsertRequest? request,
        string? fallbackCode = null)
    {
        if (request is null)
            return QuickJobOptionNormalization.Fail("Request body is required.");

        var label = request.Label?.Trim();
        if (string.IsNullOrWhiteSpace(label))
            return QuickJobOptionNormalization.Fail("Label is required.");

        var code = SlugifyQuickJobCode(FirstNonEmpty(request.Code, fallbackCode, label));
        if (string.IsNullOrWhiteSpace(code))
            return QuickJobOptionNormalization.Fail("Code is required.");

        var serviceType = NormalizeQuickJobServiceType(request.ServiceType);
        var amount = request.DefaultAmountInclGst ?? 0m;
        if (amount < 0)
            return QuickJobOptionNormalization.Fail("Default amount must be zero or greater.");

        return QuickJobOptionNormalization.Success(
            code,
            label,
            serviceType,
            FirstNonEmpty(request.Description, label)!,
            TrimOrNull(request.XeroItemCode),
            TrimOrNull(request.AccountCode),
            FirstNonEmpty(request.TaxType, "OUTPUT2"),
            Math.Round(amount, 2, MidpointRounding.AwayFromZero),
            request.IsActive ?? true,
            request.SortOrder ?? 100);
    }

    private static string NormalizeQuickJobServiceType(string? value)
    {
        var normalized = value?.Trim().ToLowerInvariant();
        return normalized is "wof" or "paint" ? normalized : "mech";
    }

    private static string SlugifyQuickJobCode(string? value)
    {
        var raw = value?.Trim().ToLowerInvariant() ?? "";
        if (string.IsNullOrWhiteSpace(raw))
            return "";

        var chars = raw
            .Select(ch => char.IsLetterOrDigit(ch) ? ch : '-')
            .ToArray();
        var slug = new string(chars);
        while (slug.Contains("--", StringComparison.Ordinal))
            slug = slug.Replace("--", "-", StringComparison.Ordinal);
        return slug.Trim('-');
    }

    private static string NormalizeRegoLikeValue(string value)
        => new(value.Trim().ToUpperInvariant().Where(char.IsLetterOrDigit).ToArray());

    private static string? TrimOrNull(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }

    private static string? FirstNonEmpty(params string?[] values)
        => values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))?.Trim();

    private static string? TryGetString(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var value) || value.ValueKind != JsonValueKind.String)
            return null;

        return value.GetString();
    }

    private static string? MergeNotes(string? existing, string? next)
    {
        if (string.IsNullOrWhiteSpace(next))
            return existing;
        if (string.IsNullOrWhiteSpace(existing))
            return next.Trim();
        return $"{existing.Trim()}{Environment.NewLine}{next.Trim()}";
    }

    private static (DateTime FromUtc, DateTime ToUtc)? ParseRange(string? fromUtc, string? toUtc)
    {
        if (!TryParseUtc(fromUtc, out var from) || !TryParseUtc(toUtc, out var to) || from > to)
            return null;

        return (from, to);
    }

    private static bool TryParseUtc(string? value, out DateTime parsed)
    {
        parsed = default;
        if (string.IsNullOrWhiteSpace(value))
            return false;

        if (!DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var offset))
            return false;

        parsed = offset.UtcDateTime;
        return true;
    }

    private Task TouchJobsListVersionAsync(CancellationToken ct)
        => _appCache.SetStringAsync(
            JobsListVersionCacheKey,
            DateTime.UtcNow.Ticks.ToString(CultureInfo.InvariantCulture),
            JobsListVersionCacheDuration,
            ct);
}

internal sealed record PaymarkSettlementResult(
    bool Ok,
    int StatusCode,
    string? Error,
    bool PaymentRecorded,
    bool Archived,
    string Message)
{
    public static PaymarkSettlementResult Success(bool paymentRecorded, bool archived, string message)
        => new(true, 200, null, paymentRecorded, archived, message);

    public static PaymarkSettlementResult Fail(int statusCode, string error)
        => new(false, statusCode, error, false, false, "");
}

internal sealed record PaymarkMatchedInvoiceSnapshot(
    long JobId,
    string ExternalStatus,
    string ExternalInvoiceNumber);

internal sealed record PaymarkQuickInvoiceResult(
    bool Ok,
    int StatusCode,
    string? Error,
    JobInvoice? Invoice,
    object? Payload)
{
    public static PaymarkQuickInvoiceResult Success(JobInvoice invoice, object? payload)
        => new(true, 200, null, invoice, payload);

    public static PaymarkQuickInvoiceResult Fail(int statusCode, string error, object? payload = null)
        => new(false, statusCode, error, null, payload);
}

internal sealed class QuickInvoiceSummary
{
    public string? InvoiceId { get; init; }
    public string? InvoiceNumber { get; init; }
    public string? Status { get; init; }
    public string? Reference { get; init; }
    public string? ContactName { get; init; }
    public DateOnly? Date { get; init; }
}

internal sealed record QuickJobOptionNormalization(
    bool Ok,
    string? Error,
    string Code,
    string Label,
    string ServiceType,
    string Description,
    string? XeroItemCode,
    string? AccountCode,
    string? TaxType,
    decimal DefaultAmountInclGst,
    bool IsActive,
    int SortOrder)
{
    public static QuickJobOptionNormalization Success(
        string code,
        string label,
        string serviceType,
        string description,
        string? xeroItemCode,
        string? accountCode,
        string? taxType,
        decimal defaultAmountInclGst,
        bool isActive,
        int sortOrder)
        => new(
            true,
            null,
            code,
            label,
            serviceType,
            description,
            xeroItemCode,
            accountCode,
            taxType,
            defaultAmountInclGst,
            isActive,
            sortOrder);

    public static QuickJobOptionNormalization Fail(string error)
        => new(false, error, "", "", "mech", "", null, null, null, 0m, true, 100);
}

public sealed class PaymarkSyncRequest
{
    public string FromUtc { get; init; } = "";
    public string ToUtc { get; init; } = "";
}

public sealed class PaymarkUpdateNoteRequest
{
    public string? Note { get; init; }
}

public sealed class PaymarkMatchJobRequest
{
    public long? JobId { get; init; }
    public string? Note { get; init; }
}

public sealed class PaymarkQuickJobRequest
{
    public string Plate { get; init; } = "";
    public string QuickService { get; init; } = "puncture";
    public string? ServiceDescription { get; init; }
    public long? CustomerId { get; init; }
    public string? CustomerType { get; init; }
    public string? CustomerName { get; init; }
    public string? CustomerPhone { get; init; }
    public string? CustomerEmail { get; init; }
    public string? Note { get; init; }
}

public sealed class PaymarkStandaloneQuickJobRequest
{
    public string Plate { get; init; } = "";
    public string QuickService { get; init; } = "puncture";
    public decimal? AmountInclGst { get; init; }
    public string? ServiceDescription { get; init; }
    public long? CustomerId { get; init; }
    public string? CustomerType { get; init; }
    public string? CustomerName { get; init; }
    public string? CustomerPhone { get; init; }
    public string? CustomerEmail { get; init; }
    public string? Note { get; init; }
}

public sealed class PaymarkQuickJobOptionUpsertRequest
{
    public string? Code { get; init; }
    public string? Label { get; init; }
    public string ServiceType { get; init; } = "mech";
    public string? Description { get; init; }
    public string? XeroItemCode { get; init; }
    public string? AccountCode { get; init; }
    public string? TaxType { get; init; }
    public decimal? DefaultAmountInclGst { get; init; }
    public bool? IsActive { get; init; }
    public int? SortOrder { get; init; }
}
