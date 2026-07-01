using Microsoft.EntityFrameworkCore;
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

    public JobLightBindingService(
        AppDbContext db,
        IEStationMqttCommandPublisher publisher,
        TimeProvider timeProvider)
    {
        _db = db;
        _publisher = publisher;
        _timeProvider = timeProvider;
    }

    public async Task<JobLightBindingOperationResult> CreateBindingAsync(long jobId, string rawTagId, CancellationToken ct)
    {
        var tagId = Normalize(rawTagId);
        if (!EStationIdentifierValidator.IsValidTagId(tagId))
            return Failure("灯条码格式不正确");

        var job = await _db.Jobs
            .Include(x => x.Vehicle)
            .FirstOrDefaultAsync(x => x.Id == jobId, ct);
        if (job is null)
            return Failure("Job 不存在");

        var plate = Normalize(job.Vehicle?.Plate ?? string.Empty);
        if (string.IsNullOrWhiteSpace(plate))
            return Failure("Job 没有车牌号");

        if (await HasActiveJobBindingAsync(jobId, ct))
            return Failure("这个 Job 已经绑定了灯条");

        if (await HasActiveTagBindingAsync(tagId, ct))
            return Failure("这个灯条已经绑定到其他 Job");

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

        try
        {
            await _publisher.PublishBindAsync(binding.StationId, binding.GroupNo, [binding.TagId], ct);
        }
        catch (Exception ex)
        {
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
            if (!EStationIdentifierValidator.IsValidTagId(tagId))
                continue;

            var binding = await _db.JobLightBindings
                .Where(x =>
                    x.StationId == normalizedStationId &&
                    x.TagId == tagId &&
                    x.Status == LightBindingStatus.PendingBind)
                .OrderByDescending(x => x.CreatedAt)
                .FirstOrDefaultAsync(ct);

            if (binding is null || item.Group != binding.GroupNo)
                continue;

            binding.Status = LightBindingStatus.Bound;
            binding.FailureReason = null;
            binding.LastResultAt = now;
            binding.UpdatedAt = now;
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
                orderby binding.UpdatedAt descending, binding.Id descending
                select new DeviceLightBindingResponse(
                    binding.Id,
                    binding.JobId,
                    binding.Plate,
                    binding.StationId,
                    binding.TagId,
                    binding.GroupNo,
                    binding.Status,
                    tag == null ? null : tag.BatteryPercent,
                    tag == null ? null : tag.CurrentColor,
                    tag != null && tag.IsLightOn,
                    tag == null ? null : tag.LastSeenAt,
                    binding.LastResultAt,
                    binding.FailureReason))
            .ToListAsync(ct);

        return rows;
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

    private Task<bool> HasActiveJobBindingAsync(long jobId, CancellationToken ct)
        => _db.JobLightBindings.AnyAsync(x => x.JobId == jobId && LightBindingStatus.ActiveStatuses.Contains(x.Status), ct);

    private Task<bool> HasActiveTagBindingAsync(string tagId, CancellationToken ct)
        => _db.JobLightBindings.AnyAsync(x => x.TagId == tagId && LightBindingStatus.ActiveStatuses.Contains(x.Status), ct);

    private DateTime UtcNow() => _timeProvider.GetUtcNow().UtcDateTime;

    private static DateTime EnsureUtc(DateTime value)
        => value.Kind == DateTimeKind.Utc ? value : DateTime.SpecifyKind(value, DateTimeKind.Utc);

    private static string Normalize(string value)
        => value.Trim().ToUpperInvariant();

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
