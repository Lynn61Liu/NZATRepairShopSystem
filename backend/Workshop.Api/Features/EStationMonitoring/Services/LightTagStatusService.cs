using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Features.EStationMonitoring.DTOs;
using Workshop.Api.Features.EStationMonitoring.Models;

namespace Workshop.Api.Features.EStationMonitoring.Services;

public sealed class LightTagStatusService
{
    private readonly AppDbContext _db;

    public LightTagStatusService(AppDbContext db)
    {
        _db = db;
    }

    public async Task HandleResultAsync(
        string topicStationId,
        TaskResultDto dto,
        DateTime receivedAt,
        CancellationToken ct)
    {
        if (!EStationIdentifierValidator.IsValidStationId(topicStationId))
            throw new InvalidOperationException("Invalid station id.");

        if (!string.IsNullOrWhiteSpace(dto.ID) &&
            !topicStationId.Equals(dto.ID.Trim(), StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Topic station id does not match payload ID.");
        }

        var stationId = topicStationId.ToUpperInvariant();
        var now = receivedAt.Kind == DateTimeKind.Utc ? receivedAt : DateTime.SpecifyKind(receivedAt, DateTimeKind.Utc);

        foreach (var item in dto.Results)
        {
            if (!EStationIdentifierValidator.IsValidTagId(item.TagID))
                throw new InvalidOperationException($"Invalid tag id: {item.TagID}");
        }

        foreach (var item in dto.Results)
        {
            var tagId = item.TagID.Trim().ToUpperInvariant();
            var tag = await _db.LightTags.FirstOrDefaultAsync(x => x.TagId == tagId, ct);
            if (tag is null)
            {
                tag = new LightTag
                {
                    TagId = tagId,
                    CreatedAt = now,
                };
                _db.LightTags.Add(tag);
            }

            var color = item.Colors.Count > 0
                ? EStationDeviceValueMapper.ToColorName(item.Colors[0])
                : "Unknown";

            tag.StationId = stationId;
            tag.CurrentGroup = item.Group;
            tag.CurrentColor = color;
            tag.IsLightOn = color is not "Off" and not "Unknown";
            tag.BatteryRaw = item.Battery;
            tag.BatteryVoltage = EStationDeviceValueMapper.ToVoltage(item.Battery);
            tag.BatteryPercent = EStationDeviceValueMapper.ToBatteryPercent(item.Battery);
            tag.RfPowerSend = item.RfPowerSend;
            tag.RfPowerRecv = item.RfPowerRecv;
            tag.FirmwareVersion = NullIfBlank(item.Version);
            tag.LastResultType = item.ResultType;
            tag.LastSeenAt = now;
            tag.LastPayloadStatus = EStationProcessingStatus.Processed;
            tag.UpdatedAt = now;
        }

        await _db.SaveChangesAsync(ct);
    }

    public async Task<List<LightTagStatusResponse>> GetLightTagsAsync(
        string? stationId,
        int? group,
        string? battery,
        CancellationToken ct)
    {
        var query = _db.LightTags.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(stationId))
        {
            var normalized = stationId.Trim().ToUpperInvariant();
            query = query.Where(x => x.StationId == normalized);
        }

        if (group.HasValue)
            query = query.Where(x => x.CurrentGroup == group.Value);

        if (string.Equals(battery, "low", StringComparison.OrdinalIgnoreCase))
            query = query.Where(x => x.BatteryPercent.HasValue && x.BatteryPercent.Value < 30);

        var rows = await query
            .OrderByDescending(x => x.LastSeenAt)
            .ThenBy(x => x.TagId)
            .ToListAsync(ct);

        return rows.Select(ToResponse).ToList();
    }

    public async Task<LightTagStatusResponse?> GetLightTagAsync(string tagId, CancellationToken ct)
    {
        var normalized = tagId.Trim().ToUpperInvariant();
        var row = await _db.LightTags.AsNoTracking().FirstOrDefaultAsync(x => x.TagId == normalized, ct);
        return row is null ? null : ToResponse(row);
    }

    private static LightTagStatusResponse ToResponse(LightTag row)
        => new(
            row.TagId,
            row.StationId,
            row.CurrentGroup,
            row.CurrentColor,
            row.IsLightOn,
            row.BatteryVoltage,
            row.BatteryPercent,
            row.RfPowerSend,
            row.RfPowerRecv,
            row.LastResultType,
            EStationDeviceValueMapper.ResultTypeLabel(row.LastResultType),
            row.LastSeenAt,
            row.LastPayloadStatus);

    private static string? NullIfBlank(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }
}
