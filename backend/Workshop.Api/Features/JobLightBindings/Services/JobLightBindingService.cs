using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Workshop.Api.Data;
using Workshop.Api.Features.EStationMonitoring.DTOs;
using Workshop.Api.Features.EStationMonitoring.Services;
using Workshop.Api.Features.JobLightBindings.DTOs;
using Workshop.Api.Features.JobLightBindings.Models;

namespace Workshop.Api.Features.JobLightBindings.Services;

public sealed class JobLightBindingService
{
    private static readonly TimeSpan BindTimeout = TimeSpan.FromSeconds(30);

    private readonly AppDbContext _db;
    private readonly IEStationMqttCommandPublisher _publisher;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<JobLightBindingService> _logger;

    public JobLightBindingService(
        AppDbContext db,
        IEStationMqttCommandPublisher publisher,
        TimeProvider timeProvider,
        ILogger<JobLightBindingService> logger)
    {
        _db = db;
        _publisher = publisher;
        _timeProvider = timeProvider;
        _logger = logger;
    }

    public async Task<JobLightBindingOperationResult> CreateBindingAsync(long jobId, string rawTagId, CancellationToken ct)
        => await CreateBindingAsync(jobId, rawTagId, false, ct);

    public async Task<JobLightBindingOperationResult> CreateBindingAsync(long jobId, string rawTagId, bool overrideExisting, CancellationToken ct)
    {
        var tagId = Normalize(rawTagId);
        if (string.IsNullOrWhiteSpace(tagId))
            return Failure("灯条码不能为空");
        if (tagId.Length > 32)
            return Failure("灯条码不能超过 32 个字符");
        if (!overrideExisting && !EStationIdentifierValidator.IsValidTagId(tagId))
            return Failure("灯条码格式不正确");

        var job = await _db.Jobs
            .Include(x => x.Vehicle)
            .FirstOrDefaultAsync(x => x.Id == jobId, ct);
        if (job is null)
            return Failure("Job 不存在");

        var plate = Normalize(job.Vehicle?.Plate ?? string.Empty);
        if (string.IsNullOrWhiteSpace(plate))
            return Failure("Job 没有车牌号");

        await OverrideActiveTargetBindingsAsync(jobId, plate, $"Job {plate}", ct);
        await OverrideActiveTagBindingsAsync(tagId, $"Job {plate}", ct);

        return await CreatePendingBindingAsync(jobId, plate, tagId, ct);
    }

    public async Task<JobLightBindingOperationResult> CreateManualBindingAsync(string rawObjectName, string rawTagId, CancellationToken ct)
    {
        var objectName = NormalizeDisplayName(rawObjectName);
        if (string.IsNullOrWhiteSpace(objectName))
            return Failure("物体名称不能为空");
        if (objectName.Length > 128)
            return Failure("物体名称不能超过 128 个字符");

        var tagId = Normalize(rawTagId);
        if (string.IsNullOrWhiteSpace(tagId))
            return Failure("灯条码不能为空");
        if (tagId.Length > 32)
            return Failure("灯条码不能超过 32 个字符");

        await OverrideActiveTargetBindingsAsync(null, objectName, objectName, ct);
        await OverrideActiveTagBindingsAsync(tagId, objectName, ct);

        return await CreatePendingBindingAsync(null, objectName, tagId, ct);
    }

    private async Task<JobLightBindingOperationResult> CreatePendingBindingAsync(
        long? jobId,
        string plate,
        string tagId,
        CancellationToken ct)
    {
        var station = await _db.LightStations
            .Where(x => x.IsOnline)
            .OrderByDescending(x => x.LastHeartbeatAt)
            .FirstOrDefaultAsync(ct);
        if (station is null)
            return Failure("没有在线基站");

        var groupNo = await AllocateGroupNoAsync(station.StationId, ct);
        if (groupNo is null)
            return Failure("没有可用 Group");

        var now = UtcNow();
        var binding = new JobLightBinding
        {
            JobId = jobId,
            Plate = plate,
            StationId = station.StationId,
            TagId = tagId,
            GroupNo = groupNo.Value,
            Status = LightBindingStatus.PendingBind,
            CreatedAt = now,
            UpdatedAt = now,
        };

        _db.JobLightBindings.Add(binding);
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Queued light binding for job {JobId} plate {Plate} station {StationId} tag {TagId} group {GroupNo}.",
            jobId,
            plate,
            binding.StationId,
            binding.TagId,
            binding.GroupNo);

        try
        {
            await _publisher.PublishBindAsync(binding.StationId, binding.GroupNo, [binding.TagId], ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex,
                "Failed to publish bind command for job {JobId} plate {Plate} station {StationId} tag {TagId} group {GroupNo}.",
                jobId,
                plate,
                binding.StationId,
                binding.TagId,
                binding.GroupNo);
            binding.Status = LightBindingStatus.BindFailed;
            binding.FailureReason = $"MQTT 发布失败: {ex.Message}";
            binding.UpdatedAt = UtcNow();
            await _db.SaveChangesAsync(ct);
            return Failure(binding.FailureReason, ToResponse(binding));
        }

