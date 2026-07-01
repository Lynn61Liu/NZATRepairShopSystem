using Workshop.Api.Features.EStationMonitoring.Models;

namespace Workshop.Api.Features.EStationMonitoring.Services;

public readonly record struct ParsedEStationTopic(
    bool IsValid,
    EStationMqttMessageType MessageType,
    string? StationId);

public static class EStationMqttTopicRouter
{
    public static ParsedEStationTopic Parse(string? topic)
    {
        if (string.IsNullOrWhiteSpace(topic))
            return Invalid();

        var parts = topic.Split('/', StringSplitOptions.None);
        if (parts.Length != 4 || parts[0] != string.Empty || parts[1] != "estation")
            return Invalid();

        var stationId = parts[2].Trim();
        if (!EStationIdentifierValidator.IsValidStationId(stationId))
            return Invalid();

        return parts[3] switch
        {
            "heartbeat" => new ParsedEStationTopic(true, EStationMqttMessageType.Heartbeat, stationId),
            "result" => new ParsedEStationTopic(true, EStationMqttMessageType.Result, stationId),
            _ => Invalid(),
        };
    }

    private static ParsedEStationTopic Invalid()
        => new(false, EStationMqttMessageType.Unknown, null);
}
