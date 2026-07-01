namespace Workshop.Api.Features.EStationMonitoring.DTOs;

public sealed record StationStatusResponse(
    string StationId,
    string? Alias,
    string Status,
    bool IsOnline,
    DateTime? LastHeartbeatAt,
    int? SecondsSinceLastHeartbeat,
    string? FirmwareVersion,
    string? ServerAddress,
    int TotalCount,
    int SendCount,
    string LastPayloadStatus);

public sealed record LightTagStatusResponse(
    string TagId,
    string? StationId,
    int? CurrentGroup,
    string? CurrentColor,
    bool IsLightOn,
    decimal? BatteryVoltage,
    int? BatteryPercent,
    int? RfPowerSend,
    int? RfPowerRecv,
    int? LastResultType,
    string LastResultTypeLabel,
    DateTime? LastSeenAt,
    string LastPayloadStatus);

public sealed record MqttMessageLogResponse(
    long Id,
    string Topic,
    string Payload,
    string MessageType,
    string? StationId,
    string? TagId,
    DateTime ReceivedAt,
    string ProcessingStatus,
    string? ErrorMessage);
