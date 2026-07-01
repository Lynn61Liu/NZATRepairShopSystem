namespace Workshop.Api.Features.EStationMonitoring.DTOs;

public sealed class EStationHeartbeatDto
{
    public string ID { get; set; } = string.Empty;
    public string? MAC { get; set; }
    public string? Alias { get; set; }
    public int ClientType { get; set; }
    public string? ServerAddress { get; set; }
    public List<string>? Parameters { get; set; }
    public string? LocalIP { get; set; }
    public string? SubnetMask { get; set; }
    public string? Gateway { get; set; }
    public int Heartbeat { get; set; }
    public string? AppVersion { get; set; }
    public int TotalCount { get; set; }
    public int SendCount { get; set; }
}
