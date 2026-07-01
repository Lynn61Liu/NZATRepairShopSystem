using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Workshop.Api.Data;
using Workshop.Api.Features.EStationMonitoring.DTOs;
using Workshop.Api.Features.EStationMonitoring.Models;
using Workshop.Api.Features.EStationMonitoring.Options;

namespace Workshop.Api.Features.EStationMonitoring.Services;

public sealed class StationStatusService
{
    private readonly AppDbContext _db;
    private readonly TimeProvider _timeProvider;
    private readonly EStationMqttOptions _options;

    public StationStatusService(
        AppDbContext db,
        TimeProvider timeProvider,
        IOptions<EStationMqttOptions>? options = null)
    {
        _db = db;
        _timeProvider = timeProvider;
        _options = options?.Value ?? new EStationMqttOptions();
    }

    public async Task HandleHeartbeatAsync(
        string topicStationId,
        EStationHeartbeatDto dto,
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

        var normalizedStationId = topicStationId.ToUpperInvariant();
        var now = receivedAt.Kind == DateTimeKind.Utc ? receivedAt : DateTime.SpecifyKind(receivedAt, DateTimeKind.Utc);
        var station = await _db.LightStations.FirstOrDefaultAsync(x => x.StationId == normalizedStationId, ct);

        if (station is null)
        {
            station = new LightStation
            {
                StationId = normalizedStationId,
                CreatedAt = now,
            };
            _db.LightStations.Add(station);
        }

        station.Mac = NullIfBlank(dto.MAC);
        station.Alias = NullIfBlank(dto.Alias);
        station.ServerAddress = NullIfBlank(dto.ServerAddress);
        station.FirmwareVersion = NullIfBlank(dto.AppVersion);
        station.TotalCount = dto.TotalCount;
        station.SendCount = dto.SendCount;
        station.LastHeartbeatAt = now;
        station.IsOnline = true;
        station.LastPayloadStatus = EStationProcessingStatus.Processed;
        station.UpdatedAt = now;

        await _db.SaveChangesAsync(ct);
    }

    public async Task<List<StationStatusResponse>> GetStationsAsync(CancellationToken ct)
    {
        var now = _timeProvider.GetUtcNow().UtcDateTime;
        var rows = await _db.LightStations
            .AsNoTracking()
            .OrderByDescending(x => x.LastHeartbeatAt)
            .ThenBy(x => x.StationId)
            .ToListAsync(ct);

        return rows.Select(row => ToResponse(row, now)).ToList();
    }

    public async Task<StationStatusResponse?> GetStationAsync(string stationId, CancellationToken ct)
    {
        var normalized = stationId.Trim().ToUpperInvariant();
        var row = await _db.LightStations.AsNoTracking().FirstOrDefaultAsync(x => x.StationId == normalized, ct);
        return row is null ? null : ToResponse(row, _timeProvider.GetUtcNow().UtcDateTime);
    }

    public async Task UpdateCountsFromResultAsync(string stationId, int totalCount, int sendCount, DateTime receivedAt, CancellationToken ct)
    {
        var normalized = stationId.Trim().ToUpperInvariant();
        var station = await _db.LightStations.FirstOrDefaultAsync(x => x.StationId == normalized, ct);
        if (station is null)
        {
            station = new LightStation
            {
                StationId = normalized,
                CreatedAt = receivedAt,
            };
            _db.LightStations.Add(station);
        }

        station.TotalCount = totalCount;
        station.SendCount = sendCount;
        station.UpdatedAt = receivedAt;
        await _db.SaveChangesAsync(ct);
    }

    private StationStatusResponse ToResponse(LightStation row, DateTime now)
    {
        var seconds = row.LastHeartbeatAt.HasValue
            ? Math.Max(0, (int)Math.Floor((now - row.LastHeartbeatAt.Value).TotalSeconds))
            : (int?)null;

        var status = seconds is null
            ? "NeverSeen"
            : seconds <= _options.HeartbeatWarningSeconds
                ? "Online"
                : seconds <= _options.HeartbeatOfflineSeconds
                    ? "Warning"
                    : "Offline";

        return new StationStatusResponse(
            row.StationId,
            row.Alias,
            status,
            status == "Online",
            row.LastHeartbeatAt,
            seconds,
            row.FirmwareVersion,
            row.ServerAddress,
            row.TotalCount,
            row.SendCount,
            row.LastPayloadStatus);
    }

    private static string? NullIfBlank(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }
}
