namespace Workshop.Api.Features.EStationMonitoring.DTOs;

public sealed record EStationMqttHealthResponse(
    bool Enabled,
    string BrokerHost,
    int BrokerPort,
    bool UseTls,
    bool HasUsername,
    string ClientIdPrefix);
