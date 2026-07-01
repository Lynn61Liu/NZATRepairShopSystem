using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Features.EStationMonitoring.DTOs;
using Workshop.Api.Features.EStationMonitoring.Models;

namespace Workshop.Api.Features.EStationMonitoring.Services;

public sealed class MqttMessageLogService
{
    private readonly AppDbContext _db;

    public MqttMessageLogService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<MqttMessageLog> CreateAsync(
        string topic,
        string payload,
        EStationMqttMessageType messageType,
        string? stationId,
        DateTime receivedAt,
        CancellationToken ct)
    {
        var row = new MqttMessageLog
        {
            Topic = topic,
            Payload = payload,
            MessageType = messageType.ToString(),
            StationId = stationId,
            ReceivedAt = receivedAt,
            ProcessingStatus = EStationProcessingStatus.Received,
        };

        _db.MqttMessageLogs.Add(row);
        await _db.SaveChangesAsync(ct);
        return row;
    }

    public async Task MarkProcessedAsync(long id, string? tagId, CancellationToken ct)
    {
        var row = await _db.MqttMessageLogs.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (row is null) return;

        row.TagId = tagId;
        row.ProcessingStatus = EStationProcessingStatus.Processed;
        row.ErrorMessage = null;
        await _db.SaveChangesAsync(ct);
    }

    public async Task MarkFailedAsync(long id, string status, string errorMessage, CancellationToken ct)
    {
        var row = await _db.MqttMessageLogs.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (row is null) return;

        row.ProcessingStatus = status;
        row.ErrorMessage = errorMessage;
        await _db.SaveChangesAsync(ct);
    }

    public async Task<List<MqttMessageLogResponse>> GetLogsAsync(
        string? stationId,
        string? messageType,
        string? processingStatus,
        int limit,
        CancellationToken ct)
    {
        var query = _db.MqttMessageLogs.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(stationId))
        {
            var normalized = stationId.Trim().ToUpperInvariant();
            query = query.Where(x => x.StationId == normalized);
        }

        if (!string.IsNullOrWhiteSpace(messageType))
            query = query.Where(x => x.MessageType == messageType.Trim());

        if (!string.IsNullOrWhiteSpace(processingStatus))
            query = query.Where(x => x.ProcessingStatus == processingStatus.Trim());

        var safeLimit = Math.Clamp(limit, 1, 500);
        var rows = await query
            .OrderByDescending(x => x.ReceivedAt)
            .Take(safeLimit)
            .ToListAsync(ct);

        return rows.Select(x => new MqttMessageLogResponse(
            x.Id,
            x.Topic,
            x.Payload,
            x.MessageType,
            x.StationId,
            x.TagId,
            x.ReceivedAt,
            x.ProcessingStatus,
            x.ErrorMessage)).ToList();
    }
}
