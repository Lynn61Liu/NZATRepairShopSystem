using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Features.JobLightBindings.Models;
using Workshop.Api.Models;
using Workshop.Api.Utils;

namespace Workshop.Api.Services;

public sealed class MechWorkflowService
{
    public const string NewestFirst = "newest_first";
    public const string OldestFirst = "oldest_first";
    private const string BoardSortSettingKey = "mech-board:sort-order";
    private readonly AppDbContext _db;
    private readonly WofQueryService _wofQueryService;
    private readonly JobLifecycleService? _jobLifecycleService;
    private readonly IAppCache? _cache;

    public MechWorkflowService(
        AppDbContext db,
        WofQueryService wofQueryService,
        IAppCache? cache = null,
        JobLifecycleService? jobLifecycleService = null)
    {
        _db = db;
        _wofQueryService = wofQueryService;
        _cache = cache;
        _jobLifecycleService = jobLifecycleService;
    }

    public async Task<WofServiceResult> GetBoardAsync(CancellationToken ct)
    {
        var sortOrder = await GetBoardSortOrderAsync(ct);
        var eligibility = await GetEligibilityAsync(ct);
        await EnsureAndReconcileAsync(eligibility.AllJobIds, ct);
        await ReconcileCompletedWofOnlyJobsAsync(eligibility, ct);

        var jobIds = eligibility.AllJobIds.ToArray();
        var rows = await (
            from job in _db.Jobs.AsNoTracking()
            join vehicle in _db.Vehicles.AsNoTracking() on job.VehicleId equals vehicle.Id into vehicles
            from vehicle in vehicles.DefaultIfEmpty()
            join customer in _db.Customers.AsNoTracking() on job.CustomerId equals customer.Id into customers
            from customer in customers.DefaultIfEmpty()
            join workflow in _db.JobMechWorkflows.AsNoTracking() on job.Id equals workflow.JobId
            where jobIds.Contains(job.Id)
                && !EF.Functions.ILike(job.Status ?? "", "archived")
                && (job.IsOnYardOverride == true
                    || (job.IsOnYardOverride == null
                        && !_db.JobMechWorkflows.AsNoTracking()
                            .Any(candidate => candidate.JobId == job.Id && candidate.Status == MechWorkflowStatus.Delivered)
                        && !_db.JobPaintServices.AsNoTracking()
                            .Any(paint => paint.JobId == job.Id && paint.Status == "delivered")))
            select new { Job = job, Vehicle = vehicle, Customer = customer, Workflow = workflow }
        ).ToListAsync(ct);

        rows = sortOrder == OldestFirst
            ? rows.OrderBy(x => x.Job.CreatedAt).ThenBy(x => x.Job.Id).ToList()
            : rows.OrderByDescending(x => x.Job.CreatedAt).ThenByDescending(x => x.Job.Id).ToList();

        var activeIds = rows.Select(x => x.Job.Id).ToArray();
        var mechServices = await _db.JobMechServices.AsNoTracking()
            .Where(x => activeIds.Contains(x.JobId))
            .OrderBy(x => x.CreatedAt)
            .ToListAsync(ct);
        var parts = await _db.JobPartsServices.AsNoTracking()
            .Where(x => activeIds.Contains(x.JobId))
            .ToListAsync(ct);
        var bindings = await _db.JobLightBindings.AsNoTracking()
            .Where(x => x.JobId.HasValue && activeIds.Contains(x.JobId.Value) && x.Status == LightBindingStatus.Bound)
            .OrderByDescending(x => x.UpdatedAt)
            .ToListAsync(ct);
        var wofSnapshots = await _wofQueryService.QuerySnapshots()
            .Where(x => activeIds.Contains(x.JobId))
            .ToListAsync(ct);

        var mechByJob = mechServices.GroupBy(x => x.JobId).ToDictionary(x => x.Key, x => x.Select(s => s.Description).ToArray());
        var partsByJob = parts.GroupBy(x => x.JobId).ToDictionary(x => x.Key, x => x.ToArray());
        var bindingByJob = bindings.GroupBy(x => x.JobId!.Value).ToDictionary(x => x.Key, x => x.First());
        var wofByJob = wofSnapshots.ToDictionary(x => x.JobId);

        var payload = rows.Select(row =>
        {
            partsByJob.TryGetValue(row.Job.Id, out var jobParts);
            jobParts ??= Array.Empty<JobPartsService>();
            bindingByJob.TryGetValue(row.Job.Id, out var binding);
            wofByJob.TryGetValue(row.Job.Id, out var wof);
            mechByJob.TryGetValue(row.Job.Id, out var descriptions);

            return new
            {
                id = row.Job.Id.ToString(CultureInfo.InvariantCulture),
                createdAt = DateTimeHelper.FormatUtc(row.Job.CreatedAt),
                plate = row.Vehicle?.Plate ?? "",
                customerCode = ResolveCustomerCode(row.Customer),
                year = row.Vehicle?.Year,
                make = row.Vehicle?.Make ?? "",
                model = row.Vehicle?.Model ?? "",
                urgent = row.Job.IsUrgent,
                status = row.Workflow.Status,
                partsArrivedAt = row.Workflow.PartsArrivedAt.HasValue ? DateTimeHelper.FormatUtc(row.Workflow.PartsArrivedAt.Value) : null,
                hasWofService = eligibility.WofJobIds.Contains(row.Job.Id),
                hasMechService = eligibility.MechJobIds.Contains(row.Job.Id),
                wofStatus = wof?.DerivedStatus,
                workItems = descriptions ?? Array.Empty<string>(),
                notes = row.Job.Notes ?? "",
                parts = new
                {
                    total = jobParts.Length,
                    completed = jobParts.Count(x => x.CompletedAt.HasValue),
                    allArrived = jobParts.Length > 0 && jobParts.All(x => x.CompletedAt.HasValue),
                    descriptions = jobParts.Select(x => x.Description).ToArray(),
                },
                lightBindingId = binding?.Id,
                updatedAt = DateTimeHelper.FormatUtc(row.Workflow.UpdatedAt),
            };
        }).ToList();

        return WofServiceResult.Ok(new { jobs = payload, settings = new { sortOrder } });
    }

