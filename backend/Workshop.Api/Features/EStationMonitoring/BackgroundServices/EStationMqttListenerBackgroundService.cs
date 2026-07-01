using System.Text;
using Microsoft.Extensions.Options;
using MQTTnet;
using MQTTnet.Client;
using MQTTnet.Protocol;
using Workshop.Api.Features.EStationMonitoring.Options;
using Workshop.Api.Features.EStationMonitoring.Services;

namespace Workshop.Api.Features.EStationMonitoring.BackgroundServices;

public sealed class EStationMqttListenerBackgroundService : BackgroundService
{
    private static readonly TimeSpan ReconnectDelay = TimeSpan.FromSeconds(5);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<EStationMqttListenerBackgroundService> _logger;
    private readonly EStationMqttOptions _options;
    private readonly TimeProvider _timeProvider;
    private IMqttClient? _client;

    public EStationMqttListenerBackgroundService(
        IServiceScopeFactory scopeFactory,
        ILogger<EStationMqttListenerBackgroundService> logger,
        IOptions<EStationMqttOptions> options,
        TimeProvider timeProvider)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _options = options.Value;
        _timeProvider = timeProvider;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.Enabled)
        {
            _logger.LogInformation("eStation MQTT listener is disabled.");
            return;
        }

        if (string.IsNullOrWhiteSpace(_options.BrokerHost))
        {
            _logger.LogWarning("eStation MQTT listener is enabled but BrokerHost is empty.");
            return;
        }

        var factory = new MqttFactory();
        _client = factory.CreateMqttClient();
        _client.ApplicationMessageReceivedAsync += HandleMessageAsync;

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (!_client.IsConnected)
                {
                    await _client.ConnectAsync(BuildClientOptions(), stoppingToken);
                    await SubscribeAsync(stoppingToken);
                    _logger.LogInformation("Connected to eStation MQTT broker {Host}:{Port}.", _options.BrokerHost, _options.BrokerPort);
                }

                await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "eStation MQTT listener failed; retrying in {DelaySeconds}s.", ReconnectDelay.TotalSeconds);
                await Task.Delay(ReconnectDelay, stoppingToken);
            }
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        if (_client is { IsConnected: true })
        {
            await _client.DisconnectAsync(new MqttClientDisconnectOptions(), cancellationToken);
        }

        await base.StopAsync(cancellationToken);
    }

    private MqttClientOptions BuildClientOptions()
    {
        var clientId = $"{_options.ClientIdPrefix}-{Environment.MachineName}-{Guid.NewGuid():N}";
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

    private async Task SubscribeAsync(CancellationToken ct)
    {
        if (_client is null) return;

        var options = new MqttClientSubscribeOptionsBuilder()
            .WithTopicFilter("/estation/+/heartbeat", MqttQualityOfServiceLevel.AtLeastOnce)
            .WithTopicFilter("/estation/+/result", MqttQualityOfServiceLevel.AtLeastOnce)
            .Build();

        await _client.SubscribeAsync(options, ct);
    }

    private async Task HandleMessageAsync(MqttApplicationMessageReceivedEventArgs args)
    {
        var topic = args.ApplicationMessage.Topic;
        var payloadSegment = args.ApplicationMessage.PayloadSegment;
        var payload = payloadSegment.Array is null
            ? string.Empty
            : Encoding.UTF8.GetString(payloadSegment.Array, payloadSegment.Offset, payloadSegment.Count);
        var receivedAt = _timeProvider.GetUtcNow().UtcDateTime;

        try
        {
            using var scope = _scopeFactory.CreateScope();
            var processor = scope.ServiceProvider.GetRequiredService<EStationMqttMessageProcessor>();
            await processor.ProcessAsync(topic, payload, receivedAt, CancellationToken.None);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to process eStation MQTT message on topic {Topic}.", topic);
        }
    }
}
