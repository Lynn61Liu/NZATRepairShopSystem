using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Features.EStationMonitoring.DTOs;
using Workshop.Api.Features.EStationMonitoring.Models;
using Workshop.Api.Features.EStationMonitoring.Services;
using Workshop.Api.Models;

namespace Workshop.Api.Tests;

public class EStationMonitoringTests
{
    [Theory]
    [InlineData("/estation/90A9F73001B7/heartbeat", EStationMqttMessageType.Heartbeat, "90A9F73001B7")]
    [InlineData("/estation/90A9F73001B7/result", EStationMqttMessageType.Result, "90A9F73001B7")]
    public void TopicRouter_ParsesKnownEStationTopics(
        string topic,
        EStationMqttMessageType expectedType,
        string expectedStationId)
    {
        var parsed = EStationMqttTopicRouter.Parse(topic);

        parsed.IsValid.Should().BeTrue();
        parsed.MessageType.Should().Be(expectedType);
        parsed.StationId.Should().Be(expectedStationId);
    }

    [Theory]
    [InlineData("bad/topic")]
    [InlineData("/estation//heartbeat")]
    [InlineData("/estation/90A9F73001B7/task")]
    public void TopicRouter_RejectsUnsupportedTopics(string topic)
    {
        var parsed = EStationMqttTopicRouter.Parse(topic);

        parsed.IsValid.Should().BeFalse();
        parsed.MessageType.Should().Be(EStationMqttMessageType.Unknown);
    }

    [Fact]
    public async Task StationStatusService_UpsertsHeartbeatAndComputesOnlineState()
    {
        await using var db = CreateDbContext();
        var service = new StationStatusService(db, TimeProvider.System);
        var receivedAt = DateTime.UtcNow;

        await service.HandleHeartbeatAsync(
            "90A9F73001B7",
            new EStationHeartbeatDto
            {
                ID = "90A9F73001B7",
                MAC = "00:11:22:33:44:55",
                Alias = "Workshop Station",
                AppVersion = "1.6.7.0",
                ServerAddress = "192.168.1.50:1883",
                TotalCount = 2,
                SendCount = 1,
            },
            receivedAt,
            CancellationToken.None);

        var stations = await service.GetStationsAsync(CancellationToken.None);

        stations.Should().ContainSingle();
        var station = stations.Single();
        station.StationId.Should().Be("90A9F73001B7");
        station.Status.Should().Be("Online");
        station.IsOnline.Should().BeTrue();
        station.TotalCount.Should().Be(2);
        station.SendCount.Should().Be(1);
        station.FirmwareVersion.Should().Be("1.6.7.0");
    }

    [Fact]
    public async Task LightTagStatusService_UpsertsResultItemsAndConvertsDeviceValues()
    {
        await using var db = CreateDbContext();
        var service = new LightTagStatusService(db);
        var receivedAt = DateTime.UtcNow;

        await service.HandleResultAsync(
            "90A9F73001B7",
            new TaskResultDto
            {
                ID = "90A9F73001B7",
                TotalCount = 0,
                SendCount = 0,
                Results =
                [
                    new TaskItemResultDto
                    {
                        TagID = "AD100006D9A0",
                        Version = "1.0.0",
                        ResultType = 254,
                        RfPowerSend = -39,
                        RfPowerRecv = -83,
                        Battery = 30,
                        Group = 128,
                        Colors = [new RgbDto { R = true, G = false, B = false }],
                    },
                ],
            },
            receivedAt,
            CancellationToken.None);

        var tags = await service.GetLightTagsAsync(null, null, null, CancellationToken.None);

        tags.Should().ContainSingle();
        var tag = tags.Single();
        tag.TagId.Should().Be("AD100006D9A0");
        tag.StationId.Should().Be("90A9F73001B7");
        tag.CurrentColor.Should().Be("Red");
        tag.IsLightOn.Should().BeTrue();
        tag.BatteryVoltage.Should().Be(3.0m);
        tag.BatteryPercent.Should().Be(100);
        tag.LastResultTypeLabel.Should().Be("Communication Result");
    }

    [Theory]
    [InlineData(true, true, true, "White")]
    [InlineData(true, true, false, "Yellow")]
    [InlineData(false, true, true, "Cyan")]
    [InlineData(true, false, true, "Purple")]
    [InlineData(true, false, false, "Red")]
    [InlineData(false, true, false, "Green")]
    [InlineData(false, false, true, "Blue")]
    [InlineData(false, false, false, "Off")]
    public void EStationDeviceValueMapper_ConvertsRgbFlags(bool red, bool green, bool blue, string expected)
    {
        EStationDeviceValueMapper.ToColorName(new RgbDto { R = red, G = green, B = blue })
            .Should()
            .Be(expected);
    }

    private static TestAppDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        return new TestAppDbContext(options);
    }

    private sealed class TestAppDbContext : AppDbContext
    {
        public TestAppDbContext(DbContextOptions<AppDbContext> options)
            : base(options)
        {
        }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);
            modelBuilder.Entity<Vehicle>().Ignore(x => x.RawJson);
        }
    }
}