    public async Task<WofServiceResult> GetBoardSettingsAsync(CancellationToken ct)
    {
        var sortOrder = await GetBoardSortOrderAsync(ct);
        return WofServiceResult.Ok(new { sortOrder });
    }

    public async Task<WofServiceResult> UpdateBoardSettingsAsync(string? requestedSortOrder, CancellationToken ct)
    {
        var sortOrder = requestedSortOrder?.Trim().ToLowerInvariant();
        if (sortOrder is not NewestFirst and not OldestFirst)
            return WofServiceResult.BadRequest("Sort order must be newest_first or oldest_first.");

        var state = await _db.SystemSyncStates.FirstOrDefaultAsync(x => x.SyncKey == BoardSortSettingKey, ct);
        var now = DateTime.UtcNow;
        if (state is null)
        {
            state = new SystemSyncState
            {
                SyncKey = BoardSortSettingKey,
                CreatedAt = now,
            };
            _db.SystemSyncStates.Add(state);
        }
        state.LastResult = sortOrder;
        state.LastSyncedAt = now;
        state.LastError = null;
        state.UpdatedAt = now;
        await _db.SaveChangesAsync(ct);

        return WofServiceResult.Ok(new { sortOrder });
    }

    public async Task<WofServiceResult> GetWorkflowAsync(long jobId, CancellationToken ct)
    {
        var eligibility = await GetEligibilityAsync(jobId, ct);
        if (!eligibility.AllJobIds.Contains(jobId))
            return WofServiceResult.NotFound("This job has no WOF or MECH work.");

        await EnsureAndReconcileAsync([jobId], ct);
        await ReconcileCompletedWofOnlyJobsAsync(eligibility, ct);
        var workflow = await _db.JobMechWorkflows.AsNoTracking().FirstAsync(x => x.JobId == jobId, ct);
        return WofServiceResult.Ok(ToWorkflowPayload(workflow, eligibility));
    }

    public async Task<WofServiceResult> UpdateWorkflowAsync(
        long jobId,
        string? requestedStatus,
        CancellationToken ct,
        bool direct = false)
    {
        var status = requestedStatus?.Trim().ToLowerInvariant();
        if (status is null || !MechWorkflowStatus.All.Contains(status, StringComparer.Ordinal))
            return WofServiceResult.BadRequest("Invalid MECH workflow status.");

        var eligibility = await GetEligibilityAsync(jobId, ct);
        if (!eligibility.AllJobIds.Contains(jobId))
            return WofServiceResult.NotFound("This job has no WOF or MECH work.");

        await EnsureAndReconcileAsync([jobId], ct);
        var workflow = await _db.JobMechWorkflows.FirstAsync(x => x.JobId == jobId, ct);

        if (!direct && status == MechWorkflowStatus.RepairCompleted)
        {
            if (workflow.Status == MechWorkflowStatus.WofQueue || !eligibility.MechJobIds.Contains(jobId))
            {
                await MarkWofCheckedAsync(jobId, ct);
            }
            else if (eligibility.WofJobIds.Contains(jobId) && eligibility.MechJobIds.Contains(jobId))
            {
                status = MechWorkflowStatus.WofQueue;
            }
        }

        workflow.Status = status;
        workflow.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        if (_jobLifecycleService is not null)
            await _jobLifecycleService.EvaluateAsync(jobId, ct);
        await InvalidateRelatedCachesAsync(jobId, ct);

        return WofServiceResult.Ok(ToWorkflowPayload(workflow, eligibility));
    }

