using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Models;
using Workshop.Api.Services;
using Workshop.Api.Utils;

namespace Workshop.Api.Controllers;

[ApiController]
[Route("api/jobs")]
public class JobsController : ControllerBase
{
    private const string JobsListVersionCacheKey = "jobs:list:version:v1";
    private const string PoUnreadSummaryCacheKey = "jobs:po-unread-summary:v1";
    private const string PaintBoardCacheKey = "jobs:paint-board:v1";
    private const string WofScheduleCacheKey = "jobs:wof-schedule:v1";
    private const int MaxJobsPageSize = 200;
    private static readonly TimeSpan JobsListCacheDuration = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan JobsListVersionCacheDuration = TimeSpan.FromDays(30);
    private static readonly TimeSpan JobDetailCacheDuration = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan PaintServiceCacheDuration = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan PoUnreadSummaryCacheDuration = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan PaintBoardCacheDuration = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan WofScheduleCacheDuration = TimeSpan.FromSeconds(30);
    private static readonly PoUnreadSummaryResponse EmptyPoUnreadSummary =
        new(0, 0, Array.Empty<PoUnreadSummaryItemResponse>());

    private readonly AppDbContext _db;
    private readonly IAppCache _appCache;
    private readonly JobPoStateService _jobPoStateService;
    private readonly JobInvoiceService _jobInvoiceService;

