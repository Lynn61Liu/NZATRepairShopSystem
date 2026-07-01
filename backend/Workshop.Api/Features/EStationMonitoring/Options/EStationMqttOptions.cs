namespace Workshop.Api.Features.EStationMonitoring.Options;

public sealed class EStationMqttOptions
{
    public const string SectionName = "EStationMqtt";

    public string BrokerHost { get; set; } = string.Empty;
    public int BrokerPort { get; set; } = 1883;
    public string? Username { get; set; }
    public string? Password { get; set; }
    public string ClientIdPrefix { get; set; } = "nzat-api";
    public bool UseTls { get; set; }
    public bool Enabled { get; set; } = false;
    public int HeartbeatWarningSeconds { get; set; } = 40;
    public int HeartbeatOfflineSeconds { get; set; } = 60;
    public int MqttLogRetentionDays { get; set; } = 30;
}
