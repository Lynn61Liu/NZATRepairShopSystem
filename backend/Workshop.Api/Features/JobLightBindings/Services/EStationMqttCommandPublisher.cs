using System.Text.Json;
using Microsoft.Extensions.Options;
using MQTTnet;
using MQTTnet.Client;
using MQTTnet.Protocol;
using Workshop.Api.Features.EStationMonitoring.Options;

namespace Workshop.Api.Features.JobLightBindings.Services;

public interface IEStationMqttCommandPublisher
{
    Task PublishBindAsync(string stationId, int groupNo, IReadOnlyList<string> tagIds, CancellationToken ct);
    Task PublishLightOnAsync(string stationId, string tagId, CancellationToken ct);
    Task PublishLightOffAsync(string stationId, string tagId, CancellationToken ct);
}

public sealed class EStationMqttCommandPublisher : IEStationMqttCommandPublisher
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = null,
    };

    private readonly EStationMqttOptions _options;

    public EStationMqttCommandPublisher(IOptions<EStationMqttOptions> options)
    {
        _options = options.Value;
    }

    public static string BuildBindPayload(int groupNo, IReadOnlyList<string> tagIds)
        => JsonSerializer.Serialize(new BindPayload(groupNo, tagIds), JsonOptions);

    public static string BuildLightOnPayload(string tagId)
        => JsonSerializer.Serialize(
            new TaskPayload(
                255,
                [new TaskItemPayload(tagId, true, [new RgbPayload(true, false, false)], true)]),
            JsonOptions);

    public static string BuildLightOffPayload(string tagId)
        => JsonSerializer.Serialize(
            new TaskPayload(
                0,
                [new TaskItemPayload(tagId, false, [new RgbPayload(false, false, false)], null)]),
            JsonOptions);

    public async Task PublishBindAsync(string stationId, int groupNo, IReadOnlyList<string> tagIds, CancellationToken ct)
        => await PublishAsync(stationId, "bind", BuildBindPayload(groupNo, tagIds), ct);

    public async Task PublishLightOnAsync(string stationId, string tagId, CancellationToken ct)
        => await PublishAsync(stationId, "task", BuildLightOnPayload(tagId), ct);

    public async Task PublishLightOffAsync(string stationId, string tagId, CancellationToken ct)
        => await PublishAsync(stationId, "task", BuildLightOffPayload(tagId), ct);

    private async Task PublishAsync(string stationId, string topicSuffix, string payload, CancellationToken ct)
    {
        if (!_options.Enabled)
            throw new InvalidOperationException("eStation MQTT is disabled.");

        if (string.IsNullOrWhiteSpace(_options.BrokerHost))
            throw new InvalidOperationException("eStation MQTT broker host is not configured.");

        var factory = new MqttFactory();
        using var client = factory.CreateMqttClient();
        await client.ConnectAsync(BuildClientOptions(), ct);

        var message = new MqttApplicationMessageBuilder()
            .WithTopic($"/estation/{stationId}/{topicSuffix}")
            .WithPayload(payload)
            .WithQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce)
            .Build();

        await client.PublishAsync(message, ct);
        await client.DisconnectAsync(new MqttClientDisconnectOptions(), ct);
    }

    private MqttClientOptions BuildClientOptions()
    {
        var clientId = $"{_options.ClientIdPrefix}-cmd-{Environment.MachineName}-{Guid.NewGuid():N}";
        if (clientId.Length > 64)
            clientId = clientId[..64];

        var builder = new MqttClientOptionsBuilder()
            .WithClientId(clientId)
            .WithTcpServer(_options.BrokerHost, _options.BrokerPort)
            .WithCleanSession();

        if (!string.IsNullOrWhiteSpace(_options.Username))
            builder.WithCredentials(_options.Username, _options.Password);

        if (_options.UseTls)
            builder.WithTlsOptions(tls => tls.UseTls());

        return builder.Build();
    }

    private sealed record BindPayload(int Group, IReadOnlyList<string> Items);
    private sealed record TaskPayload(int Time, IReadOnlyList<TaskItemPayload> Items);
    private sealed record TaskItemPayload(string TagID, bool Beep, IReadOnlyList<RgbPayload> Colors, bool? Flashing);
    private sealed record RgbPayload(bool R, bool G, bool B);
}
