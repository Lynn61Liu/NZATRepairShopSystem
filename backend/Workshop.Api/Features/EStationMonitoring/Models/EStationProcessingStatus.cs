namespace Workshop.Api.Features.EStationMonitoring.Models;

public static class EStationProcessingStatus
{
    public const string Received = "Received";
    public const string Processed = "Processed";
    public const string InvalidTopic = "InvalidTopic";
    public const string InvalidPayload = "InvalidPayload";
    public const string InvalidIdentifier = "InvalidIdentifier";
    public const string StationMismatch = "StationMismatch";
    public const string Failed = "Failed";
}
