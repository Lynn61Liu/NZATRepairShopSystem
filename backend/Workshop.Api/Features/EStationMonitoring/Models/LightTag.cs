namespace Workshop.Api.Features.EStationMonitoring.Models;

public sealed class LightTag
{
    public long Id { get; set; }
    public string TagId { get; set; } = string.Empty;
    public string? StationId { get; set; }
    public int? CurrentGroup { get; set; }
    public string? CurrentColor { get; set; }
    public bool IsLightOn { get; set; }
    public bool? IsFlashing { get; set; }
    public int? BatteryRaw { get; set; }
    public decimal? BatteryVoltage { get; set; }
    public int? BatteryPercent { get; set; }
    public int? RfPowerSend { get; set; }
    public int? RfPowerRecv { get; set; }
    public string? FirmwareVersion { get; set; }
    public int? LastResultType { get; set; }
    public DateTime? LastSeenAt { get; set; }
    public string LastPayloadStatus { get; set; } = EStationProcessingStatus.Processed;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