    public async Task SyncFromPartsAsync(long jobId, CancellationToken ct)
    {
        var eligibility = await GetEligibilityAsync(jobId, ct);
        if (!eligibility.AllJobIds.Contains(jobId)) return;
        await EnsureAndReconcileAsync([jobId], ct);
    }

    public async Task EnsureForJobsAsync(IEnumerable<long> jobIds, CancellationToken ct)
    {
        var requestedIds = jobIds.Where(x => x > 0).Distinct().ToHashSet();
        if (requestedIds.Count == 0) return;

        var eligibility = await GetEligibilityAsync(ct);
        var selectedEligibility = new MechEligibility(
            eligibility.WofJobIds.Where(requestedIds.Contains).ToHashSet(),
            eligibility.MechJobIds.Where(requestedIds.Contains).ToHashSet());
        if (selectedEligibility.AllJobIds.Count == 0) return;

        await EnsureAndReconcileAsync(selectedEligibility.AllJobIds, ct);
        await ReconcileCompletedWofOnlyJobsAsync(selectedEligibility, ct);
    }

    private async Task<string> GetBoardSortOrderAsync(CancellationToken ct)
    {
        var value = await _db.SystemSyncStates.AsNoTracking()
            .Where(x => x.SyncKey == BoardSortSettingKey)
            .Select(x => x.LastResult)
            .FirstOrDefaultAsync(ct);
        return value == OldestFirst ? OldestFirst : NewestFirst;
    }

    private static string ResolveCustomerCode(Customer? customer)
    {
        if (customer is null) return "";
        if (string.Equals(customer.Type, "Personal", StringComparison.OrdinalIgnoreCase)) return "WI";
        return customer.BusinessCode?.Trim() ?? "";
    }

    private async Task EnsureAndReconcileAsync(IEnumerable<long> jobIds, CancellationToken ct)
    {
        var ids = jobIds.Distinct().ToArray();
        if (ids.Length == 0) return;

        var workflows = await _db.JobMechWorkflows.Where(x => ids.Contains(x.JobId)).ToListAsync(ct);
        var workflowByJob = workflows.ToDictionary(x => x.JobId);
        var parts = await _db.JobPartsServices.Where(x => ids.Contains(x.JobId)).ToListAsync(ct);
        var partsByJob = parts.GroupBy(x => x.JobId).ToDictionary(x => x.Key, x => x.ToArray());
        var now = DateTime.UtcNow;
        var changed = false;

        foreach (var jobId in ids)
        {
            partsByJob.TryGetValue(jobId, out var jobParts);
            jobParts ??= Array.Empty<JobPartsService>();
            var initialStatus = DerivePartsStatus(jobParts);

            if (!workflowByJob.TryGetValue(jobId, out var workflow))
            {
                workflow = new JobMechWorkflow
                {
                    JobId = jobId,
                    Status = initialStatus,
                    PartsArrivedAt = GetPartsArrivedAt(jobParts),
                    CreatedAt = now,
                    UpdatedAt = now,
                };
                _db.JobMechWorkflows.Add(workflow);
                workflowByJob[jobId] = workflow;
                changed = true;
                continue;
            }

            if (workflow.Status is MechWorkflowStatus.WaitingParts or MechWorkflowStatus.PartsTransit or MechWorkflowStatus.WaitingRepair)
            {
                var next = DerivePartsStatus(jobParts);
                var arrivedAt = GetPartsArrivedAt(jobParts);
                if (workflow.Status != next || workflow.PartsArrivedAt != arrivedAt)
                {
                    workflow.Status = next;
                    workflow.PartsArrivedAt = arrivedAt;
                    workflow.UpdatedAt = now;
                    changed = true;
                }
            }
        }

        if (changed) await _db.SaveChangesAsync(ct);
    }

    private static string DerivePartsStatus(IReadOnlyCollection<JobPartsService> parts)
    {
        var incomplete = parts.Where(x => !x.CompletedAt.HasValue).ToArray();
        if (incomplete.Length == 0) return MechWorkflowStatus.WaitingRepair;
        return incomplete.Any(x => x.Status == PartsServiceStatus.PickupOrTransit)
            ? MechWorkflowStatus.PartsTransit
            : MechWorkflowStatus.WaitingParts;
    }

    private static DateTime? GetPartsArrivedAt(IReadOnlyCollection<JobPartsService> parts) =>
        parts.Count > 0 && parts.All(x => x.CompletedAt.HasValue)
            ? parts.Max(x => x.CompletedAt)
            : null;