        return new JobLightBindingOperationResult(true, ToResponse(binding), null);
    }

    public async Task HandleResultAsync(string stationId, TaskResultDto dto, DateTime receivedAt, CancellationToken ct)
    {
        var normalizedStationId = Normalize(stationId);
        var now = EnsureUtc(receivedAt);

        foreach (var item in dto.Results)
        {
            var tagId = Normalize(item.TagID);
            if (string.IsNullOrWhiteSpace(tagId) || tagId.Length > 32)
            {
                _logger.LogWarning(
                    "Ignored binding result from station {StationId} because tag id '{TagId}' is invalid.",
                    normalizedStationId,
                    item.TagID);
                continue;
            }

            var binding = await _db.JobLightBindings
                .Where(x =>
                    x.StationId == normalizedStationId &&
                    x.TagId == tagId &&
                    x.Status == LightBindingStatus.PendingBind)
                .OrderByDescending(x => x.CreatedAt)
                .FirstOrDefaultAsync(ct);

            if (binding is null || item.Group != binding.GroupNo)
            {
                if (binding is null)
                {
                    _logger.LogWarning(
                        "No pending binding matched station {StationId}, tag {TagId}, group {GroupNo}.",
                        normalizedStationId,
                        tagId,
                        item.Group);
                }
                else
                {
                    _logger.LogWarning(
                        "Binding result group mismatch for binding {BindingId}: expected group {ExpectedGroup}, got {ActualGroup}.",
                        binding.Id,
                        binding.GroupNo,
                        item.Group);
                }

                continue;
            }

            binding.Status = LightBindingStatus.Bound;
            binding.FailureReason = null;
            binding.LastResultAt = now;
            binding.UpdatedAt = now;

            _logger.LogInformation(
                "Confirmed light binding {BindingId} for job {JobId} plate {Plate} station {StationId} tag {TagId} group {GroupNo}.",
                binding.Id,
                binding.JobId,
                binding.Plate,
                binding.StationId,
                binding.TagId,
                binding.GroupNo);
        }

        await _db.SaveChangesAsync(ct);
    }

    public async Task<List<JobLightBindingResponse>> GetJobBindingsAsync(long jobId, CancellationToken ct)
    {
        await MarkTimedOutBindingsAsync(ct);

        var rows = await _db.JobLightBindings
            .AsNoTracking()
            .Where(x => x.JobId == jobId)
            .OrderByDescending(x => x.CreatedAt)
            .ToListAsync(ct);

        return rows.Select(ToResponse).ToList();
    }

    public async Task<List<DeviceLightBindingResponse>> GetDeviceBindingsAsync(CancellationToken ct)
    {
        await MarkTimedOutBindingsAsync(ct);

        var rows = await (
                from binding in _db.JobLightBindings.AsNoTracking()
                join tag in _db.LightTags.AsNoTracking()
                    on binding.TagId equals tag.TagId into tagRows
                from tag in tagRows.DefaultIfEmpty()
                join job in _db.Jobs.AsNoTracking()
                    on binding.JobId equals job.Id into jobRows
                from job in jobRows.DefaultIfEmpty()
                join vehicle in _db.Vehicles.AsNoTracking()
                    on job.VehicleId equals vehicle.Id into vehicleRows
                from vehicle in vehicleRows.DefaultIfEmpty()
                orderby binding.UpdatedAt descending, binding.Id descending
                select new
                {
                    binding.Id,
                    binding.JobId,
                    binding.Plate,
                    VehicleYear = vehicle == null ? null : vehicle.Year,
                    VehicleMake = vehicle == null ? null : vehicle.Make,
                    VehicleModel = vehicle == null ? null : vehicle.Model,
                    VehicleColour = vehicle == null ? null : vehicle.Colour,
                    binding.StationId,
                    binding.TagId,
                    binding.GroupNo,
                    binding.Status,
                    BatteryPercent = tag == null ? null : tag.BatteryPercent,
                    CurrentColor = tag == null ? null : tag.CurrentColor,
                    IsLightOn = tag != null && tag.IsLightOn,
                    LastSeenAt = tag == null ? null : tag.LastSeenAt,
                    binding.LastResultAt,
                    binding.FailureReason,
                })
            .ToListAsync(ct);

        return rows
            .Select(row => new DeviceLightBindingResponse(
                row.Id,
                row.JobId,
                row.Plate,
                FormatVehicleModel(row.VehicleYear, row.VehicleMake, row.VehicleModel),
                row.VehicleColour,
                row.StationId,
                row.TagId,
                row.GroupNo,
                row.Status,
                row.BatteryPercent,
                row.CurrentColor,
                row.IsLightOn,
                row.LastSeenAt,
                row.LastResultAt,
                row.FailureReason))
            .ToList();
    }

    public async Task<JobLightBindingOperationResult> LightOnAsync(long bindingId, CancellationToken ct)
    {
        var binding = await _db.JobLightBindings.FirstOrDefaultAsync(x => x.Id == bindingId, ct);
        if (binding is null)
            return Failure("绑定关系不存在");

        if (binding.Status != LightBindingStatus.Bound)
            return Failure("灯条尚未绑定成功", ToResponse(binding));

        try
        {
            await _publisher.PublishLightOnAsync(binding.StationId, binding.TagId, ct);
        }
        catch (Exception ex)
        {
            return Failure($"MQTT 发布失败: {ex.Message}", ToResponse(binding));
        }

        return new JobLightBindingOperationResult(true, ToResponse(binding), null);
    }

    public async Task<JobLightBindingOperationResult> LightOffAsync(long bindingId, CancellationToken ct)
    {
        var binding = await _db.JobLightBindings.FirstOrDefaultAsync(x => x.Id == bindingId, ct);
        if (binding is null)
            return Failure("绑定关系不存在");

        try
        {
            await _publisher.PublishLightOffAsync(binding.StationId, binding.TagId, ct);
        }
        catch (Exception ex)
        {
            return Failure($"MQTT 发布失败: {ex.Message}", ToResponse(binding));
        }

        return new JobLightBindingOperationResult(true, ToResponse(binding), null);
    }

    private async Task MarkTimedOutBindingsAsync(CancellationToken ct)
    {
        var cutoff = UtcNow().Subtract(BindTimeout);
        var rows = await _db.JobLightBindings
            .Where(x => x.Status == LightBindingStatus.PendingBind && x.CreatedAt < cutoff)
            .ToListAsync(ct);

        foreach (var row in rows)
        {
            row.Status = LightBindingStatus.BindFailed;
            row.FailureReason = "绑定指令已发送，但 30 秒内没有收到基站确认";
            row.UpdatedAt = UtcNow();
        }

        if (rows.Count > 0)
            await _db.SaveChangesAsync(ct);
    }

    private async Task<int?> AllocateGroupNoAsync(string stationId, CancellationToken ct)
    {
        var used = await _db.JobLightBindings
            .Where(x => x.StationId == stationId && LightBindingStatus.ActiveStatuses.Contains(x.Status))
            .Select(x => x.GroupNo)
            .ToListAsync(ct);

        var usedSet = used.ToHashSet();
        for (var group = 1; group <= 254; group++)
        {
            if (!usedSet.Contains(group))
                return group;
        }

        return null;
    }

    private async Task OverrideActiveTargetBindingsAsync(long? jobId, string plate, string actorLabel, CancellationToken ct)
    {
        var now = UtcNow();
        var rows = await _db.JobLightBindings
            .Where(x =>
                LightBindingStatus.ActiveStatuses.Contains(x.Status) &&
                (
                    jobId.HasValue
                        ? x.JobId == jobId.Value
                        : x.JobId == null && x.Plate == plate
                ))
            .ToListAsync(ct);

        foreach (var row in rows)
        {
            row.Status = LightBindingStatus.Unbound;
            row.FailureReason = $"已被 {actorLabel} 覆盖绑定。";
            row.UpdatedAt = now;
        }

        if (rows.Count > 0)
            await _db.SaveChangesAsync(ct);
    }

    private async Task OverrideActiveTagBindingsAsync(string tagId, string actorLabel, CancellationToken ct)
    {
        var now = UtcNow();
        var rows = await _db.JobLightBindings
            .Where(x => x.TagId == tagId && LightBindingStatus.ActiveStatuses.Contains(x.Status))
            .ToListAsync(ct);

        foreach (var row in rows)
        {
            row.Status = LightBindingStatus.Unbound;
            row.FailureReason = $"已被 {actorLabel} 覆盖绑定。";
            row.UpdatedAt = now;
        }

        if (rows.Count > 0)
            await _db.SaveChangesAsync(ct);
    }

    private DateTime UtcNow() => _timeProvider.GetUtcNow().UtcDateTime;

    private static DateTime EnsureUtc(DateTime value)
        => value.Kind == DateTimeKind.Utc ? value : DateTime.SpecifyKind(value, DateTimeKind.Utc);

    private static string Normalize(string? value)
        => (value ?? string.Empty).Trim().ToUpperInvariant();

    private static string NormalizeDisplayName(string? value)
        => string.Join(" ", (value ?? string.Empty).Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries));

    private static string? FormatVehicleModel(int? year, string? make, string? model)
    {
        var parts = new[]
            {
                year?.ToString(),
                NormalizeDisplayName(make),
                NormalizeDisplayName(model),
            }
            .Where(part => !string.IsNullOrWhiteSpace(part))
            .ToArray();

        return parts.Length == 0 ? null : string.Join(" ", parts);
    }

    private static JobLightBindingOperationResult Failure(string message, JobLightBindingResponse? binding = null)
        => new(false, binding, message);

    private static JobLightBindingResponse ToResponse(JobLightBinding binding)
        => new(
            binding.Id,
            binding.JobId,
            binding.Plate,
            binding.StationId,
            binding.TagId,
            binding.GroupNo,
            binding.Status,
            binding.FailureReason,
            binding.LastResultAt);
}
