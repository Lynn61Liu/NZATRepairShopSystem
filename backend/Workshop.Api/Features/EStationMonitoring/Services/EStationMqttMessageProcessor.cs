using System.Text.Json;
using Workshop.Api.Features.EStationMonitoring.DTOs;
using Workshop.Api.Features.EStationMonitoring.Models;
using Workshop.Api.Features.JobLightBindings.Services;

namespace Workshop.Api.Features.EStationMonitoring.Services;

public sealed class EStationMqttMessageProcessor
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true,
    };

    private readonly MqttMessageLogService _logService;
    private readonly StationStatusService _stationStatusService;
    private readonly LightTagStatusService _lightTagStatusService;
    private readonly JobLightBindingService _jobLightBindingService;

    public EStationMqttMessageProcessor(
        MqttMessageLogService logService,
        StationStatusService stationStatusService,
        LightTagStatusService lightTagStatusService,
        JobLightBindingService jobLightBindingService)
    {
        _logService = logService;
        _stationStatusService = stationStatusService;
        _lightTagStatusService = lightTagStatusService;
        _jobLightBindingService = jobLightBindingService;
    }

    public async Task ProcessAsync(string topic, string payload, DateTime receivedAt, CancellationToken ct)
    {
        var parsed = EStationMqttTopicRouter.Parse(topic);
        var log = await _logService.CreateAsync(topic, payload, parsed.MessageType, parsed.StationId, receivedAt, ct);

        if (!parsed.IsValid || string.IsNullOrWhiteSpace(parsed.StationId))
        {
            await _logService.MarkFailedAsync(log.Id, EStationProcessingStatus.InvalidTopic, "Unsupported eStation MQTT topic.", ct);
            return;
        }

        try
        {
            switch (parsed.MessageType)
            {
                case EStationMqttMessageType.Heartbeat:
                    var heartbeat = JsonSerializer.Deserialize<EStationHeartbeatDto>(payload, JsonOptions);
                    if (heartbeat is null)
                    {
                        await _logService.MarkFailedAsync(log.Id, EStationProcessingStatus.InvalidPayload, "Heartbeat payload is empty.", ct);
                        return;
                    }

                    await _stationStatusService.HandleHeartbeatAsync(parsed.StationId, heartbeat, receivedAt, ct);
                    await _logService.MarkProcessedAsync(log.Id, null, ct);
                    return;

                case EStationMqttMessageType.Result:
                    var result = JsonSerializer.Deserialize<TaskResultDto>(payload, JsonOptions);
                    if (result is null)
                    {
                        await _logService.MarkFailedAsync(log.Id, EStationProcessingStatus.InvalidPayload, "Result payload is empty.", ct);
                        return;
                    }

                    await _lightTagStatusService.HandleResultAsync(parsed.StationId, result, receivedAt, ct);
                    await _jobLightBindingService.HandleResultAsync(parsed.StationId, result, receivedAt, ct);
                    await _stationStatusService.UpdateCountsFromResultAsync(parsed.StationId, result.TotalCount, result.SendCount, receivedAt, ct);
                    await _logService.MarkProcessedAsync(log.Id, result.Results.Count == 1 ? result.Results[0].TagID : null, ct);
                    return;

                default:
                    await _logService.MarkFailedAsync(log.Id, EStationProcessingStatus.InvalidTopic, "Unsupported eStation MQTT message type.", ct);
                    return;
            }
        }
        catch (JsonException ex)
        {
            await _logService.MarkFailedAsync(log.Id, EStationProcessingStatus.InvalidPayload, ex.Message, ct);
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("does not match", StringComparison.OrdinalIgnoreCase))
        {
            await _logService.MarkFailedAsync(log.Id, EStationProcessingStatus.StationMismatch, ex.Message, ct);
        }
        catch (InvalidOperationException ex)
        {
            await _logService.MarkFailedAsync(log.Id, EStationProcessingStatus.InvalidIdentifier, ex.Message, ct);
        }
        catch (Exception ex)
        {
            await _logService.MarkFailedAsync(log.Id, EStationProcessingStatus.Failed, ex.Message, ct);
        }
    }
}