    public JobsController(
        AppDbContext db,
        IAppCache appCache,
        JobPoStateService jobPoStateService,
        JobInvoiceService jobInvoiceService)
    {
        _db = db;
        _appCache = appCache;
        _jobPoStateService = jobPoStateService;
        _jobInvoiceService = jobInvoiceService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] JobsListQuery query, CancellationToken ct)
    {
        var request = NormalizeJobsListQuery(query);
        var version = await GetJobsListVersionAsync(ct);
        var payload = await _appCache.GetOrCreateJsonAsync(
            GetJobsListCacheKey(request, version),
            JobsListCacheDuration,
            token => BuildJobsListResponseJsonAsync(request, token),
            ct
        );

        return Content(payload ?? "{\"items\":[],\"totalItems\":0,\"totalPages\":1,\"currentPage\":1,\"pageSize\":20}", "application/json");
    }

    private async Task<string?> BuildJobsListResponseJsonAsync(JobsListRequest request, CancellationToken ct)
    {
        var paintServices = _db.JobPaintServices.AsNoTracking();
        var wofRecords = _db.JobWofRecords.AsNoTracking();

        var wofServiceJobIds = (
                from selection in _db.JobServiceSelections.AsNoTracking()
                join catalogItem in _db.ServiceCatalogItems.AsNoTracking() on selection.ServiceCatalogItemId equals catalogItem.Id
                where catalogItem.ServiceType == "wof"
                select new { selection.JobId }
            )
            .Distinct();

        var query =
            from j in _db.Jobs.AsNoTracking()
            join v in _db.Vehicles.AsNoTracking() on j.VehicleId equals v.Id
            join c in _db.Customers.AsNoTracking() on j.CustomerId equals c.Id
            join ji in _db.JobInvoices.AsNoTracking() on j.Id equals ji.JobId into invoiceGroup
            from ji in invoiceGroup.DefaultIfEmpty()
            join ws in _db.JobWofStates.AsNoTracking() on j.Id equals ws.JobId into latestWofStateGroup
            from ws in latestWofStateGroup.DefaultIfEmpty()
            select new
            {
                Job = j,
                Vehicle = v,
                Customer = c,
                Invoice = ji,
                WofState = ws
            };

        if (string.IsNullOrWhiteSpace(request.JobType))
        {
            query = query.Where(x => x.Job.Status != null && !EF.Functions.ILike(x.Job.Status, "Archived"));
        }
        else
        {
            query = request.JobType switch
            {
                "In Progress" => query.Where(x => x.Job.Status != null && (EF.Functions.ILike(x.Job.Status, "InProgress") || EF.Functions.ILike(x.Job.Status, "In Progress"))),
                "Ready" => query.Where(x => x.Job.Status != null && (EF.Functions.ILike(x.Job.Status, "Delivered") || EF.Functions.ILike(x.Job.Status, "Ready"))),
                _ => query.Where(x => x.Job.Status != null && EF.Functions.ILike(x.Job.Status, request.JobType))
            };
        }

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var pattern = $"%{request.Search}%";
            var parsedId = long.TryParse(request.Search, NumberStyles.None, CultureInfo.InvariantCulture, out var jobId)
                ? jobId
                : (long?)null;

            query = query.Where(x =>
                (parsedId.HasValue && x.Job.Id == parsedId.Value)
                || EF.Functions.ILike(x.Vehicle.Plate ?? "", pattern)
                || EF.Functions.ILike((x.Vehicle.Make ?? "") + " " + (x.Vehicle.Model ?? ""), pattern)
                || EF.Functions.ILike(x.Customer.BusinessCode ?? "", pattern)
                || EF.Functions.ILike(x.Customer.Name ?? "", pattern)
                || EF.Functions.ILike(x.Job.Notes ?? "", pattern));
        }

        if (!string.IsNullOrWhiteSpace(request.Customer))
        {
            var customerPattern = $"%{request.Customer}%";
            query = query.Where(x =>
                EF.Functions.ILike(x.Customer.BusinessCode ?? "", customerPattern)
                || EF.Functions.ILike(x.Customer.Name ?? "", customerPattern));
        }

        if (request.RangeStartUtc.HasValue)
            query = query.Where(x => x.Job.CreatedAt >= request.RangeStartUtc.Value);

        if (request.RangeEndUtcExclusive.HasValue)
            query = query.Where(x => x.Job.CreatedAt < request.RangeEndUtcExclusive.Value);

        if (!string.IsNullOrWhiteSpace(request.WofStatus))
        {
            query = request.WofStatus switch
            {
                "Recorded" => query.Where(x =>
                    wofRecords
                        .Any(record => record.JobId == x.Job.Id)
                    || (wofServiceJobIds.Any(wofJob => wofJob.JobId == x.Job.Id)
                        && x.WofState != null
                        && x.WofState.ManualStatus != null
                        && EF.Functions.ILike(x.WofState.ManualStatus, "Recorded"))),
                "Checked" => query.Where(x =>
                    !wofRecords.Any(record => record.JobId == x.Job.Id)
                    && wofServiceJobIds.Any(wofJob => wofJob.JobId == x.Job.Id)
                    && x.WofState != null
                    && x.WofState.ManualStatus != null
                    && EF.Functions.ILike(x.WofState.ManualStatus, "Checked")),
                "Todo" => query.Where(x =>
                    !wofRecords.Any(record => record.JobId == x.Job.Id)
                    && wofServiceJobIds.Any(wofJob => wofJob.JobId == x.Job.Id)
                    && (x.WofState == null
                        || x.WofState.ManualStatus == null
                        || (!EF.Functions.ILike(x.WofState.ManualStatus, "Checked")
                            && !EF.Functions.ILike(x.WofState.ManualStatus, "Recorded")))),
                _ => query
            };
        }

        if (!string.IsNullOrWhiteSpace(request.PaintStatus))
        {
            query = request.PaintStatus switch
            {
                "on_hold" => query.Where(x =>
                    paintServices
                        .Where(paint => paint.JobId == x.Job.Id)
                        .OrderByDescending(paint => paint.UpdatedAt)
                        .ThenByDescending(paint => paint.Id)
                        .Select(paint => (int?)paint.CurrentStage)
                        .FirstOrDefault() <= -2),
                "waiting" => query.Where(x =>
                    paintServices
                        .Where(paint => paint.JobId == x.Job.Id)
                        .OrderByDescending(paint => paint.UpdatedAt)
                        .ThenByDescending(paint => paint.Id)
                        .Select(paint => paint.Status)
                        .FirstOrDefault() != null
                    && (paintServices
                            .Where(paint => paint.JobId == x.Job.Id)
                            .OrderByDescending(paint => paint.UpdatedAt)
                            .ThenByDescending(paint => paint.Id)
                            .Select(paint => (int?)paint.CurrentStage)
                            .FirstOrDefault() == null
                        || (paintServices
                                .Where(paint => paint.JobId == x.Job.Id)
                                .OrderByDescending(paint => paint.UpdatedAt)
                                .ThenByDescending(paint => paint.Id)
                                .Select(paint => (int?)paint.CurrentStage)
                                .FirstOrDefault() < 0
                            && paintServices
                                .Where(paint => paint.JobId == x.Job.Id)
                                .OrderByDescending(paint => paint.UpdatedAt)
                                .ThenByDescending(paint => paint.Id)
                                .Select(paint => (int?)paint.CurrentStage)
                                .FirstOrDefault() > -2))),
                "sheet" => query.Where(x => paintServices
                    .Where(paint => paint.JobId == x.Job.Id)
                    .OrderByDescending(paint => paint.UpdatedAt)
                    .ThenByDescending(paint => paint.Id)
                    .Select(paint => (int?)paint.CurrentStage)
                    .FirstOrDefault() == 0),
                "undercoat" => query.Where(x => paintServices
                    .Where(paint => paint.JobId == x.Job.Id)
                    .OrderByDescending(paint => paint.UpdatedAt)
                    .ThenByDescending(paint => paint.Id)
                    .Select(paint => (int?)paint.CurrentStage)
                    .FirstOrDefault() == 1),
                "sanding" => query.Where(x => paintServices
                    .Where(paint => paint.JobId == x.Job.Id)
                    .OrderByDescending(paint => paint.UpdatedAt)
                    .ThenByDescending(paint => paint.Id)
                    .Select(paint => (int?)paint.CurrentStage)
                    .FirstOrDefault() == 2),
                "painting" => query.Where(x => paintServices
                    .Where(paint => paint.JobId == x.Job.Id)
                    .OrderByDescending(paint => paint.UpdatedAt)
                    .ThenByDescending(paint => paint.Id)
                    .Select(paint => (int?)paint.CurrentStage)
                    .FirstOrDefault() == 3),
                "assembly" => query.Where(x =>
                    paintServices
                        .Where(paint => paint.JobId == x.Job.Id)
                        .OrderByDescending(paint => paint.UpdatedAt)
                        .ThenByDescending(paint => paint.Id)
                        .Select(paint => (int?)paint.CurrentStage)
                        .FirstOrDefault() >= 4
                    && (paintServices
                            .Where(paint => paint.JobId == x.Job.Id)
                            .OrderByDescending(paint => paint.UpdatedAt)
                            .ThenByDescending(paint => paint.Id)
                            .Select(paint => paint.Status)
                            .FirstOrDefault() == null
                        || (!EF.Functions.ILike(
                                paintServices
                                    .Where(paint => paint.JobId == x.Job.Id)
                                    .OrderByDescending(paint => paint.UpdatedAt)
                                    .ThenByDescending(paint => paint.Id)
                                    .Select(paint => paint.Status)
                                    .FirstOrDefault() ?? "",
                                "done")
                            && !EF.Functions.ILike(
                                paintServices
                                    .Where(paint => paint.JobId == x.Job.Id)
                                    .OrderByDescending(paint => paint.UpdatedAt)
                                    .ThenByDescending(paint => paint.Id)
                                    .Select(paint => paint.Status)
                                    .FirstOrDefault() ?? "",
                                "delivered")))),
                "done" => query.Where(x => EF.Functions.ILike(
                    paintServices
                        .Where(paint => paint.JobId == x.Job.Id)
                        .OrderByDescending(paint => paint.UpdatedAt)
                        .ThenByDescending(paint => paint.Id)
                        .Select(paint => paint.Status)
                        .FirstOrDefault() ?? "",
                    "done")),
                "delivered" => query.Where(x => EF.Functions.ILike(
                    paintServices
                        .Where(paint => paint.JobId == x.Job.Id)
                        .OrderByDescending(paint => paint.UpdatedAt)
                        .ThenByDescending(paint => paint.Id)
                        .Select(paint => paint.Status)
                        .FirstOrDefault() ?? "",
                    "delivered")),
                _ => query
            };
        }

        if (request.SelectedTags.Length > 0)
        {
            var selectedTags = request.SelectedTags.Select(x => x.ToLowerInvariant()).ToArray();
            var taggedJobIds = (
                    from jt in _db.JobTags.AsNoTracking()
                    join t in _db.Tags.AsNoTracking() on jt.TagId equals t.Id
                    where t.IsActive && selectedTags.Contains(t.Name.ToLower())
                    select jt.JobId
                )
                .Distinct();

            query = query.Where(x => taggedJobIds.Contains(x.Job.Id));
        }

        var totalItems = await query.CountAsync(ct);
        var totalPages = Math.Max(1, (int)Math.Ceiling(totalItems / (double)request.PageSize));
        var currentPage = Math.Min(Math.Max(1, request.Page), totalPages);
        var skip = (currentPage - 1) * request.PageSize;

        var pageRows = await query
            .OrderByDescending(x => x.Job.IsUrgent)
            .ThenByDescending(x => x.Job.CreatedAt)
            .Skip(skip)
            .Take(request.PageSize)
            .Select(x => new JobsListProjection(
                x.Job.Id,
                x.Job.Status,
                x.Job.IsUrgent,
                x.Job.NeedsPo,
                x.Job.CreatedAt,
                x.Job.Notes,
                x.Invoice != null ? x.Invoice.ExternalInvoiceId : null,
                paintServices
                    .Where(paint => paint.JobId == x.Job.Id)
                    .OrderByDescending(paint => paint.UpdatedAt)
                    .ThenByDescending(paint => paint.Id)
                    .Select(paint => paint.Status)
                    .FirstOrDefault(),
                paintServices
                    .Where(paint => paint.JobId == x.Job.Id)
                    .OrderByDescending(paint => paint.UpdatedAt)
                    .ThenByDescending(paint => paint.Id)
                    .Select(paint => (int?)paint.CurrentStage)
                    .FirstOrDefault(),
                paintServices
                    .Where(paint => paint.JobId == x.Job.Id)
                    .OrderByDescending(paint => paint.UpdatedAt)
                    .ThenByDescending(paint => paint.Id)
                    .Select(paint => (int?)paint.Panels)
                    .FirstOrDefault(),
                wofServiceJobIds.Any(wofJob => wofJob.JobId == x.Job.Id),
                wofRecords.Any(record => record.JobId == x.Job.Id),
                wofRecords
                    .Where(record => record.JobId == x.Job.Id)
                    .OrderByDescending(record => record.OccurredAt)
                    .ThenByDescending(record => record.Id)
                    .Select(record => (WofUiState?)record.WofUiState)
                    .FirstOrDefault(),
                x.WofState != null ? x.WofState.ManualStatus : null,
                x.Vehicle.Plate,
                x.Vehicle.Make,
                x.Vehicle.Model,
                x.Vehicle.Year,
                x.Customer.Name,
                x.Customer.BusinessCode,
                x.Customer.Phone
            ))
            .ToListAsync(ct);

        var pageJobIds = pageRows.Select(x => x.Id).ToArray();
        var tagRows = pageJobIds.Length == 0
            ? new List<JobTagListRow>()
            : await (
                    from jt in _db.JobTags.AsNoTracking()
                    join t in _db.Tags.AsNoTracking() on jt.TagId equals t.Id
                    where pageJobIds.Contains(jt.JobId) && t.IsActive
                    select new JobTagListRow(jt.JobId, t.Name)
                )
                .ToListAsync(ct);

        var tagMap = tagRows
            .GroupBy(x => x.JobId)
            .ToDictionary(
                group => group.Key,
                group => group.Select(x => x.Name).Distinct(StringComparer.OrdinalIgnoreCase).ToArray());

        var items = pageRows.Select(row =>
        {
            var tags = tagMap.TryGetValue(row.Id, out var values) ? values : Array.Empty<string>();
            var selectedTags = row.IsUrgent
                ? tags.Concat(new[] { "Urgent" }).Distinct(StringComparer.OrdinalIgnoreCase).ToArray()
                : tags;
            var hasWofServiceOrRecord = row.HasWofService || row.HasWofRecord;

            return new
            {
                id = row.Id.ToString(CultureInfo.InvariantCulture),
                vehicleStatus = MapStatus(row.Status),
                urgent = row.IsUrgent,
                needsPo = row.NeedsPo,
                selectedTags,
                plate = row.Plate,
                vehicleModel = BuildVehicleModel(row.Make, row.Model, row.Year),
                wofPct = (int?)null,
                mechPct = (int?)null,
                paintPct = (int?)null,
                paintStatus = row.PaintStatus,
                paintCurrentStage = row.PaintCurrentStage,
                customerName = row.CustomerName,
                customerCode = row.CustomerCode,
                customerPhone = row.CustomerPhone ?? "",
                wofStatus = MapWofStatus(hasWofServiceOrRecord, row.LatestWofManualStatus, row.LatestWofUiState),
                notes = row.Notes ?? "",
                externalInvoiceId = row.ExternalInvoiceId,
                createdAt = FormatDateTime(row.CreatedAt),
                panels = row.PaintPanels
            };
        });

        return JsonSerializer.Serialize(new
        {
            items,
            totalItems,
            totalPages,
            currentPage,
            pageSize = request.PageSize
        });
    }

    private async Task<string> GetJobsListVersionAsync(CancellationToken ct)
        => await _appCache.GetStringAsync(JobsListVersionCacheKey, ct) ?? "0";

    private Task TouchJobsListVersionAsync(CancellationToken ct)
        => _appCache.SetStringAsync(
            JobsListVersionCacheKey,
            DateTime.UtcNow.Ticks.ToString(CultureInfo.InvariantCulture),
            JobsListVersionCacheDuration,
            ct);

    private static string GetJobsListCacheKey(JobsListRequest request, string version)
    {
        var raw = string.Join("|", new[]
        {
            version,
            request.Page.ToString(CultureInfo.InvariantCulture),
            request.PageSize.ToString(CultureInfo.InvariantCulture),
            request.Search,
            request.JobType,
            request.WofStatus,
            request.PaintStatus,
            request.Customer,
            request.RangeStartUtc?.Ticks.ToString(CultureInfo.InvariantCulture) ?? "",
            request.RangeEndUtcExclusive?.Ticks.ToString(CultureInfo.InvariantCulture) ?? "",
            string.Join(",", request.SelectedTags)
        });

        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw)));
        return $"jobs:list:{hash}:v2";
    }

    private static JobsListRequest NormalizeJobsListQuery(JobsListQuery? query)
    {
        var page = query?.Page is > 0 ? query.Page!.Value : 1;
        var pageSize = query?.PageSize is > 0
            ? Math.Min(query.PageSize!.Value, MaxJobsPageSize)
            : 20;

        var selectedTags = (query?.Tags ?? "")
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var now = DateTime.Today;
        DateTime? startUtc = null;
        DateTime? endUtcExclusive = null;
        var range = query?.Range?.Trim();

        switch (range)
        {
            case "week":
            {
                var day = now.DayOfWeek == DayOfWeek.Sunday ? 7 : (int)now.DayOfWeek;
                var start = now.AddDays(1 - day).Date;
                startUtc = DateTime.SpecifyKind(start, DateTimeKind.Local).ToUniversalTime();
                endUtcExclusive = DateTime.SpecifyKind(start.AddDays(7), DateTimeKind.Local).ToUniversalTime();
                break;
            }
            case "lastWeek":
            {
                var day = now.DayOfWeek == DayOfWeek.Sunday ? 7 : (int)now.DayOfWeek;
                var thisWeekStart = now.AddDays(1 - day).Date;
                var lastWeekStart = thisWeekStart.AddDays(-7);
                startUtc = DateTime.SpecifyKind(lastWeekStart, DateTimeKind.Local).ToUniversalTime();
                endUtcExclusive = DateTime.SpecifyKind(thisWeekStart, DateTimeKind.Local).ToUniversalTime();
                break;
            }
            case "month":
            {
                var monthStart = new DateTime(now.Year, now.Month, 1);
                startUtc = DateTime.SpecifyKind(monthStart, DateTimeKind.Local).ToUniversalTime();
                endUtcExclusive = DateTime.SpecifyKind(monthStart.AddMonths(1), DateTimeKind.Local).ToUniversalTime();
                break;
            }
            case "custom":
            {
                var hasStart = DateOnly.TryParse(query?.Start, CultureInfo.InvariantCulture, DateTimeStyles.None, out var startDate);
                var hasEnd = DateOnly.TryParse(query?.End, CultureInfo.InvariantCulture, DateTimeStyles.None, out var endDate);

                if (hasStart || hasEnd)
                {
                    var effectiveStart = hasStart ? startDate : endDate;
                    var effectiveEnd = hasEnd ? endDate : startDate;
                    startUtc = DateTime.SpecifyKind(effectiveStart.ToDateTime(TimeOnly.MinValue), DateTimeKind.Local).ToUniversalTime();
                    endUtcExclusive = DateTime.SpecifyKind(effectiveEnd.AddDays(1).ToDateTime(TimeOnly.MinValue), DateTimeKind.Local).ToUniversalTime();
                }

                break;
            }
        }

        return new JobsListRequest(
            page,
            pageSize,
            query?.Q?.Trim() ?? "",
            query?.Status?.Trim() ?? "",
            query?.Wof?.Trim() ?? "",
            query?.Paint?.Trim() ?? "",
            query?.Customer?.Trim() ?? "",
            selectedTags,
            startUtc,
            endUtcExclusive
        );
    }

    public sealed record JobsListQuery(
        string? Q,
        string? Status,
        string? Wof,
        string? Paint,
        string? Range,
        string? Start,
        string? End,
        string? Customer,
        string? Tags,
        int? Page,
        int? PageSize);

    private sealed record JobsListRequest(
        int Page,
        int PageSize,
        string Search,
        string JobType,
        string WofStatus,
        string PaintStatus,
        string Customer,
        string[] SelectedTags,
        DateTime? RangeStartUtc,
        DateTime? RangeEndUtcExclusive);

    private sealed record JobsListProjection(
        long Id,
        string? Status,
        bool IsUrgent,
        bool NeedsPo,
        DateTime CreatedAt,
        string? Notes,
        string? ExternalInvoiceId,
        string? PaintStatus,
        int? PaintCurrentStage,
        int? PaintPanels,
        bool HasWofService,
        bool HasWofRecord,
        WofUiState? LatestWofUiState,
        string? LatestWofManualStatus,
        string? Plate,
        string? Make,
        string? Model,
        int? Year,
        string? CustomerName,
        string? CustomerCode,
        string? CustomerPhone);

    private sealed record JobTagListRow(long JobId, string Name);

    [HttpGet("tags")]
    public async Task<IActionResult> GetTags([FromQuery] string? ids, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(ids))
            return Ok(Array.Empty<object>());

        var jobIds = ids.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(id => long.TryParse(id, out var parsed) ? parsed : (long?)null)
            .Where(id => id.HasValue)
            .Select(id => id!.Value)
            .Distinct()
            .ToArray();

        if (jobIds.Length == 0)
            return Ok(Array.Empty<object>());

        var rows = await (
                from jt in _db.JobTags.AsNoTracking()
                join t in _db.Tags.AsNoTracking() on jt.TagId equals t.Id
                where jobIds.Contains(jt.JobId) && t.IsActive
                select new { jt.JobId, t.Name }
            )
            .ToListAsync(ct);

        var grouped = rows
            .GroupBy(x => x.JobId)
            .Select(g => new
            {
                jobId = g.Key.ToString(CultureInfo.InvariantCulture),
                tags = g.Select(x => x.Name).Distinct().ToArray()
            })
            .ToList();

        return Ok(grouped);
    }

    [HttpGet("{id:long}")]
    public async Task<IActionResult> GetById(long id, CancellationToken ct)
    {
        var payload = await _appCache.GetOrCreateJsonAsync(
            GetJobDetailCacheKey(id),
            JobDetailCacheDuration,
            token => BuildJobDetailResponseJsonAsync(id, token),
            ct
        );

        if (payload is null)
            return NotFound(new { error = "Job not found." });

        return Content(payload, "application/json");
    }

    private async Task<string?> BuildJobDetailResponseJsonAsync(long id, CancellationToken ct)
    {
        var row = await (
                from j in _db.Jobs.AsNoTracking()
                join v in _db.Vehicles.AsNoTracking() on j.VehicleId equals v.Id
                join c in _db.Customers.AsNoTracking() on j.CustomerId equals c.Id
                where j.Id == id
                select new
                {
                    Job = new
                    {
                        j.Id,
                        j.Status,
                        j.IsUrgent,
                        j.NeedsPo,
                        j.PoNumber,
                        j.InvoiceReference,
                        j.Notes,
                        j.CreatedAt,
                    },
                    Vehicle = new
                    {
                        v.Plate,
                        v.Make,
                        v.Model,
                        v.Year,
                        v.Vin,
                        v.Engine,
                        v.RegoExpiry,
                        v.Colour,
                        v.BodyStyle,
                        v.EngineNo,
                        v.Chassis,
                        v.CcRating,
                        v.FuelType,
                        v.Seats,
                        v.CountryOfOrigin,
                        v.GrossVehicleMass,
                        v.Refrigerant,
                        v.FuelTankCapacityLitres,
                        v.FullCombinedRangeKm,
                        v.WofExpiry,
                        v.Odometer,
                        v.NzFirstRegistration,
                        v.CustomerId,
                        v.UpdatedAt,
                    },
                    Customer = new
                    {
                        c.Id,
                        c.Type,
                        c.Name,
                        c.Phone,
                        c.Email,
                        c.Address,
                        c.BusinessCode,
                        c.Notes,
                    },
                    HasWofRecord = _db.JobWofRecords.AsNoTracking()
                        .Any(x => x.JobId == j.Id),
                    LatestWofUiState = _db.JobWofRecords.AsNoTracking()
                        .Where(x => x.JobId == j.Id)
                        .OrderByDescending(x => x.OccurredAt)
                        .ThenByDescending(x => x.Id)
                        .Select(x => (WofUiState?)x.WofUiState)
                        .FirstOrDefault(),
                    LatestWofManualStatus = _db.JobWofStates.AsNoTracking()
                        .Where(x => x.JobId == j.Id)
                        .OrderByDescending(x => x.UpdatedAt)
                        .ThenByDescending(x => x.Id)
                        .Select(x => x.ManualStatus)
                        .FirstOrDefault(),
                    HasWofService = (
                            from selection in _db.JobServiceSelections.AsNoTracking()
                            join catalogItem in _db.ServiceCatalogItems.AsNoTracking() on selection.ServiceCatalogItemId equals catalogItem.Id
                            where selection.JobId == j.Id && catalogItem.ServiceType == "wof"
                            select selection.Id
                        )
                        .Any(),
                    Invoice = _db.JobInvoices.AsNoTracking()
                        .Where(x => x.JobId == j.Id)
                        .Select(x => new
                        {
                            id = x.Id.ToString(CultureInfo.InvariantCulture),
                            jobId = x.JobId.ToString(CultureInfo.InvariantCulture),
                            provider = x.Provider,
                            externalInvoiceId = x.ExternalInvoiceId,
                            externalInvoiceNumber = x.ExternalInvoiceNumber,
                            externalStatus = x.ExternalStatus,
                            reference = x.Reference,
                            contactName = x.ContactName,
                            invoiceNote = x.InvoiceNote,
                            invoiceDate = x.InvoiceDate,
                            lineAmountTypes = x.LineAmountTypes,
                            tenantId = x.TenantId,
                            requestPayloadJson = x.RequestPayloadJson,
                            responsePayloadJson = x.ResponsePayloadJson,
                            createdAt = FormatDateTime(x.CreatedAt),
                            updatedAt = FormatDateTime(x.UpdatedAt),
                            latestPayment = _db.JobPayments.AsNoTracking()
                                .Where(p => p.JobInvoiceId == x.Id)
                                .OrderByDescending(p => p.CreatedAt)
                                .Select(p => new
                                {
                                    id = p.Id.ToString(CultureInfo.InvariantCulture),
                                    method = p.Method,
                                    amount = p.Amount,
                                    paymentDate = p.PaymentDate,
                                    reference = p.Reference,
                                    accountCode = p.AccountCode,
                                    accountName = p.AccountName,
                                    externalStatus = p.ExternalStatus,
                                    createdAt = FormatDateTime(p.CreatedAt),
                                    updatedAt = FormatDateTime(p.UpdatedAt),
                                })
                                .FirstOrDefault(),
                        })
                        .FirstOrDefault(),
                    InvoiceProcessing = _db.OutboxMessages.AsNoTracking()
                        .Where(x => x.AggregateType == InvoiceOutboxService.JobAggregateType
                            && x.AggregateId == j.Id
                            && (x.MessageType == InvoiceOutboxService.CreateDraftMessageType
                                || x.MessageType == InvoiceOutboxService.AttachExistingMessageType))
                        .OrderByDescending(x => x.CreatedAt)
                        .Select(x => new
                        {
                            id = x.Id.ToString(CultureInfo.InvariantCulture),
                            messageType = x.MessageType,
                            status = x.Status,
                            attemptCount = x.AttemptCount,
                            lastError = x.LastError,
                            availableAt = FormatDateTime(x.AvailableAt),
                            lockedAt = x.LockedAt.HasValue ? FormatDateTime(x.LockedAt.Value) : null,
                            createdAt = FormatDateTime(x.CreatedAt),
                            updatedAt = FormatDateTime(x.UpdatedAt),
                            processedAt = x.ProcessedAt.HasValue ? FormatDateTime(x.ProcessedAt.Value) : null,
                        })
                        .FirstOrDefault(),
                }
            )
            .FirstOrDefaultAsync(ct);

        if (row is null)
            return null;

        var tagNames = await (
                from jt in _db.JobTags.AsNoTracking()
                join t in _db.Tags.AsNoTracking() on jt.TagId equals t.Id
                where jt.JobId == id && t.IsActive
                select t.Name
            )
            .Distinct()
            .ToListAsync(ct);
        var effectiveInvoiceProcessing = row.Invoice is null ? row.InvoiceProcessing : null;
        var hasWofServiceOrRecord = row.HasWofService || row.HasWofRecord;

        var job = new
        {
            id = row.Job.Id.ToString(CultureInfo.InvariantCulture),
            status = MapDetailStatus(row.Job.Status),
            isUrgent = row.Job.IsUrgent,
            needsPo = row.Job.NeedsPo,
            poNumber = row.Job.PoNumber,
            invoiceReference = row.Job.InvoiceReference,
            tags = tagNames.ToArray(),
            notes = row.Job.Notes,
            createdAt = FormatDateTime(row.Job.CreatedAt),
            hasWofService = hasWofServiceOrRecord,
            wofStatus = MapWofStatus(hasWofServiceOrRecord, row.LatestWofManualStatus, row.LatestWofUiState),
            vehicle = new
            {
                plate = row.Vehicle.Plate,
                make = row.Vehicle.Make,
                model = row.Vehicle.Model,
                year = row.Vehicle.Year,
                vin = row.Vehicle.Vin,
                engine = row.Vehicle.Engine,
                regoExpiry = FormatDate(row.Vehicle.RegoExpiry),
                colour = row.Vehicle.Colour,
                bodyStyle = row.Vehicle.BodyStyle,
                engineNo = row.Vehicle.EngineNo,
                chassis = row.Vehicle.Chassis,
                ccRating = row.Vehicle.CcRating,
                fuelType = row.Vehicle.FuelType,
                seats = row.Vehicle.Seats,
                countryOfOrigin = row.Vehicle.CountryOfOrigin,
                grossVehicleMass = row.Vehicle.GrossVehicleMass,
                refrigerant = row.Vehicle.Refrigerant,
                fuelTankCapacityLitres = row.Vehicle.FuelTankCapacityLitres,
                fullCombinedRangeKm = row.Vehicle.FullCombinedRangeKm,
                wofExpiry = FormatDate(row.Vehicle.WofExpiry),
                odometer = row.Vehicle.Odometer,
                nzFirstRegistration = FormatDate(row.Vehicle.NzFirstRegistration),
                customerId = row.Vehicle.CustomerId,
                updatedAt = FormatDateTime(row.Vehicle.UpdatedAt),
                // rawJson = row.Vehicle.RawJson
            },
            customer = new
            {
                id = row.Customer.Id.ToString(CultureInfo.InvariantCulture),
                type = row.Customer.Type,
                name = row.Customer.Name,
                phone = row.Customer.Phone,
                email = row.Customer.Email,
                address = row.Customer.Address,
                businessCode = row.Customer.BusinessCode,
                accountTerms = "",
                discount = "",
                notes = row.Customer.Notes
            },
            invoice = row.Invoice,
            invoiceProcessing = effectiveInvoiceProcessing,
        };

        return JsonSerializer.Serialize(new { job, hasWofRecord = row.HasWofRecord });
    }

    [HttpGet("po-unread-summary")]
    public async Task<IActionResult> GetPoUnreadSummary(CancellationToken ct)
    {
        var payload = await _appCache.GetOrCreateJsonAsync(
            PoUnreadSummaryCacheKey,
            PoUnreadSummaryCacheDuration,
            BuildPoUnreadSummaryJsonAsync,
            ct
        );

        return Content(payload ?? JsonSerializer.Serialize(EmptyPoUnreadSummary), "application/json");
    }

    private async Task<string?> BuildPoUnreadSummaryJsonAsync(CancellationToken ct)
    {
        var inactiveCorrelations = await _db.InactiveGmailCorrelations.AsNoTracking()
            .Select(x => x.CorrelationId)
            .ToListAsync(ct);

        var unreadReplies = await _db.GmailMessageLogs.AsNoTracking()
            .Where(x => x.Direction == "reply" && !x.IsRead)
            .Where(x => !string.IsNullOrWhiteSpace(x.CorrelationId))
            .Select(x => new
            {
                x.CorrelationId,
                x.InternalDateMs,
            })
            .ToListAsync(ct);

        var grouped = unreadReplies
            .Where(x => !string.IsNullOrWhiteSpace(x.CorrelationId))
            .Where(x => !inactiveCorrelations.Contains(x.CorrelationId!))
            .Select(x => new
            {
                CorrelationId = x.CorrelationId!,
                JobId = TryExtractJobIdFromCorrelationId(x.CorrelationId),
                x.InternalDateMs,
            })
            .Where(x => x.JobId.HasValue)
            .GroupBy(x => new { x.JobId, x.CorrelationId })
            .Select(group => new
            {
                JobId = group.Key.JobId!.Value,
                group.Key.CorrelationId,
                UnreadReplyCount = group.Count(),
                LatestReplyMs = group.Max(x => x.InternalDateMs ?? 0),
            })
            .OrderByDescending(x => x.LatestReplyMs)
            .ToList();

        if (grouped.Count == 0)
            return JsonSerializer.Serialize(EmptyPoUnreadSummary);

        var jobIds = grouped.Select(x => x.JobId).Distinct().ToArray();
        var activeJobs = await _db.Jobs.AsNoTracking()
            .Where(x => jobIds.Contains(x.Id))
            .Where(x => x.NeedsPo)
            .Where(x => !EF.Functions.ILike(x.Status, "archived"))
            .Select(x => new { x.Id })
            .ToListAsync(ct);
        var activeJobIds = activeJobs.Select(x => x.Id).ToHashSet();

        var items = grouped
            .Where(x => activeJobIds.Contains(x.JobId))
            .Select(x => new PoUnreadSummaryItemResponse(
                x.JobId.ToString(CultureInfo.InvariantCulture),
                x.CorrelationId,
                x.UnreadReplyCount,
                NormalizeInternalDate(x.LatestReplyMs)))
            .ToList();

        var response = new PoUnreadSummaryResponse(
            items.Sum(x => x.UnreadReplyCount),
            items.Count,
            items);

        return JsonSerializer.Serialize(response);
    }

    public record CreatePaintServiceRequest(string? Status, int? Panels);
    public record UpdatePaintStageRequest(int? StageIndex);
    public record UpdatePaintPanelsRequest(int? Panels);

    [HttpGet("paint-board")]
    public async Task<IActionResult> GetPaintBoard(CancellationToken ct)
    {
        var payload = await _appCache.GetOrCreateJsonAsync(
            PaintBoardCacheKey,
            PaintBoardCacheDuration,
            BuildPaintBoardJsonAsync,
            ct
        );

        return Content(payload ?? "{\"jobs\":[]}", "application/json");
    }

    private async Task<string?> BuildPaintBoardJsonAsync(CancellationToken ct)
    {
        var rows = await (
                from p in _db.JobPaintServices.AsNoTracking()
                join j in _db.Jobs.AsNoTracking() on p.JobId equals j.Id
                join v in _db.Vehicles.AsNoTracking() on j.VehicleId equals v.Id
                where !EF.Functions.ILike(j.Status, "archived")
                orderby j.CreatedAt descending
                select new
                {
                    j.Id,
                    j.CreatedAt,
                    j.Notes,
                    HasWofService = (
                        from selection in _db.JobServiceSelections.AsNoTracking()
                        join catalogItem in _db.ServiceCatalogItems.AsNoTracking() on selection.ServiceCatalogItemId equals catalogItem.Id
                        where selection.JobId == j.Id && catalogItem.ServiceType == "wof"
                        select selection.Id
                    ).Any(),
                    HasWofRecord = _db.JobWofRecords.AsNoTracking()
                        .Where(x => x.JobId == j.Id)
                        .Select(x => x.Id)
                        .Any(),
                    LatestWofUiState = _db.JobWofRecords.AsNoTracking()
                        .Where(x => x.JobId == j.Id)
                        .OrderByDescending(x => x.OccurredAt)
                        .ThenByDescending(x => x.Id)
                        .Select(x => (WofUiState?)x.WofUiState)
                        .FirstOrDefault(),
                    LatestWofManualStatus = _db.JobWofStates.AsNoTracking()
                        .Where(x => x.JobId == j.Id)
                        .OrderByDescending(x => x.UpdatedAt)
                        .ThenByDescending(x => x.Id)
                        .Select(x => x.ManualStatus)
                        .FirstOrDefault(),
                    HasMechService = (
                        from selection in _db.JobServiceSelections.AsNoTracking()
                        join catalogItem in _db.ServiceCatalogItems.AsNoTracking() on selection.ServiceCatalogItemId equals catalogItem.Id
                        where selection.JobId == j.Id && catalogItem.ServiceType == "mech"
                        select selection.Id
                    ).Any() || _db.JobMechServices.AsNoTracking().Any(x => x.JobId == j.Id),
                    v.Plate,
                    v.Make,
                    v.Model,
                    v.Year,
                    p.Status,
                    p.CurrentStage,
                    p.Panels,
                    p.UpdatedAt
                }
            )
            .ToListAsync(ct);

        var jobs = rows.Select(r => new
        {
            id = r.Id.ToString(CultureInfo.InvariantCulture),
            createdAt = FormatDateTime(r.CreatedAt),
            plate = r.Plate,
            year = r.Year,
            make = r.Make,
            model = r.Model,
            status = r.Status,
            currentStage = r.CurrentStage,
            hasWofService = r.HasWofService || r.HasWofRecord,
            wofStatus = MapWofStatus(r.HasWofService || r.HasWofRecord, r.LatestWofManualStatus, r.LatestWofUiState),
            hasMechService = r.HasMechService,
            panels = r.Panels,
            notes = r.Notes ?? "",
            updatedAt = FormatDateTime(r.UpdatedAt)
        });

        return JsonSerializer.Serialize(new { jobs });
    }

    [HttpGet("wof-schedule")]
    public async Task<IActionResult> GetWofSchedule(CancellationToken ct)
    {
        var payload = await _appCache.GetOrCreateJsonAsync(
            WofScheduleCacheKey,
            WofScheduleCacheDuration,
            BuildWofScheduleJsonAsync,
            ct
        );

        return Content(payload ?? "{\"jobs\":[]}", "application/json");
    }

    [HttpPut("wof-schedule")]
    public async Task<IActionResult> SaveWofSchedule([FromBody] WofScheduleSaveRequest? request, CancellationToken ct)
    {
        if (request is null)
            return BadRequest(new { error = "Request body is required." });

        if (request.Entries is null)
            return BadRequest(new { error = "WOF schedule entries are required." });

        if (request.Entries.Length > 1000)
            return BadRequest(new { error = "WOF schedule can save at most 1000 entries at a time." });

        var normalized = new List<WofScheduleEntryWrite>();
        foreach (var entry in request.Entries)
        {
            var normalizedEntry = NormalizeWofScheduleEntry(entry);
            if (normalizedEntry.Error is not null)
                return BadRequest(new { error = normalizedEntry.Error });
            if (normalizedEntry.Entry is not null)
                normalized.Add(normalizedEntry.Entry);
        }

        var jobIds = normalized
            .Where(x => x.Kind == "job" && x.JobId.HasValue)
            .Select(x => x.JobId!.Value)
            .Distinct()
            .ToArray();

        if (jobIds.Length > 0)
        {
            var existingJobIds = await _db.Jobs.AsNoTracking()
                .Where(x => jobIds.Contains(x.Id))
                .Select(x => x.Id)
                .ToArrayAsync(ct);
            var missingJobId = jobIds.Except(existingJobIds).FirstOrDefault();
            if (missingJobId > 0)
                return BadRequest(new { error = $"Job '{missingJobId}' was not found." });
        }

        var now = DateTime.UtcNow;
        var existingEntries = await _db.JobWofScheduleEntries.ToListAsync(ct);
        var existingByJobId = existingEntries
            .Where(x => x.EntryType == "job" && x.JobId.HasValue)
            .ToDictionary(x => x.JobId!.Value);
        var existingByPlaceholderKey = existingEntries
            .Where(x => x.EntryType == "placeholder" && !string.IsNullOrWhiteSpace(x.PlaceholderKey))
            .ToDictionary(x => x.PlaceholderKey!, StringComparer.Ordinal);

        var incomingJobIds = normalized
            .Where(x => x.Kind == "job" && x.JobId.HasValue)
            .Select(x => x.JobId!.Value)
            .ToHashSet();
        var incomingPlaceholderKeys = normalized
            .Where(x => x.Kind == "placeholder" && !string.IsNullOrWhiteSpace(x.PlaceholderId))
            .Select(x => x.PlaceholderId!)
            .ToHashSet(StringComparer.Ordinal);

        foreach (var existing in existingEntries)
        {
            if (existing.EntryType == "job" && existing.JobId.HasValue && !incomingJobIds.Contains(existing.JobId.Value))
            {
                _db.JobWofScheduleEntries.Remove(existing);
                continue;
            }

            if (existing.EntryType == "placeholder"
                && !string.IsNullOrWhiteSpace(existing.PlaceholderKey)
                && !incomingPlaceholderKeys.Contains(existing.PlaceholderKey!))
            {
                _db.JobWofScheduleEntries.Remove(existing);
            }
        }

        foreach (var entry in normalized)
        {
            JobWofScheduleEntry target;
            if (entry.Kind == "job")
            {
                if (!entry.JobId.HasValue)
                    continue;

                if (!existingByJobId.TryGetValue(entry.JobId.Value, out target!))
                {
                    target = new JobWofScheduleEntry
                    {
                        EntryType = "job",
                        JobId = entry.JobId.Value,
                        CreatedAt = now,
                    };
                    _db.JobWofScheduleEntries.Add(target);
                }

                target.PlaceholderKey = null;
                target.Rego = null;
                target.Contact = null;
                target.Notes = null;
            }
            else
            {
                if (string.IsNullOrWhiteSpace(entry.PlaceholderId))
                    continue;

                if (!existingByPlaceholderKey.TryGetValue(entry.PlaceholderId, out target!))
                {
                    target = new JobWofScheduleEntry
                    {
                        EntryType = "placeholder",
                        PlaceholderKey = entry.PlaceholderId,
                        CreatedAt = entry.CreatedAt ?? now,
                    };
                    _db.JobWofScheduleEntries.Add(target);
                }

                target.JobId = null;
                target.Rego = entry.Rego;
                target.Contact = entry.Contact;
                target.Notes = entry.Notes;
            }

            target.ScheduledDate = entry.ScheduledDate;
            target.ScheduledHour = entry.ScheduledHour;
            target.UpdatedAt = now;
        }

        await _db.SaveChangesAsync(ct);
        await InvalidateWofScheduleCacheAsync(ct);

        return Ok(new { saved = normalized.Count });
    }

    private async Task<string?> BuildWofScheduleJsonAsync(CancellationToken ct)
    {
        var rows = await (
                from state in _db.JobWofStates.AsNoTracking()
                join j in _db.Jobs.AsNoTracking() on state.JobId equals j.Id
                join v in _db.Vehicles.AsNoTracking() on j.VehicleId equals v.Id
                where !EF.Functions.ILike(j.Status, "archived")
                where state.ManualStatus == null || !EF.Functions.ILike(state.ManualStatus, "Recorded")
                orderby j.CreatedAt descending
                select new
                {
                    j.Id,
                    j.CreatedAt,
                    j.Status,
                    v.Plate,
                    v.Make,
                    v.Model,
                    v.Year,
                    v.Vin,
                    v.WofExpiry,
                    state.ManualStatus,
                }
            )
            .ToListAsync(ct);

        var scheduleEntries = await _db.JobWofScheduleEntries.AsNoTracking()
            .OrderBy(x => x.ScheduledDate)
            .ThenBy(x => x.ScheduledHour)
            .ThenBy(x => x.Id)
            .ToListAsync(ct);

        var jobs = rows
            .Select(row => new
            {
                jobId = row.Id.ToString(CultureInfo.InvariantCulture),
                plate = row.Plate,
                make = row.Make ?? "",
                model = row.Model ?? "",
                year = row.Year,
                vin = row.Vin ?? "",
                wofExpiry = FormatDate(row.WofExpiry),
                inShopDateTime = FormatDateTime(row.CreatedAt),
                status = MapDetailStatus(row.Status),
                wofStatus = string.Equals(row.ManualStatus, "Checked", StringComparison.OrdinalIgnoreCase)
                    ? "Checked"
                    : "Todo",
            });

        var entries = scheduleEntries.Select(entry => new
        {
            id = entry.Id.ToString(CultureInfo.InvariantCulture),
            kind = entry.EntryType,
            jobId = entry.JobId?.ToString(CultureInfo.InvariantCulture),
            placeholderId = entry.PlaceholderKey,
            scheduledDate = entry.ScheduledDate?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            scheduledHour = entry.ScheduledHour,
            rego = entry.Rego ?? "",
            contact = entry.Contact ?? "",
            notes = entry.Notes ?? "",
            createdAt = FormatDateTime(entry.CreatedAt),
            updatedAt = FormatDateTime(entry.UpdatedAt),
        });

        return JsonSerializer.Serialize(new { jobs, scheduleEntries = entries });
    }

    private static (WofScheduleEntryWrite? Entry, string? Error) NormalizeWofScheduleEntry(WofScheduleEntryRequest entry)
    {
        var kind = entry.Kind?.Trim().ToLowerInvariant();
        if (kind is not ("job" or "placeholder"))
            return (null, "WOF schedule entry kind must be job or placeholder.");

        DateOnly? scheduledDate = null;
        int? scheduledHour = null;
        var hasDate = !string.IsNullOrWhiteSpace(entry.ScheduledDate);
        var hasHour = entry.ScheduledHour.HasValue;
        if (hasDate != hasHour)
            return (null, "Scheduled date and scheduled hour must be provided together.");

        if (hasDate)
        {
            if (!DateOnly.TryParseExact(
                    entry.ScheduledDate,
                    "yyyy-MM-dd",
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.None,
                    out var parsedDate))
            {
                return (null, "Scheduled date must use yyyy-MM-dd format.");
            }

            if (entry.ScheduledHour is < 0 or > 23)
                return (null, "Scheduled hour must be between 0 and 23.");

            scheduledDate = parsedDate;
            scheduledHour = entry.ScheduledHour;
        }

        DateTime? createdAt = null;
        if (!string.IsNullOrWhiteSpace(entry.CreatedAt)
            && DateTime.TryParse(
                entry.CreatedAt,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                out var parsedCreatedAt))
        {
            createdAt = parsedCreatedAt;
        }

        if (kind == "job")
        {
            if (string.IsNullOrWhiteSpace(entry.JobId)
                || !long.TryParse(entry.JobId, NumberStyles.None, CultureInfo.InvariantCulture, out var jobId)
                || jobId <= 0)
            {
                return (null, "Job schedule entry requires a valid job id.");
            }

            if (!scheduledDate.HasValue || !scheduledHour.HasValue)
                return (null, "Job schedule entry requires a scheduled date and hour.");

            return (new WofScheduleEntryWrite(
                "job",
                jobId,
                PlaceholderId: null,
                scheduledDate,
                scheduledHour,
                Rego: null,
                Contact: null,
                Notes: null,
                CreatedAt: null), null);
        }

        var placeholderId = TrimMax(entry.PlaceholderId, 120);
        if (string.IsNullOrWhiteSpace(placeholderId))
            return (null, "Placeholder schedule entry requires a placeholder id.");

        return (new WofScheduleEntryWrite(
            "placeholder",
            JobId: null,
            placeholderId,
            scheduledDate,
            scheduledHour,
            TrimMax(entry.Rego, 120),
            TrimMax(entry.Contact, 240),
            TrimMax(entry.Notes, 2000),
            createdAt), null);
    }

    private static string? TrimMax(string? value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;

        var trimmed = value.Trim();
        return trimmed.Length <= maxLength ? trimmed : trimmed[..maxLength];
    }

    public sealed record WofScheduleSaveRequest(WofScheduleEntryRequest[] Entries);

    public sealed record WofScheduleEntryRequest(
        string? Kind,
        string? JobId,
        string? PlaceholderId,
        string? ScheduledDate,
        int? ScheduledHour,
        string? Rego,
        string? Contact,
        string? Notes,
        string? CreatedAt);

    private sealed record WofScheduleEntryWrite(
        string Kind,
        long? JobId,
        string? PlaceholderId,
        DateOnly? ScheduledDate,
        int? ScheduledHour,
        string? Rego,
        string? Contact,
        string? Notes,
        DateTime? CreatedAt);

    [HttpGet("{id:long}/paint-service")]
    public async Task<IActionResult> GetPaintService(long id, CancellationToken ct)
    {
        var payload = await _appCache.GetOrCreateJsonAsync(
            GetPaintServiceCacheKey(id),
            PaintServiceCacheDuration,
            token => BuildPaintServiceResponseJsonAsync(id, token),
            ct
        );

        return Content(payload ?? "{\"exists\":false}", "application/json");
    }

    private async Task<string?> BuildPaintServiceResponseJsonAsync(long id, CancellationToken ct)
    {
        var service = await _db.JobPaintServices.AsNoTracking().FirstOrDefaultAsync(x => x.JobId == id, ct);
        if (service is null)
        {
            return JsonSerializer.Serialize(new { exists = false });
        }

        return JsonSerializer.Serialize(new
        {
            exists = true,
            service = new
            {
                id = service.Id,
                jobId = service.JobId,
                status = service.Status,
                currentStage = service.CurrentStage,
                panels = service.Panels,
                createdAt = FormatDateTime(service.CreatedAt),
                updatedAt = FormatDateTime(service.UpdatedAt),
            }
        });
    }

    [HttpPost("{id:long}/paint-service")]
    public async Task<IActionResult> CreatePaintService(long id, [FromBody] CreatePaintServiceRequest? req, CancellationToken ct)
    {
        var job = await _db.Jobs.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (job is null)
            return NotFound(new { error = "Job not found." });

        var existing = await _db.JobPaintServices.FirstOrDefaultAsync(x => x.JobId == id, ct);
        if (existing is not null)
        {
            var nextStatus = string.IsNullOrWhiteSpace(req?.Status) ? existing.Status : req!.Status!.Trim();
            var nextPanels = req?.Panels is > 0 ? req!.Panels!.Value : existing.Panels;
            var changed = false;

            if (!string.Equals(existing.Status, nextStatus, StringComparison.Ordinal))
            {
                existing.Status = nextStatus;
                if (string.Equals(nextStatus, "on_hold", StringComparison.Ordinal))
                {
                    existing.CurrentStage = -2;
                }
                else if (string.Equals(nextStatus, "not_started", StringComparison.Ordinal))
                {
                    existing.CurrentStage = -1;
                }
                changed = true;
            }

            if (existing.Panels != nextPanels)
            {
                existing.Panels = nextPanels;
                changed = true;
            }

            if (changed)
            {
                existing.UpdatedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync(ct);
                await InvalidateJobDetailCachesAsync(id, ct);
                await InvalidatePaintBoardCacheAsync(ct);
            }

            return Ok(new
            {
                id = existing.Id,
                jobId = existing.JobId,
                status = existing.Status,
                currentStage = existing.CurrentStage,
                panels = existing.Panels
            });
        }

        var status = string.IsNullOrWhiteSpace(req?.Status) ? "pending" : req!.Status!.Trim();
        var panels = req?.Panels is > 0 ? req!.Panels!.Value : 1;
        var normalized = string.Equals(status, "on_hold", StringComparison.Ordinal)
            ? ("on_hold", -2)
            : string.Equals(status, "not_started", StringComparison.Ordinal)
                ? ("not_started", -1)
                : string.Equals(status, "delivered", StringComparison.Ordinal)
                    ? ("delivered", 6)
                    : string.Equals(status, "done", StringComparison.Ordinal)
                        ? ("done", 5)
                        : ("pending", -1);

        var service = new JobPaintService
        {
            JobId = id,
            Status = normalized.Item1,
            CurrentStage = normalized.Item2,
            Panels = panels,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _db.JobPaintServices.Add(service);
        await _db.SaveChangesAsync(ct);
        await InvalidateJobDetailCachesAsync(id, ct);
        await InvalidatePaintBoardCacheAsync(ct);

        return Ok(new
        {
            id = service.Id,
            jobId = service.JobId,
            status = service.Status,
            currentStage = service.CurrentStage,
            panels = service.Panels
        });
    }

    [HttpPut("{id:long}/paint-service/stage")]
    public async Task<IActionResult> UpdatePaintStage(long id, [FromBody] UpdatePaintStageRequest req, CancellationToken ct)
    {
        if (req?.StageIndex is null)
            return BadRequest(new { error = "StageIndex is required." });

        var service = await _db.JobPaintServices.FirstOrDefaultAsync(x => x.JobId == id, ct);
        if (service is null)
            return NotFound(new { error = "Paint service not found." });

        var stageIndex = req.StageIndex.Value;
        var normalized = NormalizePaintStage(stageIndex);
        service.Status = normalized.Status;
        service.CurrentStage = normalized.CurrentStage;
        service.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        await InvalidateJobDetailCachesAsync(id, ct);
        await InvalidatePaintBoardCacheAsync(ct);

        return Ok(new { success = true, status = service.Status, currentStage = service.CurrentStage });
    }

    [HttpPut("{id:long}/paint-service/panels")]
    public async Task<IActionResult> UpdatePaintPanels(long id, [FromBody] UpdatePaintPanelsRequest req, CancellationToken ct)
    {
        if (req?.Panels is null || req.Panels.Value <= 0)
            return BadRequest(new { error = "Panels is required." });

        var service = await _db.JobPaintServices.FirstOrDefaultAsync(x => x.JobId == id, ct);
        if (service is null)
            return NotFound(new { error = "Paint service not found." });

        service.Panels = req.Panels.Value;
        service.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        await InvalidateJobDetailCachesAsync(id, ct);
        await InvalidatePaintBoardCacheAsync(ct);

        return Ok(new { success = true, panels = service.Panels });
    }

    [HttpDelete("{id:long}/paint-service")]
    public async Task<IActionResult> DeletePaintService(long id, CancellationToken ct)
    {
        var deleted = await _db.JobPaintServices.Where(x => x.JobId == id).ExecuteDeleteAsync(ct);
        if (deleted == 0)
            return NotFound(new { error = "Paint service not found." });
        await InvalidateJobDetailCachesAsync(id, ct);
        await InvalidatePaintBoardCacheAsync(ct);

        return Ok(new { success = true });
    }

    private static (string Status, int CurrentStage) NormalizePaintStage(int stageIndex)
    {
        if (stageIndex <= -2)
            return ("on_hold", -2);
        if (stageIndex == -1)
            return ("not_started", -1);
        if (stageIndex >= 6)
            return ("delivered", 6);
        if (stageIndex == 5)
            return ("done", 5);
        return ("in_progress", stageIndex);
    }

    public record UpdateVehicleRequest(int? Year, string? Make, string? FuelType, string? Vin, string? NzFirstRegistration);

    [HttpPut("{id:long}/vehicle")]
    public async Task<IActionResult> UpdateVehicle(long id, [FromBody] UpdateVehicleRequest req, CancellationToken ct)
    {
        var job = await _db.Jobs.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (job is null)
            return NotFound(new { error = "Job not found." });

        if (!job.VehicleId.HasValue)
            return NotFound(new { error = "Vehicle not found." });

        var vehicle = await _db.Vehicles.FirstOrDefaultAsync(x => x.Id == job.VehicleId.Value, ct);
        if (vehicle is null)
            return NotFound(new { error = "Vehicle not found." });

        DateOnly? nzFirstRegistration = null;
        if (!string.IsNullOrWhiteSpace(req.NzFirstRegistration))
        {
            if (!DateOnly.TryParse(req.NzFirstRegistration, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed) &&
                !DateOnly.TryParse(req.NzFirstRegistration, CultureInfo.CurrentCulture, DateTimeStyles.None, out parsed))
                return BadRequest(new { error = "Invalid NzFirstRegistration." });
            nzFirstRegistration = parsed;
        }

        vehicle.Year = req.Year;
        vehicle.Make = string.IsNullOrWhiteSpace(req.Make) ? null : req.Make.Trim();
        vehicle.FuelType = string.IsNullOrWhiteSpace(req.FuelType) ? null : req.FuelType.Trim();
        vehicle.Vin = string.IsNullOrWhiteSpace(req.Vin) ? null : req.Vin.Trim();
        vehicle.NzFirstRegistration = nzFirstRegistration;
        vehicle.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);
        await InvalidateJobDetailCachesAsync(id, ct);
        await InvalidatePaintBoardCacheAsync(ct);
        await InvalidateWofScheduleCacheAsync(ct);

        return Ok(new
        {
            success = true,
            vehicle = new
            {
                plate = vehicle.Plate,
                make = vehicle.Make,
                model = vehicle.Model,
                year = vehicle.Year,
                vin = vehicle.Vin,
                fuelType = vehicle.FuelType,
                nzFirstRegistration = FormatDate(vehicle.NzFirstRegistration),
                updatedAt = FormatDateTime(vehicle.UpdatedAt),
            }
        });
    }

    public record UpdateJobNotesRequest(string? Notes);
    public record UpdateJobPoSelectionRequest(string? PoNumber, string? InvoiceReference);

    [HttpPut("{id:long}/notes")]
    public async Task<IActionResult> UpdateNotes(long id, [FromBody] UpdateJobNotesRequest req, CancellationToken ct)
    {
        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (job is null)
            return NotFound(new { error = "Job not found." });

        job.Notes = req.Notes?.Trim();
        job.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        await InvalidateJobDetailCachesAsync(id, ct);
        await InvalidatePaintBoardCacheAsync(ct);

        return Ok(new { success = true, notes = job.Notes });
    }

    [HttpPut("{id:long}/po-selection")]
    public async Task<IActionResult> UpdatePoSelection(long id, [FromBody] UpdateJobPoSelectionRequest req, CancellationToken ct)
    {
        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (job is null)
            return NotFound(new { error = "Job not found." });

        var hasPaidInvoice = await _db.JobInvoices.AsNoTracking()
            .AnyAsync(x => x.JobId == id && x.ExternalStatus != null && x.ExternalStatus.ToUpper() == "PAID", ct);
        if (hasPaidInvoice)
            return BadRequest(new { error = "PO Request data is locked because the invoice is already marked as Paid in Xero." });

        job.PoNumber = string.IsNullOrWhiteSpace(req?.PoNumber) ? null : req.PoNumber.Trim();
        job.InvoiceReference = string.IsNullOrWhiteSpace(req?.InvoiceReference) ? null : req.InvoiceReference.Trim();
        job.UpdatedAt = DateTime.UtcNow;

        var correlationId = BuildCorrelationId(job.Id);
        if (!string.IsNullOrWhiteSpace(job.PoNumber))
        {
            var existingInactive = await _db.InactiveGmailCorrelations
                .FirstOrDefaultAsync(x => x.CorrelationId == correlationId, ct);
            if (existingInactive is null)
            {
                _db.InactiveGmailCorrelations.Add(new InactiveGmailCorrelation
                {
                    CorrelationId = correlationId,
                    Reason = $"PO confirmed for job {job.Id}",
                    CreatedAt = DateTime.UtcNow,
                });
            }
        }
        else
        {
            await _db.InactiveGmailCorrelations
                .Where(x => x.CorrelationId == correlationId)
                .ExecuteDeleteAsync(ct);
        }

        await _db.SaveChangesAsync(ct);
        await _jobPoStateService.SyncStateForJobAsync(id, ct);
        await InvalidateJobDetailCachesAsync(id, ct);
        await InvalidatePoUnreadSummaryCacheAsync(ct);

        return Ok(new
        {
            success = true,
            poNumber = job.PoNumber,
            invoiceReference = job.InvoiceReference,
        });
    }

    [HttpDelete("{id:long}")]
    public async Task<IActionResult> DeleteJob(long id, CancellationToken ct)
    {
        var job = await _db.Jobs.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (job is null)
            return NotFound(new { error = "Job not found." });

        var xeroDeleteResult = await _jobInvoiceService.DeleteDraftInXeroAsync(id, ct);
        if (!xeroDeleteResult.Ok)
        {
            return StatusCode(xeroDeleteResult.StatusCode, new
            {
                error = xeroDeleteResult.Error,
                payload = xeroDeleteResult.Payload,
                steps = new
                {
                    xero = new
                    {
                        status = "failed",
                        message = xeroDeleteResult.Error ?? "删除 Xero draft 失败。",
                    },
                    gmail = new
                    {
                        status = "pending",
                        message = "等待删除 Gmail 信息。",
                    },
                    jobStep = new
                    {
                        status = "pending",
                        message = "等待删除本地 Job。",
                    },
                },
            });
        }

        // DeleteDraftInXeroAsync updates a tracked JobInvoice row before this action bulk-deletes it.
        // Clear tracked entities so the later SaveChanges only persists the new inactive correlation record.
        _db.ChangeTracker.Clear();
        var xeroStepMessage = xeroDeleteResult.DeletedInXero
            ? "Xero draft 已删除。"
            : xeroDeleteResult.Message ?? "没有需要删除的 Xero draft。";

        try
        {
            await using var tx = await _db.Database.BeginTransactionAsync(ct);
            var correlationId = BuildCorrelationId(job.Id);

            var partServiceIds = await _db.JobPartsServices.AsNoTracking()
                .Where(x => x.JobId == id)
                .Select(x => x.Id)
                .ToListAsync(ct);
            if (partServiceIds.Count > 0)
            {
                await _db.JobPartsNotes
                    .Where(x => partServiceIds.Contains(x.PartsServiceId))
                    .ExecuteDeleteAsync(ct);
            }
            await _db.JobPartsServices.Where(x => x.JobId == id).ExecuteDeleteAsync(ct);
            await _db.JobMechServices.Where(x => x.JobId == id).ExecuteDeleteAsync(ct);
            await _db.JobPaintServices.Where(x => x.JobId == id).ExecuteDeleteAsync(ct);
            await _db.JobTags.Where(x => x.JobId == id).ExecuteDeleteAsync(ct);
            await _db.JobWofRecords.Where(x => x.JobId == id).ExecuteDeleteAsync(ct);
            await _db.JobPoStates.Where(x => x.JobId == id).ExecuteDeleteAsync(ct);
            await _db.JobInvoices.Where(x => x.JobId == id).ExecuteDeleteAsync(ct);
            var deletedGmailLogs = await _db.GmailMessageLogs.Where(x => x.CorrelationId == correlationId).ExecuteDeleteAsync(ct);

            var existingInactive = await _db.InactiveGmailCorrelations
                .FirstOrDefaultAsync(x => x.CorrelationId == correlationId, ct);
            if (existingInactive is null)
            {
                _db.InactiveGmailCorrelations.Add(new InactiveGmailCorrelation
                {
                    CorrelationId = correlationId,
                    Reason = $"Job {id} deleted",
                    CreatedAt = DateTime.UtcNow,
                });
                await _db.SaveChangesAsync(ct);
            }

            var deletedJobs = await _db.Jobs.Where(x => x.Id == id).ExecuteDeleteAsync(ct);
            if (deletedJobs == 0)
            {
                return NotFound(new
                {
                    error = "Job not found.",
                    steps = new
                    {
                        xero = new
                        {
                            status = "success",
                            message = xeroStepMessage,
                        },
                        gmail = new
                        {
                            status = "failed",
                            message = "删除 Gmail 信息失败，本地 Job 未删除。",
                        },
                        jobStep = new
                        {
                            status = "failed",
                            message = "删除本地 Job 失败，记录不存在。",
                        },
                    },
                });
            }

            var vehicleDeleted = false;

            if (job.VehicleId.HasValue)
            {
                var otherJobs = await _db.Jobs.AsNoTracking()
                    .AnyAsync(x => x.VehicleId == job.VehicleId.Value, ct);
                if (!otherJobs)
                {
                    var deletedVehicles = await _db.Vehicles
                        .Where(x => x.Id == job.VehicleId.Value)
                        .ExecuteDeleteAsync(ct);
                    vehicleDeleted = deletedVehicles > 0;
                }
            }

            await tx.CommitAsync(ct);
            await InvalidateJobDetailCachesAsync(id, ct);
            await InvalidatePaintBoardCacheAsync(ct);
            await InvalidateWofScheduleCacheAsync(ct);
            await InvalidatePoUnreadSummaryCacheAsync(ct);

            return Ok(new
            {
                success = true,
                vehicleDeleted,
                customerDeleted = false,
                correlationDeactivated = correlationId,
                gmailLogsDeleted = deletedGmailLogs,
                xeroDraftInvoiceDeleted = xeroDeleteResult.DeletedInXero,
                steps = new
                {
                    xero = new
                    {
                        status = "success",
                        message = xeroStepMessage,
                    },
                    gmail = new
                    {
                        status = "success",
                        message = deletedGmailLogs > 0
                            ? $"已删除 {deletedGmailLogs} 条 Gmail 信息，并停用 {correlationId} 同步。"
                            : $"没有找到 Gmail 信息，已停用 {correlationId} 同步。",
                    },
                    jobStep = new
                    {
                        status = "success",
                        message = "Job 及相关数据已删除。",
                    },
                },
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new
            {
                error = $"删除 Job 失败：{ex.Message}",
                steps = new
                {
                    xero = new
                    {
                        status = "success",
                        message = xeroStepMessage,
                    },
                    gmail = new
                    {
                        status = "failed",
                        message = "删除 Gmail 信息失败，本地删除事务已回滚。",
                    },
                    jobStep = new
                    {
                        status = "failed",
                        message = "删除本地 Job 及相关数据失败。",
                    },
                },
            });
        }
    }

    private static string BuildCorrelationId(long jobId)
    {
        const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        var seed = jobId.ToString(CultureInfo.InvariantCulture);
        uint hash = 0;
        foreach (var ch in seed)
            hash = (hash * 31) + ch;

        var suffixChars = new char[4];
        var value = hash == 0 ? 1u : hash;
        for (var index = 0; index < suffixChars.Length; index++)
        {
            suffixChars[index] = alphabet[(int)(value % (uint)alphabet.Length)];
            value = value / (uint)alphabet.Length;
            if (value == 0)
                value = hash + (uint)index + 7;
        }

        return $"PO-{jobId.ToString(CultureInfo.InvariantCulture)}-{new string(suffixChars)}";
    }

    private static long? TryExtractJobIdFromCorrelationId(string? correlationId)
    {
        if (string.IsNullOrWhiteSpace(correlationId))
            return null;

        var parts = correlationId.Split('-', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length < 3 || !string.Equals(parts[0], "PO", StringComparison.OrdinalIgnoreCase))
            return null;

        return long.TryParse(parts[1], NumberStyles.None, CultureInfo.InvariantCulture, out var jobId)
            ? jobId
            : null;
    }

    private static string NormalizeInternalDate(long? value)
    {
        if (!value.HasValue || value.Value <= 0)
            return "";

        try
        {
            return DateTimeHelper.FormatNz(DateTimeOffset.FromUnixTimeMilliseconds(value.Value).UtcDateTime);
        }
        catch
        {
            return "";
        }
    }

    private sealed record PoUnreadSummaryResponse(
        int TotalUnreadReplies,
        int AffectedJobs,
        IReadOnlyList<PoUnreadSummaryItemResponse> Items);

    private sealed record PoUnreadSummaryItemResponse(
        string JobId,
        string CorrelationId,
        int UnreadReplyCount,
        string LatestReplyAt);

    public record UpdateJobTagsRequest(long[]? TagIds, string[]? TagNames);

    public record UpdateJobStatusRequest(string? Status);
    public record UpdateJobCreatedAtRequest(string? Date);

    [HttpPut("{id:long}/tags")]
    public async Task<IActionResult> UpdateJobTags(long id, [FromBody] UpdateJobTagsRequest req, CancellationToken ct)
    {
        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (job is null)
            return NotFound(new { error = "Job not found." });

        var tagIds = req?.TagIds?.Distinct().ToArray() ?? Array.Empty<long>();
        var tagNames = req?.TagNames?
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Select(name => name.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray() ?? Array.Empty<string>();

        var tagNamesLower = tagNames.Select(name => name.ToLowerInvariant()).ToArray();

        if (tagNames.Length > 0)
        {
            var existingByName = await _db.Tags.AsNoTracking()
                .Where(x => tagNamesLower.Contains(x.Name.ToLower()))
                .Select(x => x.Name)
                .ToListAsync(ct);
            var existingSet = new HashSet<string>(
                existingByName.Select(name => name.ToLowerInvariant()),
                StringComparer.OrdinalIgnoreCase
            );
            var missingNames = tagNames.Where(name => !existingSet.Contains(name.ToLowerInvariant())).ToArray();
            if (missingNames.Length > 0)
            {
                var now = DateTime.UtcNow;
                var newTags = missingNames.Select(name => new Tag
                {
                    Name = name,
                    IsActive = true,
                    CreatedAt = now,
                    UpdatedAt = now
                });
                _db.Tags.AddRange(newTags);
                await _db.SaveChangesAsync(ct);
            }
        }

        if (tagIds.Length > 0)
        {
            var existingIds = await _db.Tags.AsNoTracking()
                .Where(x => tagIds.Contains(x.Id))
                .Select(x => x.Id)
                .ToListAsync(ct);
            if (existingIds.Count != tagIds.Length)
                return BadRequest(new { error = "One or more tags are invalid." });
        }

        var nameTagIds = Array.Empty<long>();
        if (tagNames.Length > 0)
        {
            nameTagIds = await _db.Tags.AsNoTracking()
                .Where(x => tagNamesLower.Contains(x.Name.ToLower()))
                .Select(x => x.Id)
                .ToArrayAsync(ct);
        }

        var finalTagIds = tagIds.Concat(nameTagIds).Distinct().ToArray();

        await _db.JobTags.Where(x => x.JobId == id).ExecuteDeleteAsync(ct);

        if (finalTagIds.Length > 0)
        {
            var items = finalTagIds.Select(tagId => new JobTag
            {
                JobId = id,
                TagId = tagId,
                CreatedAt = DateTime.UtcNow
            });
            _db.JobTags.AddRange(items);
        }

        var tagNameList = await _db.Tags.AsNoTracking()
            .Where(x => finalTagIds.Contains(x.Id))
            .Select(x => x.Name)
            .ToArrayAsync(ct);

        job.IsUrgent = tagNameList.Any(name => string.Equals(name, "Urgent", StringComparison.OrdinalIgnoreCase));
        job.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);
        await InvalidateJobDetailCachesAsync(id, ct);

        return Ok(new { tags = tagNameList });
    }

    [HttpPut("{id:long}/status")]
    public async Task<IActionResult> UpdateStatus(long id, [FromBody] UpdateJobStatusRequest req, CancellationToken ct)
    {
        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (job is null)
            return NotFound(new { error = "Job not found." });

        var status = req?.Status?.Trim();
        if (string.IsNullOrWhiteSpace(status))
            return BadRequest(new { error = "Status is required." });

        if (!string.Equals(status, "Archived", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { error = "Status must be Archived." });

        job.Status = "Archived";
        job.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        await InvalidateJobDetailCachesAsync(id, ct);
        await InvalidatePaintBoardCacheAsync(ct);
        await InvalidateWofScheduleCacheAsync(ct);
        await InvalidatePoUnreadSummaryCacheAsync(ct);

        return Ok(new { status = job.Status });
    }

    [HttpPut("{id:long}/created-at")]
    public async Task<IActionResult> UpdateCreatedAt(long id, [FromBody] UpdateJobCreatedAtRequest req, CancellationToken ct)
    {
        var job = await _db.Jobs.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (job is null)
            return NotFound(new { error = "Job not found." });

        var dateInput = req?.Date?.Trim();
        if (string.IsNullOrWhiteSpace(dateInput))
            return BadRequest(new { error = "Date is required." });

        if (!DateTime.TryParseExact(dateInput, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
            return BadRequest(new { error = "Date must be yyyy-MM-dd." });

        var time = job.CreatedAt.TimeOfDay;
        var kind = job.CreatedAt.Kind == DateTimeKind.Unspecified ? DateTimeKind.Utc : job.CreatedAt.Kind;
        job.CreatedAt = DateTime.SpecifyKind(date.Date + time, kind);
        job.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        await InvalidateJobDetailCachesAsync(id, ct);
        await InvalidatePaintBoardCacheAsync(ct);
        await InvalidateWofScheduleCacheAsync(ct);

        return Ok(new
        {
            createdAt = FormatDateTime(job.CreatedAt)
        });
    }

    private async Task InvalidateJobDetailCachesAsync(long jobId, CancellationToken ct)
    {
        await _appCache.RemoveAsync(GetJobDetailCacheKey(jobId), ct);
        await _appCache.RemoveAsync(GetPaintServiceCacheKey(jobId), ct);
        await TouchJobsListVersionAsync(ct);
    }

    private Task InvalidatePaintBoardCacheAsync(CancellationToken ct)
        => _appCache.RemoveAsync(PaintBoardCacheKey, ct);

    private Task InvalidateWofScheduleCacheAsync(CancellationToken ct)
        => _appCache.RemoveAsync(WofScheduleCacheKey, ct);

    private Task InvalidatePoUnreadSummaryCacheAsync(CancellationToken ct)
        => _appCache.RemoveAsync(PoUnreadSummaryCacheKey, ct);

    private static string GetJobDetailCacheKey(long jobId)
        => $"job:detail:{jobId}:v1";

    private static string GetPaintServiceCacheKey(long jobId)
        => $"job:paint-service:{jobId}:v1";

    private static string MapStatus(string? status)
    {
        var value = status?.Trim() ?? "";
        if (value.Equals("InProgress", StringComparison.OrdinalIgnoreCase))
            return "In Progress";
        if (value.Equals("Delivered", StringComparison.OrdinalIgnoreCase))
            return "Ready";
        if (value.Equals("Completed", StringComparison.OrdinalIgnoreCase))
            return "Completed";
        if (value.Equals("Archived", StringComparison.OrdinalIgnoreCase))
            return "Archived";
        if (value.Equals("Cancelled", StringComparison.OrdinalIgnoreCase))
            return "Cancelled";
        if (value.Equals("In Progress", StringComparison.OrdinalIgnoreCase))
            return "In Progress";
        return value;
    }

    private static string MapDetailStatus(string? status)
    {
        var value = status?.Trim() ?? "";
        if (value.Equals("InProgress", StringComparison.OrdinalIgnoreCase))
            return "In Shop";
        if (value.Equals("Delivered", StringComparison.OrdinalIgnoreCase))
            return "Ready";
        if (value.Equals("Completed", StringComparison.OrdinalIgnoreCase))
            return "Completed";
        if (value.Equals("Archived", StringComparison.OrdinalIgnoreCase))
            return "Archived";
        if (value.Equals("Cancelled", StringComparison.OrdinalIgnoreCase))
            return "Cancelled";
        if (value.Equals("In Shop", StringComparison.OrdinalIgnoreCase))
            return "In Shop";
        return value;
    }

    private static string? MapWofStatus(bool hasWofService, string? wofManualStatus, WofUiState? latestWofUiState)
    {
        if (latestWofUiState.HasValue)
            return "Recorded";

        if (!hasWofService)
            return null;

        if (string.Equals(wofManualStatus, "Recorded", StringComparison.OrdinalIgnoreCase))
            return "Recorded";

        return string.Equals(wofManualStatus, "Checked", StringComparison.OrdinalIgnoreCase)
            ? "Checked"
            : "Todo";
    }

    private static string BuildVehicleModel(string? make, string? model, int? year)
    {
        var parts = new List<string>(3);
        if (!string.IsNullOrWhiteSpace(make))
            parts.Add(make.Trim());
        if (!string.IsNullOrWhiteSpace(model))
            parts.Add(model.Trim());
        if (year.HasValue)
            parts.Add(year.Value.ToString(CultureInfo.InvariantCulture));

        return parts.Count > 0 ? string.Join(" ", parts) : "Unknown";
    }

    private static string FormatDate(DateOnly? date)
        => date.HasValue ? date.Value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) : "";

    private static string FormatDateTime(DateTime dateTime)
        => DateTimeHelper.FormatUtc(dateTime);
}
