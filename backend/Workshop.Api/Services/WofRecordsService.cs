using System.Data;
using System.Globalization;
using Google.Apis.Auth.OAuth2;
using Google.Apis.Services;
using Google.Apis.Sheets.v4;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Models;
using Workshop.Api.Utils;

namespace Workshop.Api.Services;

public class WofRecordsService
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _config;
    private readonly InvoiceOutboxService _invoiceOutboxService;

    public WofRecordsService(AppDbContext db, IConfiguration config, InvoiceOutboxService invoiceOutboxService)
    {
        _db = db;
        _config = config;
        _invoiceOutboxService = invoiceOutboxService;
    }

    public async Task<WofServiceResult> GetWofRecords(long id, CancellationToken ct)
    {
        var jobExists = await _db.Jobs.AsNoTracking().AnyAsync(x => x.Id == id, ct);
        if (!jobExists)
            return WofServiceResult.NotFound("Job not found.");

        var rows = await _db.JobWofRecords.AsNoTracking()
            .Where(x => x.JobId == id)
            .OrderByDescending(x => x.OccurredAt)
            .ThenByDescending(x => x.Id)
            .Select(x => new
            {
                x.Id,
                x.OccurredAt,
                x.Rego,
                x.MakeModel,
                x.Odo,
                x.RecordState,
                x.IsNewWof,
                x.NewWofDate,
                x.AuthCode,
                x.CheckSheet,
                x.CsNo,
                x.WofLabel,
                x.LabelNo,
                x.FailReasons,
                x.PreviousExpiryDate,
                x.OrganisationName,
                x.ExcelRowNo,
                x.SourceFile,
                x.Note,
                x.WofUiState,
                x.ImportedAt,
                x.UpdatedAt
            })
            .ToListAsync(ct);

        var checkItems = rows.Select(x => new
            {
                id = x.Id.ToString(CultureInfo.InvariantCulture),
                wofId = id.ToString(CultureInfo.InvariantCulture),
                occurredAt = FormatDateTime(x.OccurredAt),
                rego = x.Rego,
                makeModel = x.MakeModel,
                recordState = ToRecordStateLabel(x.RecordState),
                isNewWof = x.IsNewWof,
                newWofDate = FormatDate(x.NewWofDate),
                odo = x.Odo,
                authCode = x.AuthCode,
                checkSheet = x.CheckSheet,
                csNo = x.CsNo,
                wofLabel = x.WofLabel,
                labelNo = x.LabelNo,
                failReasons = x.FailReasons,
                previousExpiryDate = FormatDate(x.PreviousExpiryDate),
                organisationName = x.OrganisationName,
                note = x.Note ?? "",
                wofUiState = ToUiStateLabel(x.WofUiState),
                importedAt = FormatDateTime(x.ImportedAt),
                source = x.SourceFile ?? "excel",
                sourceRow = x.ExcelRowNo.ToString(CultureInfo.InvariantCulture),
                updatedAt = FormatDateTime(x.UpdatedAt)
            })
            .ToList();

        var results = rows.Select(x => new
            {
                id = x.Id.ToString(CultureInfo.InvariantCulture),
                wofId = id.ToString(CultureInfo.InvariantCulture),
                date = x.OccurredAt.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                result = ToRecordStateLabel(x.RecordState),
                recheckExpiryDate = FormatDate(x.PreviousExpiryDate),
                failReason = x.FailReasons,
                note = x.Note ?? "",
                source = x.SourceFile ?? "excel"
            })
            .ToList();

        return WofServiceResult.Ok(new
        {
            hasWofServer = rows.Count > 0,
            wofId = (string?)null,
            checkItems,
            results
        });
    }

    public async Task<WofServiceResult> ImportWofRecords(long id, CancellationToken ct)
    {
        var spreadsheetId = _config["WofImport:SpreadsheetId"];
        var credentialsPath = _config["WofImport:GoogleCredentialsPath"];
        if (string.IsNullOrWhiteSpace(spreadsheetId))
            return WofServiceResult.BadRequest("Missing WofImport:SpreadsheetId configuration.");
        if (string.IsNullOrWhiteSpace(credentialsPath))
            return WofServiceResult.BadRequest("Missing WofImport:GoogleCredentialsPath configuration.");

        return await ImportWofRecordsFromGoogleSheet(id, ct);
    }

    public async Task<WofServiceResult> SyncAllRecordsFromGoogleSheet(CancellationToken ct)
    {
        var loadResult = await LoadGoogleSheetTableAsync(ct);
        if (!loadResult.Ok || loadResult.Table is null)
            return loadResult.Result ?? WofServiceResult.BadRequest("Failed to load Google Sheet.");

        var table = loadResult.Table;
        var sheetName = loadResult.SheetName;
        var sourceFile = loadResult.SourceFile!;
        var organisationFallback = loadResult.OrganisationFallback!;

        var columnMap = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        for (var i = 0; i < table.Columns.Count; i++)
        {
            var name = NormalizeHeader(table.Columns[i].ColumnName);
            if (!string.IsNullOrWhiteSpace(name) && !columnMap.ContainsKey(name))
                columnMap[name] = i;
        }

        int? colDate = FindColumn(columnMap, "date", "occurredat", "occurred_at", "inspectiondate");
        int? colRego = FindColumn(columnMap, "rego", "registration", "plate", "reg");
        int? colMakeModel = FindColumn(columnMap, "makeandmodel", "makemodel", "make_model", "make&model");
        int? colOdo = FindColumn(columnMap, "odo", "odometer", "kms", "km");
        int? colRecordState = FindColumn(columnMap, "recordstate", "result", "state", "status");
        int? colNewWofDate = FindColumn(columnMap, "newwofdate", "new_wof_date", "newwof", "isnewwof", "is_new_wof");
        int? colAuthCode = FindColumn(columnMap, "authcode", "auth_code");
        int? colCheckSheet = FindColumn(columnMap, "checksheet", "check_sheet");
        int? colCsNo = FindColumn(columnMap, "csno", "cs_no");
        int? colWofLabel = FindColumn(columnMap, "woflabel", "wof_label");
        int? colLabelNo = FindColumn(columnMap, "labelno", "label_no");
        int? colFailReasons = FindColumn(columnMap, "failreasons", "failreason", "fail_reasons");
        int? colPrevExpiry = FindColumn(columnMap, "previous_expiry_date");
        int? colOrganisation = FindColumn(columnMap, "organisationname", "organizationname", "organisation", "organization");
        int? colNote = FindColumn(columnMap, "note", "notes");
        int? colUiState = FindColumn(columnMap, "uistate", "wofuistate", "wof_ui_state");

        if (colDate is null || colRego is null)
            return WofServiceResult.BadRequest("Missing required columns: Date, Rego.");

        var jobs = await (
                from j in _db.Jobs.AsNoTracking()
                join v in _db.Vehicles.AsNoTracking() on j.VehicleId equals v.Id
                where !EF.Functions.ILike(j.Status, "archived")
                where v.Plate != null && v.Plate != ""
                orderby j.CreatedAt descending
                select new
                {
                    j.Id,
                    v.Plate,
                }
            )
            .ToListAsync(ct);

        var latestJobByPlate = jobs
            .GroupBy(x => NormalizePlate(x.Plate))
            .Where(x => !string.IsNullOrWhiteSpace(x.Key))
            .ToDictionary(x => x.Key, x => x.First().Id, StringComparer.OrdinalIgnoreCase);

        var targetJobIds = latestJobByPlate.Values.Distinct().ToArray();
        var existingImportedRecords = targetJobIds.Length == 0
            ? new Dictionary<(long JobId, int ExcelRowNo), JobWofRecord>()
            : await _db.JobWofRecords
                .Where(x => targetJobIds.Contains(x.JobId) && x.SourceFile == sourceFile)
                .ToDictionaryAsync(x => (x.JobId, x.ExcelRowNo), ct);

        var now = DateTime.UtcNow;
        var totalRows = 0;
        var inserted = 0;
        var updated = 0;
        var skipped = 0;
        var missingRego = 0;
        var unmatchedRego = 0;

        await using var tx = await _db.Database.BeginTransactionAsync(ct);

        for (var rowIndex = 0; rowIndex < table.Rows.Count; rowIndex++)
        {
            var row = table.Rows[rowIndex];
            totalRows++;
            var rego = GetString(row, colRego);
            if (string.IsNullOrWhiteSpace(rego))
            {
                missingRego++;
                skipped++;
                continue;
            }

            var regoKey = NormalizePlate(rego);
            if (!latestJobByPlate.TryGetValue(regoKey, out var jobId))
            {
                unmatchedRego++;
                skipped++;
                continue;
            }

            var occurredAt = EnsureUtc(GetDateTime(row, colDate) ?? now);
            var recordState = ParseRecordState(GetString(row, colRecordState)) ?? WofRecordState.Pass;
            var uiState = ParseUiState(GetString(row, colUiState)) ?? MapUiState(recordState);
            var excelRowNo = rowIndex + 2;
            var newWofDate = GetDateOnly(row, colNewWofDate);
            var key = (jobId, excelRowNo);

            if (existingImportedRecords.TryGetValue(key, out var existing))
            {
                existing.OccurredAt = occurredAt;
                existing.Rego = rego.Trim();
                existing.MakeModel = PreferIncoming(existing.MakeModel, GetString(row, colMakeModel));
                existing.Odo = PreferIncoming(existing.Odo, GetString(row, colOdo));
                existing.RecordState = recordState;
                existing.IsNewWof = newWofDate.HasValue ? true : existing.IsNewWof;
                existing.NewWofDate = newWofDate ?? existing.NewWofDate;
                existing.AuthCode = PreferIncoming(existing.AuthCode, GetString(row, colAuthCode));
                existing.CheckSheet = PreferIncoming(existing.CheckSheet, GetString(row, colCheckSheet));
                existing.CsNo = PreferIncoming(existing.CsNo, GetString(row, colCsNo));
                existing.WofLabel = PreferIncoming(existing.WofLabel, GetString(row, colWofLabel));
                existing.LabelNo = PreferIncoming(existing.LabelNo, GetString(row, colLabelNo));
                existing.FailReasons = PreferIncoming(existing.FailReasons, GetString(row, colFailReasons));
                existing.PreviousExpiryDate = GetDateOnly(row, colPrevExpiry) ?? existing.PreviousExpiryDate;
                existing.OrganisationName = PreferIncoming(existing.OrganisationName, GetString(row, colOrganisation)) ?? organisationFallback;
                existing.Note = PreferIncoming(existing.Note, GetString(row, colNote));
                existing.WofUiState = existing.WofUiState == WofUiState.Printed ? existing.WofUiState : uiState;
                existing.SourceFile = sourceFile;
                existing.ExcelRowNo = excelRowNo;
                existing.ImportedAt = now;
                existing.UpdatedAt = now;
                updated++;
                continue;
            }

            _db.JobWofRecords.Add(new JobWofRecord
            {
                JobId = jobId,
                OccurredAt = occurredAt,
                Rego = rego.Trim(),
                MakeModel = GetString(row, colMakeModel),
                Odo = GetString(row, colOdo),
                RecordState = recordState,
                IsNewWof = newWofDate.HasValue ? true : null,
                NewWofDate = newWofDate,
                AuthCode = GetString(row, colAuthCode),
                CheckSheet = GetString(row, colCheckSheet),
                CsNo = GetString(row, colCsNo),
                WofLabel = GetString(row, colWofLabel),
                LabelNo = GetString(row, colLabelNo),
                FailReasons = GetString(row, colFailReasons),
                PreviousExpiryDate = GetDateOnly(row, colPrevExpiry),
                OrganisationName = GetString(row, colOrganisation) ?? organisationFallback,
                ExcelRowNo = excelRowNo,
                SourceFile = sourceFile,
                Note = GetString(row, colNote),
                WofUiState = uiState,
                ImportedAt = now,
                UpdatedAt = now,
            });
            inserted++;
        }

        if (inserted > 0 || updated > 0)
            await _db.SaveChangesAsync(ct);

        await tx.CommitAsync(ct);

        return WofServiceResult.Ok(new
        {
            inserted,
            updated,
            skipped,
            totalRows,
            unmatchedRego,
            missingRego,
            sourceFile,
            sheetName = string.IsNullOrWhiteSpace(sheetName) ? "default" : sheetName,
            matchedJobs = latestJobByPlate.Count,
        });
    }

    public async Task<WofServiceResult> CreateWofService(long id, CancellationToken ct)
    {
        var jobExists = await _db.Jobs.AsNoTracking().AnyAsync(x => x.Id == id, ct);
        if (!jobExists)
            return WofServiceResult.NotFound("Job not found.");

        var existingSelection = await (
                from selection in _db.JobServiceSelections.AsNoTracking()
                join catalogItem in _db.ServiceCatalogItems.AsNoTracking() on selection.ServiceCatalogItemId equals catalogItem.Id
                where selection.JobId == id && catalogItem.ServiceType == "wof"
                select selection.Id
            )
            .AnyAsync(ct);

        if (existingSelection)
            return WofServiceResult.Ok(new { success = true, alreadyExists = true });

        var selectedItem = await _db.ServiceCatalogItems
            .AsNoTracking()
            .Where(x => x.IsActive && x.ServiceType == "wof" && (x.Category == "child" || x.Category == "root"))
            .OrderByDescending(x => x.Category == "child")
            .ThenBy(x => x.SortOrder)
            .ThenBy(x => x.Id)
            .Select(x => new { x.Id, x.Name })
            .FirstOrDefaultAsync(ct);

        if (selectedItem is null)
            return WofServiceResult.BadRequest("No active WOF service catalog item is configured.");

        var now = DateTime.UtcNow;
        _db.JobServiceSelections.Add(new JobServiceSelection
        {
            JobId = id,
            ServiceCatalogItemId = selectedItem.Id,
            ServiceNameSnapshot = selectedItem.Name.Trim(),
            CreatedAt = now,
            UpdatedAt = now,
        });
        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (job is not null)
        {
            job.WofManualStatus = null;
            job.UpdatedAt = now;
        }

        var linkedDraftExists = await _db.JobInvoices.AsNoTracking()
            .AnyAsync(
                x => x.JobId == id
                    && x.Provider == "xero"
                    && x.ExternalInvoiceId != null
                    && x.ExternalStatus != null
                    && x.ExternalStatus.ToUpper() == "DRAFT",
                ct);

        if (linkedDraftExists)
        {
            var existingSyncMessage = await _db.OutboxMessages.AsNoTracking()
                .Where(x => x.AggregateType == InvoiceOutboxService.JobAggregateType
                    && x.AggregateId == id
                    && x.MessageType == InvoiceOutboxService.SyncWofDraftMessageType
                    && (x.Status == "pending" || x.Status == "processing"))
                .FirstOrDefaultAsync(ct);

            if (existingSyncMessage is null)
                _db.OutboxMessages.Add(_invoiceOutboxService.BuildSyncWofDraftMessage(id, now));
        }

        await _db.SaveChangesAsync(ct);

        return WofServiceResult.Ok(new
        {
            success = true,
            alreadyExists = false,
            serviceCatalogItemId = selectedItem.Id,
            xeroSyncQueued = linkedDraftExists
        });
    }

    public async Task<WofServiceResult> UpdateWofStatus(long jobId, string? status, CancellationToken ct)
    {
        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == jobId, ct);
        if (job is null)
            return WofServiceResult.NotFound("Job not found.");

        var hasWofService = await (
                from selection in _db.JobServiceSelections.AsNoTracking()
                join catalogItem in _db.ServiceCatalogItems.AsNoTracking() on selection.ServiceCatalogItemId equals catalogItem.Id
                where selection.JobId == jobId && catalogItem.ServiceType == "wof"
                select selection.Id
            )
            .AnyAsync(ct);

        if (!hasWofService)
            return WofServiceResult.BadRequest("This job does not have a WOF service.");

        var normalized = string.IsNullOrWhiteSpace(status) ? "Todo" : status.Trim();
        if (!string.Equals(normalized, "Todo", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(normalized, "Checked", StringComparison.OrdinalIgnoreCase))
        {
            return WofServiceResult.BadRequest("WOF status must be Todo or Checked.");
        }

        job.WofManualStatus = string.Equals(normalized, "Checked", StringComparison.OrdinalIgnoreCase)
            ? "Checked"
            : null;
        job.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return WofServiceResult.Ok(new
        {
            success = true,
            wofStatus = job.WofManualStatus is null ? "Todo" : "Checked"
        });
    }

    private async Task<WofServiceResult> ImportWofRecordsFromGoogleSheet(long id, CancellationToken ct)
    {
        var loadResult = await LoadGoogleSheetTableAsync(ct);
        if (!loadResult.Ok || loadResult.Table is null)
            return loadResult.Result ?? WofServiceResult.BadRequest("Failed to load Google Sheet.");

        return await ImportWofRecordsFromTable(
            id,
            loadResult.Table,
            loadResult.SheetName,
            loadResult.OrganisationFallback!,
            loadResult.SourceFile!,
            ct);
    }

    private async Task<GoogleSheetLoadResult> LoadGoogleSheetTableAsync(CancellationToken ct)
    {
        var spreadsheetId = _config["WofImport:SpreadsheetId"];
        var credentialsPath = _config["WofImport:GoogleCredentialsPath"];
        if (string.IsNullOrWhiteSpace(spreadsheetId))
            return GoogleSheetLoadResult.Fail(WofServiceResult.BadRequest("Missing WofImport:SpreadsheetId configuration."));
        if (string.IsNullOrWhiteSpace(credentialsPath))
            return GoogleSheetLoadResult.Fail(WofServiceResult.BadRequest("Missing WofImport:GoogleCredentialsPath configuration."));
        if (!System.IO.File.Exists(credentialsPath))
            return GoogleSheetLoadResult.Fail(WofServiceResult.NotFound($"Google credentials not found: {credentialsPath}"));

        var sheetName = _config["WofImport:SheetName"];
        var range = _config["WofImport:GoogleRange"];
        var organisationFallback = _config["WofImport:OrganisationName"] ?? "Unknown";

        var credential = GoogleCredential.FromFile(credentialsPath)
            .CreateScoped(SheetsService.Scope.SpreadsheetsReadonly);
        var service = new SheetsService(new BaseClientService.Initializer
        {
            HttpClientInitializer = credential,
            ApplicationName = "Workshop.Api"
        });

        if (string.IsNullOrWhiteSpace(sheetName) && string.IsNullOrWhiteSpace(range))
        {
            var metaRequest = service.Spreadsheets.Get(spreadsheetId);
            metaRequest.Fields = "sheets.properties.title";
            var meta = await metaRequest.ExecuteAsync(ct);
            sheetName = meta.Sheets?.FirstOrDefault()?.Properties?.Title;
        }

        if (string.IsNullOrWhiteSpace(range))
            range = !string.IsNullOrWhiteSpace(sheetName) ? sheetName : "Sheet1";
        if (string.IsNullOrWhiteSpace(sheetName) && range.Contains("!"))
            sheetName = range.Split('!')[0];

        var request = service.Spreadsheets.Values.Get(spreadsheetId, range);
        var response = await request.ExecuteAsync(ct);
        var values = response.Values;
        if (values == null || values.Count == 0)
            return GoogleSheetLoadResult.Fail(WofServiceResult.BadRequest("No rows found in the Google Sheet."));

        return GoogleSheetLoadResult.Success(
            BuildDataTable(values),
            sheetName,
            organisationFallback,
            $"google:{spreadsheetId}");
    }

    private static DataTable BuildDataTable(IList<IList<object>> values)
    {
        var table = new DataTable();
        if (values.Count == 0)
            return table;

        var headerRow = values[0];
        var maxCols = values.Max(v => v?.Count ?? 0);
        var used = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        for (var i = 0; i < maxCols; i++)
        {
            var raw = i < headerRow.Count ? headerRow[i]?.ToString() : null;
            var name = string.IsNullOrWhiteSpace(raw) ? $"col_{i + 1}" : raw!.Trim();
            var candidate = name;
            var suffix = 1;
            while (used.Contains(candidate))
            {
                candidate = $"{name}_{suffix}";
                suffix++;
            }
            used.Add(candidate);
            table.Columns.Add(candidate);
        }

        for (var rowIndex = 1; rowIndex < values.Count; rowIndex++)
        {
            var rowValues = values[rowIndex];
            var row = table.NewRow();
            for (var col = 0; col < maxCols; col++)
            {
                row[col] = col < rowValues.Count ? rowValues[col]?.ToString() ?? "" : "";
            }
            table.Rows.Add(row);
        }

        return table;
    }

    private async Task<WofServiceResult> ImportWofRecordsFromTable(
        long id,
        DataTable table,
        string? sheetName,
        string organisationFallback,
        string sourceFile,
        CancellationToken ct)
    {
        var columnMap = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        for (var i = 0; i < table.Columns.Count; i++)
        {
            var name = NormalizeHeader(table.Columns[i].ColumnName);
            if (!string.IsNullOrWhiteSpace(name) && !columnMap.ContainsKey(name))
                columnMap[name] = i;
        }

        int? colDate = FindColumn(columnMap, "date", "occurredat", "occurred_at", "inspectiondate");
        int? colRego = FindColumn(columnMap, "rego", "registration", "plate", "reg");
        int? colMakeModel = FindColumn(columnMap, "makeandmodel", "makemodel", "make_model", "make&model");
        int? colOdo = FindColumn(columnMap, "odo", "odometer", "kms", "km");
        int? colRecordState = FindColumn(columnMap, "recordstate", "result", "state", "status");
        int? colNewWofDate = FindColumn(
            columnMap,
            "newwofdate",
            "new_wof_date",
            "newwof",
            "isnewwof",
            "is_new_wof");
        int? colAuthCode = FindColumn(columnMap, "authcode", "auth_code");
        int? colCheckSheet = FindColumn(columnMap, "checksheet", "check_sheet");
        int? colCsNo = FindColumn(columnMap, "csno", "cs_no");
        int? colWofLabel = FindColumn(columnMap, "woflabel", "wof_label");
        int? colLabelNo = FindColumn(columnMap, "labelno", "label_no");
        int? colFailReasons = FindColumn(columnMap, "failreasons", "failreason", "fail_reasons");
        int? colPrevExpiry = FindColumn(
            columnMap,
          
            "previous_expiry_date"
        
        );
        int? colOrganisation = FindColumn(columnMap, "organisationname", "organizationname", "organisation", "organization");
        int? colNote = FindColumn(columnMap, "note", "notes");
        int? colUiState = FindColumn(columnMap, "uistate", "wofuistate", "wof_ui_state");

        if (colDate is null || colRego is null)
            return WofServiceResult.BadRequest("Missing required columns: Date, Rego.");

        var job = await (
                from j in _db.Jobs.AsNoTracking()
                join v in _db.Vehicles.AsNoTracking() on j.VehicleId equals v.Id
                where j.Id == id
                select new { j.Id, Plate = v.Plate }
            )
            .FirstOrDefaultAsync(ct);

        if (job is null || string.IsNullOrWhiteSpace(job.Plate))
            return WofServiceResult.NotFound("Job or vehicle plate not found.");

        var plateKey = NormalizePlate(job.Plate);

        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        var deleted = await _db.JobWofRecords
            .Where(x => x.JobId == id && (x.SourceFile == null || x.SourceFile != "manual"))
            .ExecuteDeleteAsync(ct);

        var now = DateTime.UtcNow;
        var inserted = 0;
        var skipped = 0;
        var totalRows = 0;
        var missingRego = 0;
        // var missingDate = 0;
        var unmatchedRego = 0;
        var matchedRego = 0;

        for (var rowIndex = 0; rowIndex < table.Rows.Count; rowIndex++)
        {
            var row = table.Rows[rowIndex];
            totalRows++;
            var rego = GetString(row, colRego);
            if (string.IsNullOrWhiteSpace(rego))
            {
                missingRego++;
                skipped++;
                continue;
            }

            var regoKey = NormalizePlate(rego);
            if (!string.Equals(regoKey, plateKey, StringComparison.OrdinalIgnoreCase))
            {
                unmatchedRego++;
                skipped++;
                continue;
            }

            var occurredAt = GetDateTime(row, colDate);
            // if (occurredAt is null)
            // {
            //     missingDate++;
            //     occurredAt = now;
            // }
            matchedRego++;

            var recordState = ParseRecordState(GetString(row, colRecordState)) ?? WofRecordState.Pass;
            var uiState = ParseUiState(GetString(row, colUiState)) ?? MapUiState(recordState);
            var excelRowNo = rowIndex + 2;
            var newWofDate = GetDateOnly(row, colNewWofDate);

            var record = new JobWofRecord
            {
                JobId = id,
                OccurredAt = EnsureUtc(occurredAt ?? now),
                Rego = rego.Trim(),
                MakeModel = GetString(row, colMakeModel),
                Odo = GetString(row, colOdo),
                RecordState = recordState,
                IsNewWof = newWofDate.HasValue ? true : null,
                NewWofDate = newWofDate,
                AuthCode = GetString(row, colAuthCode),
                CheckSheet = GetString(row, colCheckSheet),
                CsNo = GetString(row, colCsNo),
                WofLabel = GetString(row, colWofLabel),
                LabelNo = GetString(row, colLabelNo),
                FailReasons = GetString(row, colFailReasons),
                PreviousExpiryDate = GetDateOnly(row, colPrevExpiry),
                OrganisationName = GetString(row, colOrganisation) ?? organisationFallback,
                ExcelRowNo = excelRowNo,
                SourceFile = sourceFile,
                Note = GetString(row, colNote),
                WofUiState = uiState,
                ImportedAt = now,
                UpdatedAt = now
            };
            Console.WriteLine($"================================================Inserting WOF Record: JobId={record.JobId}, Rego={record.Rego}, OccurredAt={record.OccurredAt}, RecordState={record.RecordState}, ExcelRowNo={record.ExcelRowNo}"); 

            _db.JobWofRecords.Add(record);
            inserted++;
        }

        if (inserted > 0)
            await _db.SaveChangesAsync(ct);

        await tx.CommitAsync(ct);

        Console.WriteLine("=========WOF Import Summary:========");
        Console.WriteLine($"Total Rows Processed: {totalRows}");
        Console.WriteLine($"Inserted: {inserted}");
        Console.WriteLine($"Skipped: {skipped}");
        Console.WriteLine($"Missing Rego: {missingRego}");
        // Console.WriteLine($"Missing Date: {missingDate}");
        Console.WriteLine($"Matched Rego: {matchedRego}");

        return WofServiceResult.Ok(new
        {
            deleted,
            inserted,
            skipped,
            sourceFile,
            sheetName = string.IsNullOrWhiteSpace(sheetName) ? "default" : sheetName,
            totalRows,
            matchedRego,
            unmatchedRego,
            missingRego,
            // missingDate,
            jobId = id,
            plate = job.Plate,
            columns = table.Columns.Cast<DataColumn>().Select(c => c.ColumnName).ToArray()
        });
    }

    public async Task<WofServiceResult> UpdateWofRecord(long jobId, long recordId, WofRecordUpdateRequest request, CancellationToken ct)
    {
        if (request is null)
            return WofServiceResult.BadRequest("Missing payload.");

        var record = await _db.JobWofRecords
            .FirstOrDefaultAsync(x => x.JobId == jobId && x.Id == recordId, ct);

        if (record is null)
            return WofServiceResult.NotFound("WOF record not found.");

        if (string.IsNullOrWhiteSpace(request.Rego))
            return WofServiceResult.BadRequest("Rego is required.");

        if (string.IsNullOrWhiteSpace(request.OccurredAt))
            return WofServiceResult.BadRequest("OccurredAt is required.");

        var occurredAt = ParseDateTime(request.OccurredAt);
        if (occurredAt is null)
            return WofServiceResult.BadRequest("Invalid occurredAt.");

        if (string.IsNullOrWhiteSpace(request.RecordState))
            return WofServiceResult.BadRequest("RecordState is required.");

        var recordState = ParseRecordState(request.RecordState);
        if (recordState is null)
            return WofServiceResult.BadRequest("RecordState must be Pass, Fail or Recheck.");

        DateOnly? previousExpiry = null;
        if (!string.IsNullOrWhiteSpace(request.PreviousExpiryDate))
        {
            previousExpiry = ParseDateOnly(request.PreviousExpiryDate);
            if (previousExpiry is null)
                return WofServiceResult.BadRequest("Invalid previous expiry date.");
        }

        DateTime? importedAt = null;
        if (!string.IsNullOrWhiteSpace(request.ImportedAt))
        {
            var parsedImported = ParseDateTime(request.ImportedAt);
            if (parsedImported is null)
                return WofServiceResult.BadRequest("Invalid importedAt.");
            importedAt = EnsureUtc(parsedImported.Value);
        }

        var parsedUiState = ParseUiState(request.WofUiState);
        if (!string.IsNullOrWhiteSpace(request.WofUiState) && parsedUiState is null)
            return WofServiceResult.BadRequest("WofUiState must be Pass, Fail or Recheck.");
        var uiState = parsedUiState ?? MapUiState(recordState.Value);

        record.OccurredAt = EnsureUtc(occurredAt.Value);
        record.Rego = request.Rego.Trim();
        record.MakeModel = NormalizeOptional(request.MakeModel);
        record.Odo = NormalizeOptional(request.Odo);
        record.RecordState = recordState.Value;
        record.IsNewWof = request.IsNewWof;
        record.NewWofDate = ParseDateOnly(request.NewWofDate);
        record.AuthCode = NormalizeOptional(request.AuthCode);
        record.CheckSheet = NormalizeOptional(request.CheckSheet);
        record.CsNo = NormalizeOptional(request.CsNo);
        record.WofLabel = NormalizeOptional(request.WofLabel);
        record.LabelNo = NormalizeOptional(request.LabelNo);
        record.FailReasons = NormalizeOptional(request.FailReasons);
        record.PreviousExpiryDate = previousExpiry;
        if (!string.IsNullOrWhiteSpace(request.OrganisationName))
            record.OrganisationName = request.OrganisationName.Trim();
        if (request.ExcelRowNo.HasValue)
            record.ExcelRowNo = request.ExcelRowNo.Value;
        record.SourceFile = NormalizeOptional(request.SourceFile);
        record.Note = NormalizeOptional(request.Note);
        record.WofUiState = uiState;
        if (importedAt.HasValue)
            record.ImportedAt = importedAt.Value;
        record.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);

        return WofServiceResult.Ok(new { success = true });
    }

    public async Task<WofServiceResult> DeleteWofServer(long id, CancellationToken ct)
    {
        var removedSelections = await (
                from selection in _db.JobServiceSelections.AsNoTracking()
                join catalogItem in _db.ServiceCatalogItems.AsNoTracking() on selection.ServiceCatalogItemId equals catalogItem.Id
                where selection.JobId == id && catalogItem.ServiceType == "wof"
                select new InvoiceOutboxService.RemovedServiceSelectionPayload(
                    selection.ServiceCatalogItemId,
                    selection.ServiceNameSnapshot)
            )
            .ToListAsync(ct);

        var linkedDraftExists = await _db.JobInvoices.AsNoTracking()
            .AnyAsync(
                x => x.JobId == id
                    && x.Provider == "xero"
                    && x.ExternalInvoiceId != null
                    && x.ExternalStatus != null
                    && x.ExternalStatus.ToUpper() == "DRAFT",
                ct);

        var wofCatalogItemIds = _db.ServiceCatalogItems.AsNoTracking()
            .Where(x => x.ServiceType == "wof")
            .Select(x => x.Id);

        await using var tx = await _db.Database.BeginTransactionAsync(ct);

        var deleted = await _db.JobWofRecords
            .Where(x => x.JobId == id)
            .ExecuteDeleteAsync(ct);

        var deletedSelections = await _db.JobServiceSelections
            .Where(x => x.JobId == id && wofCatalogItemIds.Contains(x.ServiceCatalogItemId))
            .ExecuteDeleteAsync(ct);

        var clearStatusAt = DateTime.UtcNow;
        await _db.Jobs
            .Where(x => x.Id == id)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(x => x.WofManualStatus, (string?)null)
                .SetProperty(x => x.UpdatedAt, clearStatusAt), ct);

        var xeroSyncQueued = false;
        if (linkedDraftExists && removedSelections.Count > 0)
        {
            var existingRemoveMessage = await _db.OutboxMessages.AsNoTracking()
                .Where(x => x.AggregateType == InvoiceOutboxService.JobAggregateType
                    && x.AggregateId == id
                    && x.MessageType == InvoiceOutboxService.RemoveWofDraftItemsMessageType
                    && (x.Status == "pending" || x.Status == "processing"))
                .FirstOrDefaultAsync(ct);

            if (existingRemoveMessage is null)
            {
                _db.OutboxMessages.Add(_invoiceOutboxService.BuildRemoveWofDraftItemsMessage(id, removedSelections, DateTime.UtcNow));
                await _db.SaveChangesAsync(ct);
                xeroSyncQueued = true;
            }
        }

        await tx.CommitAsync(ct);

        if (deleted == 0 && deletedSelections == 0)
            return WofServiceResult.NotFound("WOF record not found.");

        return WofServiceResult.Ok(new { success = true, deleted, deletedSelections, xeroSyncQueued });
    }

    public async Task<WofServiceResult> DeleteWofRecord(long jobId, long recordId, CancellationToken ct)
    {
        var deleted = await _db.JobWofRecords
            .Where(x => x.JobId == jobId && x.Id == recordId)
            .ExecuteDeleteAsync(ct);

        if (deleted == 0)
            return WofServiceResult.NotFound("WOF record not found.");

        return WofServiceResult.Ok(new { success = true, deleted });
    }

    public async Task<WofServiceResult> CreateWofRecord(long jobId, WofRecordUpdateRequest request, CancellationToken ct)
    {
        if (request is null)
            return WofServiceResult.BadRequest("Missing payload.");

        var jobExists = await _db.Jobs.AsNoTracking().AnyAsync(x => x.Id == jobId, ct);
        if (!jobExists)
            return WofServiceResult.NotFound("Job not found.");

        if (string.IsNullOrWhiteSpace(request.Rego))
            return WofServiceResult.BadRequest("Rego is required.");

        if (string.IsNullOrWhiteSpace(request.OccurredAt))
            return WofServiceResult.BadRequest("OccurredAt is required.");

        var occurredAt = ParseDateTime(request.OccurredAt);
        if (occurredAt is null)
            return WofServiceResult.BadRequest("Invalid occurredAt.");

        if (string.IsNullOrWhiteSpace(request.RecordState))
            return WofServiceResult.BadRequest("RecordState is required.");

        var recordState = ParseRecordState(request.RecordState);
        if (recordState is null)
            return WofServiceResult.BadRequest("RecordState must be Pass, Fail or Recheck.");

        DateOnly? previousExpiry = null;
        if (!string.IsNullOrWhiteSpace(request.PreviousExpiryDate))
        {
            previousExpiry = ParseDateOnly(request.PreviousExpiryDate);
            if (previousExpiry is null)
                return WofServiceResult.BadRequest("Invalid previous expiry date.");
        }

        DateTime? importedAt = null;
        if (!string.IsNullOrWhiteSpace(request.ImportedAt))
        {
            var parsedImported = ParseDateTime(request.ImportedAt);
            if (parsedImported is null)
                return WofServiceResult.BadRequest("Invalid importedAt.");
            importedAt = EnsureUtc(parsedImported.Value);
        }

        var parsedUiState = ParseUiState(request.WofUiState);
        if (!string.IsNullOrWhiteSpace(request.WofUiState) && parsedUiState is null)
            return WofServiceResult.BadRequest("WofUiState must be Pass, Fail or Recheck.");
        var uiState = parsedUiState ?? MapUiState(recordState.Value);

        var now = DateTime.UtcNow;
        var organisationFallback = _config["WofImport:OrganisationName"] ?? "Unknown";

        var record = new JobWofRecord
        {
            JobId = jobId,
            OccurredAt = EnsureUtc(occurredAt.Value),
            Rego = request.Rego.Trim(),
            MakeModel = NormalizeOptional(request.MakeModel),
            Odo = NormalizeOptional(request.Odo),
            RecordState = recordState.Value,
            IsNewWof = request.IsNewWof,
            NewWofDate = ParseDateOnly(request.NewWofDate),
            AuthCode = NormalizeOptional(request.AuthCode),
            CheckSheet = NormalizeOptional(request.CheckSheet),
            CsNo = NormalizeOptional(request.CsNo),
            WofLabel = NormalizeOptional(request.WofLabel),
            LabelNo = NormalizeOptional(request.LabelNo),
            FailReasons = NormalizeOptional(request.FailReasons),
            PreviousExpiryDate = previousExpiry,
            OrganisationName = string.IsNullOrWhiteSpace(request.OrganisationName)
                ? organisationFallback
                : request.OrganisationName.Trim(),
            ExcelRowNo = request.ExcelRowNo ?? 0,
            SourceFile = string.IsNullOrWhiteSpace(request.SourceFile) ? "manual" : request.SourceFile.Trim(),
            Note = NormalizeOptional(request.Note),
            WofUiState = uiState,
            ImportedAt = importedAt ?? now,
            UpdatedAt = now
        };

        _db.JobWofRecords.Add(record);
        await _db.SaveChangesAsync(ct);

        return WofServiceResult.Ok(new
        {
            success = true,
            id = record.Id
        });
    }

    public async Task<WofServiceResult> CreateWofResult(
        long id,
        string? result,
        string? recheckExpiryDate,
        long? failReasonId,
        string? note,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(result))
            return WofServiceResult.BadRequest("Result is required.");

        var resultValue = result.Trim();
        var recordState = ParseRecordState(resultValue);
        if (recordState is null)
            return WofServiceResult.BadRequest("Result must be Pass, Fail or Recheck.");

        DateOnly? recheckDate = null;
        if (!string.IsNullOrWhiteSpace(recheckExpiryDate))
        {
            if (!DateOnly.TryParse(recheckExpiryDate, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
                return WofServiceResult.BadRequest("Invalid recheck expiry date.");
            recheckDate = parsed;
        }

        var job = await (
                from j in _db.Jobs.AsNoTracking()
                join v in _db.Vehicles.AsNoTracking() on j.VehicleId equals v.Id
                where j.Id == id
                select new { j.Id, Plate = v.Plate }
            )
            .FirstOrDefaultAsync(ct);

        if (job is null)
            return WofServiceResult.NotFound("Job not found.");

        string? failReason = null;
        if (recordState == WofRecordState.Pass)
        {
            failReasonId = null;
            recheckDate = null;
        }
        else if (failReasonId.HasValue)
        {
            failReason = await _db.WofFailReasons.AsNoTracking()
                .Where(x => x.Id == failReasonId.Value)
                .Select(x => x.Label)
                .FirstOrDefaultAsync(ct);
        }

        var now = DateTime.UtcNow;
        var organisationFallback = _config["WofImport:OrganisationName"] ?? "Unknown";

        var record = new JobWofRecord
        {
            JobId = id,
            OccurredAt = now,
            Rego = job.Plate,
            MakeModel = null,
            Odo = null,
            RecordState = recordState.Value,
            IsNewWof = null,
            AuthCode = null,
            CheckSheet = null,
            CsNo = null,
            WofLabel = null,
            LabelNo = null,
            FailReasons = failReason,
            PreviousExpiryDate = recheckDate,
            OrganisationName = organisationFallback,
            ExcelRowNo = 0,
            SourceFile = "manual",
            Note = note ?? "",
            WofUiState = MapUiState(recordState.Value),
            ImportedAt = now,
            UpdatedAt = now
        };

        _db.JobWofRecords.Add(record);
        await _db.SaveChangesAsync(ct);

        return WofServiceResult.Ok(new
        {
            hasWofServer = true,
            record = new
            {
                id = record.Id.ToString(CultureInfo.InvariantCulture),
                wofId = record.JobId.ToString(CultureInfo.InvariantCulture),
                date = record.OccurredAt.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                result = ToRecordStateLabel(record.RecordState),
                recheckExpiryDate = FormatDate(record.PreviousExpiryDate),
                failReasonId,
                failReason,
                note = record.Note ?? "",
                source = record.SourceFile ?? "manual"
            }
        });
    }

    private static string NormalizeHeader(string value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";
        var chars = value.Trim().ToLowerInvariant().Where(char.IsLetterOrDigit).ToArray();
        return new string(chars);
    }

    private static string? PreferIncoming(string? currentValue, string? incomingValue)
        => string.IsNullOrWhiteSpace(incomingValue) ? currentValue : incomingValue.Trim();

    private static int? FindColumn(IReadOnlyDictionary<string, int> map, params string[] names)
    {
        foreach (var name in names)
        {
            var key = NormalizeHeader(name);
            if (map.TryGetValue(key, out var idx))
                return idx;
        }
        return null;
    }

    private static string? GetString(DataRow row, int? column)
    {
        if (column is null) return null;
        var value = row[column.Value];
        if (value is null || value == DBNull.Value) return null;
        if (value is string s) return string.IsNullOrWhiteSpace(s) ? null : s.Trim();
        if (value is DateTime dt) return dt.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        if (value is double d)
        {
            if (Math.Abs(d % 1) < 0.0000001)
                return ((long)d).ToString(CultureInfo.InvariantCulture);
            return d.ToString(CultureInfo.InvariantCulture);
        }
        return value.ToString()?.Trim();
    }

    private static DateTime? GetDateTime(DataRow row, int? column)
    {
        if (column is null) return null;
        var value = row[column.Value];
        if (value is null || value == DBNull.Value) return null;
        if (value is DateTime dt) return dt;
        if (value is double d) return DateTime.FromOADate(d);
        if (value is string s)
        {
            var normalized = NormalizeDateString(s);
            if (string.IsNullOrWhiteSpace(normalized)) return null;
            if (DateTime.TryParse(normalized, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var parsed))
                return parsed;
            if (DateTime.TryParse(normalized, CultureInfo.CurrentCulture, DateTimeStyles.AssumeLocal, out parsed))
                return parsed;
            var nz = CultureInfo.GetCultureInfo("en-NZ");
            if (DateTime.TryParse(normalized, nz, DateTimeStyles.AssumeLocal, out parsed))
                return parsed;
            var formats = new[]
            {
                "d/M/yyyy",
                "dd/MM/yyyy",
                "d/M/yyyy HH:mm",
                "dd/MM/yyyy HH:mm",
                "d/M/yyyy H:mm",
                "dd/MM/yyyy H:mm",
                "yyyy-M-d",
                "yyyy-MM-dd",
                "yyyy/M/d",
                "yyyy/MM/dd",
                "yyyy-MM-dd HH:mm",
                "yyyy/MM/dd HH:mm",
                "yyyyMMdd",
            };
            if (DateTime.TryParseExact(normalized.Trim(), formats, nz, DateTimeStyles.AssumeLocal, out parsed))
                return parsed;
            if (DateTime.TryParseExact(normalized.Trim(), formats, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out parsed))
                return parsed;
        }
        return null;
    }

    private static DateOnly? GetDateOnly(DataRow row, int? column)
    {
        var dt = GetDateTime(row, column);
        return dt.HasValue ? DateOnly.FromDateTime(dt.Value) : null;
    }

    internal static DateOnly? ParseDateOnly(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var normalized = NormalizeDateString(value);
        if (string.IsNullOrWhiteSpace(normalized)) return null;
        if (DateOnly.TryParse(normalized, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
            return parsed;
        if (DateOnly.TryParse(normalized, CultureInfo.CurrentCulture, DateTimeStyles.None, out parsed))
            return parsed;
        var nz = CultureInfo.GetCultureInfo("en-NZ");
        if (DateOnly.TryParse(normalized, nz, DateTimeStyles.None, out parsed))
            return parsed;
        var formats = new[]
        {
            "d/M/yyyy",
            "dd/MM/yyyy",
            "d/M/yyyy HH:mm",
            "dd/MM/yyyy HH:mm",
            "d/M/yyyy H:mm",
            "dd/MM/yyyy H:mm",
            "yyyy-M-d",
            "yyyy-MM-dd",
            "yyyy/M/d",
            "yyyy/MM/dd",
            "yyyy-MM-dd HH:mm",
            "yyyy/MM/dd HH:mm",
            "yyyyMMdd",
        };
        if (DateOnly.TryParseExact(normalized.Trim(), formats, nz, DateTimeStyles.None, out parsed))
            return parsed;
        if (DateOnly.TryParseExact(normalized.Trim(), formats, CultureInfo.InvariantCulture, DateTimeStyles.None, out parsed))
            return parsed;
        var parsedDateTime = ParseDateTime(value);
        return parsedDateTime.HasValue ? DateOnly.FromDateTime(parsedDateTime.Value) : null;
    }

    private static bool? GetBool(DataRow row, int? column)
    {
        if (column is null) return null;
        var value = row[column.Value];
        if (value is null || value == DBNull.Value) return null;
        if (value is bool b) return b;
        if (value is double d) return Math.Abs(d) > 0.0000001;
        if (value is string s)
        {
            var trimmed = s.Trim().ToLowerInvariant();
            if (trimmed is "true" or "yes" or "y" or "1") return true;
            if (trimmed is "false" or "no" or "n" or "0") return false;
        }
        return null;
    }

    private static WofRecordState? ParseRecordState(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var v = value.Trim().ToLowerInvariant();
        if (v.StartsWith("p")) return WofRecordState.Pass;
        if (v.StartsWith("f")) return WofRecordState.Fail;
        if (v.StartsWith("r")) return WofRecordState.Recheck;
        return null;
    }

    private static WofUiState? ParseUiState(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var v = value.Trim().ToLowerInvariant();
        if (v.StartsWith("p") && !v.StartsWith("pr")) return WofUiState.Pass;
        if (v.StartsWith("f")) return WofUiState.Fail;
        if (v.StartsWith("r")) return WofUiState.Recheck;
        if (v.StartsWith("print")) return WofUiState.Printed;
        return null;
    }

    private static WofUiState MapUiState(WofRecordState state) => state switch
    {
        WofRecordState.Fail => WofUiState.Fail,
        WofRecordState.Recheck => WofUiState.Recheck,
        _ => WofUiState.Pass
    };

    private static string ToRecordStateLabel(WofRecordState state) => state switch
    {
        WofRecordState.Fail => "Fail",
        WofRecordState.Recheck => "Recheck",
        _ => "Pass"
    };

    private static string ToUiStateLabel(WofUiState state) => state switch
    {
        WofUiState.Fail => "Fail",
        WofUiState.Recheck => "Recheck",
        WofUiState.Printed => "Printed",
        _ => "Pass"
    };

    private static string NormalizePlate(string value)
    {
        var chars = value.Trim().ToUpperInvariant().Where(char.IsLetterOrDigit).ToArray();
        return new string(chars);
    }

    private static DateTime EnsureUtc(DateTime value)
        => DateTimeHelper.NormalizeUtc(value);

    private static DateTime? ParseDateTime(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var normalized = NormalizeDateString(value);
        if (string.IsNullOrWhiteSpace(normalized)) return null;
        if (DateTime.TryParse(normalized, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var parsed))
            return parsed;
        if (DateTime.TryParse(normalized, CultureInfo.CurrentCulture, DateTimeStyles.AssumeLocal, out parsed))
            return parsed;
        return null;
    }

    private static string NormalizeDateString(string value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";
        var trimmed = value.Trim();
        var chars = trimmed.Where(c =>
            char.IsDigit(c) ||
            c == '/' ||
            c == '-' ||
            c == ':' ||
            c == 'T' ||
            char.IsWhiteSpace(c)
        ).ToArray();
        return new string(chars).Trim();
    }

    private static string? NormalizeOptional(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static string FormatDate(DateOnly? date)
        => date.HasValue ? date.Value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) : "";

    private static string FormatDateTime(DateTime dateTime)
        => DateTimeHelper.FormatUtc(dateTime);
}

public record WofServiceResult(int StatusCode, object? Payload, string? Error)
{
    public static WofServiceResult Ok(object payload) => new(200, payload, null);
    public static WofServiceResult BadRequest(string error) => new(400, null, error);
    public static WofServiceResult NotFound(string error) => new(404, null, error);
}

public record WofRecordUpdateRequest(
    string? OccurredAt,
    string? Rego,
    string? MakeModel,
    string? Odo,
    string? RecordState,
    bool? IsNewWof,
    string? NewWofDate,
    string? AuthCode,
    string? CheckSheet,
    string? CsNo,
    string? WofLabel,
    string? LabelNo,
    string? FailReasons,
    string? PreviousExpiryDate,
    string? OrganisationName,
    int? ExcelRowNo,
    string? SourceFile,
    string? Note,
    string? WofUiState,
    string? ImportedAt);

sealed record GoogleSheetLoadResult(
    bool Ok,
    DataTable? Table,
    string? SheetName,
    string? OrganisationFallback,
    string? SourceFile,
    WofServiceResult? Result)
{
    public static GoogleSheetLoadResult Success(DataTable table, string? sheetName, string organisationFallback, string sourceFile)
        => new(true, table, sheetName, organisationFallback, sourceFile, null);

    public static GoogleSheetLoadResult Fail(WofServiceResult result)
        => new(false, null, null, null, null, result);
}
