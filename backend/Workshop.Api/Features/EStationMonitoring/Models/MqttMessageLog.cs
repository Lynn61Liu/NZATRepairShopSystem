namespace Workshop.Api.Features.EStationMonitoring.Models;

public sealed class MqttMessageLog
{
    public long Id { get; set; }
    public string Topic { get; set; } = string.Empty;
    public string Payload { get; set; } = string.Empty;
    public string MessageType { get; set; } = EStationMqttMessageType.Unknown.ToString();
    public string? StationId { get; set; }
    public string? TagId { get; set; }
    public DateTime ReceivedAt { get; set; }
    public string ProcessingStatus { get; set; } = EStationProcessingStatus.Received;
    public string? ErrorMessage { get; set; }
}
