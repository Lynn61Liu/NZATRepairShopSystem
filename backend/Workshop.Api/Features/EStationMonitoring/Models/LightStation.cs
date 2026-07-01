namespace Workshop.Api.Features.EStationMonitoring.Models;

public sealed class LightStation
{
    public long Id { get; set; }
    public string StationId { get; set; } = string.Empty;
    public string? Mac { get; set; }
    public string? Alias { get; set; }
    public bool IsOnline { get; set; }
    public DateTime? LastHeartbeatAt { get; set; }
    public string? ServerAddress { get; set; }
    public string? FirmwareVersion { get; set; }
    public int TotalCount { get; set; }
    public int SendCount { get; set; }
    public string LastPayloadStatus { get; set; } = EStationProcessingStatus.Processed;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