    private async Task MarkWofCheckedAsync(long jobId, CancellationToken ct)
    {
        var state = await _db.JobWofStates.FirstOrDefaultAsync(x => x.JobId == jobId, ct);
        if (state is null)
        {
            state = new JobWofState { JobId = jobId, CreatedAt = DateTime.UtcNow };
            _db.JobWofStates.Add(state);
        }
        state.ManualStatus = "Checked";
        state.UpdatedAt = DateTime.UtcNow;
    }

    private async Task ReconcileCompletedWofOnlyJobsAsync(MechEligibility eligibility, CancellationToken ct)
    {
        var wofOnlyIds = eligibility.WofJobIds.Except(eligibility.MechJobIds).ToArray();
        if (wofOnlyIds.Length == 0) return;

        var completedIds = await _wofQueryService.QuerySnapshots()
            .Where(x => wofOnlyIds.Contains(x.JobId))
            .Where(x => x.HasWofRecord || x.ManualStatus == "Checked")
            .Select(x => x.JobId)
            .ToArrayAsync(ct);
        if (completedIds.Length == 0) return;

        var workflows = await _db.JobMechWorkflows
            .Where(x => completedIds.Contains(x.JobId) && x.Status == MechWorkflowStatus.WaitingRepair)
            .ToListAsync(ct);
        if (workflows.Count == 0) return;

        var now = DateTime.UtcNow;
        foreach (var workflow in workflows)
        {
            workflow.Status = MechWorkflowStatus.RepairCompleted;
            workflow.UpdatedAt = now;
        }
        await _db.SaveChangesAsync(ct);
    }

    private async Task InvalidateRelatedCachesAsync(long jobId, CancellationToken ct)
    {
        if (_cache is null) return;
        await _cache.RemoveAsync($"job:detail:{jobId}:v1", ct);
        await _cache.RemoveAsync("jobs:paint-board:v1", ct);
        await _cache.RemoveAsync("jobs:wof-schedule:v1", ct);
        await _cache.SetStringAsync(
            "jobs:list:version:v1",
            DateTime.UtcNow.Ticks.ToString(CultureInfo.InvariantCulture),
            TimeSpan.FromDays(1),
            ct);
    }

    private async Task<MechEligibility> GetEligibilityAsync(CancellationToken ct)
    {
        var wofIds = await (
            from selection in _db.JobServiceSelections.AsNoTracking()
            join item in _db.ServiceCatalogItems.AsNoTracking() on selection.ServiceCatalogItemId equals item.Id
            where item.ServiceType == "wof"
            select selection.JobId
        ).Distinct().ToListAsync(ct);
        var selectedMechIds = await (
            from selection in _db.JobServiceSelections.AsNoTracking()
            join item in _db.ServiceCatalogItems.AsNoTracking() on selection.ServiceCatalogItemId equals item.Id
            where item.ServiceType == "mech"
            select selection.JobId
        ).Distinct().ToListAsync(ct);
        var legacyMechIds = await _db.JobMechServices.AsNoTracking().Select(x => x.JobId).Distinct().ToListAsync(ct);
        var candidateIds = wofIds.Concat(selectedMechIds).Concat(legacyMechIds).Distinct().ToArray();
        var existingJobIds = await _db.Jobs.AsNoTracking()
            .Where(x => candidateIds.Contains(x.Id)
                && !EF.Functions.ILike(x.Status ?? "", "archived"))
            .Select(x => x.Id)
            .ToListAsync(ct);
        var existing = existingJobIds.ToHashSet();
        return new MechEligibility(
            wofIds.Where(existing.Contains).ToHashSet(),
            selectedMechIds.Concat(legacyMechIds).Where(existing.Contains).ToHashSet());
    }

    private async Task<MechEligibility> GetEligibilityAsync(long jobId, CancellationToken ct)
    {
        var all = await GetEligibilityAsync(ct);
        return new MechEligibility(
            all.WofJobIds.Contains(jobId) ? [jobId] : [],
            all.MechJobIds.Contains(jobId) ? [jobId] : []);
    }

    private static object ToWorkflowPayload(JobMechWorkflow workflow, MechEligibility eligibility) => new
    {
        jobId = workflow.JobId.ToString(CultureInfo.InvariantCulture),
        status = workflow.Status,
        partsArrivedAt = workflow.PartsArrivedAt.HasValue ? DateTimeHelper.FormatUtc(workflow.PartsArrivedAt.Value) : null,
        hasWofService = eligibility.WofJobIds.Contains(workflow.JobId),
        hasMechService = eligibility.MechJobIds.Contains(workflow.JobId),
        updatedAt = DateTimeHelper.FormatUtc(workflow.UpdatedAt),
    };

    private sealed record MechEligibility(HashSet<long> WofJobIds, HashSet<long> MechJobIds)
    {
        public HashSet<long> AllJobIds => WofJobIds.Concat(MechJobIds).ToHashSet();
    }
}
