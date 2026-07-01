using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Features.EStationMonitoring.DTOs;
using Workshop.Api.Features.EStationMonitoring.Models;
using Workshop.Api.Features.JobLightBindings.Models;
using Workshop.Api.Features.JobLightBindings.Services;
using Workshop.Api.Models;

namespace Workshop.Api.Tests;

public sealed class JobLightBindingTests
{
    [Fact]
    public async Task CreateBindingAsync_CreatesPendingBindingAndPublishesBindCommand()
    {
        await using var db = CreateDbContext();
        var publisher = new RecordingMqttCommandPublisher();
        var service = new JobLightBindingService(db, publisher, TimeProvider.System);
        var job = await SeedJobAsync(db, "ABC123");
        await SeedOnlineStationAsync(db, "90A9F73014FC");

        var result = await service.CreateBindingAsync(job.Id, " ad100006d9a0 ", CancellationToken.None);

        result.Success.Should().BeTrue();
        result.Binding.Should().NotBeNull();
        result.Binding!.Plate.Should().Be("ABC123");
        result.Binding.TagId.Should().Be("AD100006D9A0");
        result.Binding.StationId.Should().Be("90A9F73014FC");
        result.Binding.GroupNo.Should().BeInRange(1, 254);
        result.Binding.Status.Should().Be(LightBindingStatus.PendingBind);
        publisher.Commands.Should().ContainSingle(command =>
            command.StationId == "90A9F73014FC" &&
            command.GroupNo == result.Binding.GroupNo &&
            command.TagIds.SequenceEqual(new[] { "AD100006D9A0" }));
    }

    [Fact]
    public async Task CreateBindingAsync_RejectsInvalidTagId()
    {
        await using var db = CreateDbContext();
        var service = new JobLightBindingService(db, new RecordingMqttCommandPublisher(), TimeProvider.System);
        var job = await SeedJobAsync(db, "ABC123");
        await SeedOnlineStationAsync(db, "90A9F73014FC");

        var result = await service.CreateBindingAsync(job.Id, "BAD-TAG", CancellationToken.None);

        result.Success.Should().BeFalse();
        result.ErrorMessage.Should().Be("灯条码格式不正确");
        db.JobLightBindings.Should().BeEmpty();
    }

    [Fact]
    public async Task CreateBindingAsync_RejectsMissingJob()
    {
        await using var db = CreateDbContext();
        var service = new JobLightBindingService(db, new RecordingMqttCommandPublisher(), TimeProvider.System);
        await SeedOnlineStationAsync(db, "90A9F73014FC");

        var result = await service.CreateBindingAsync(999, "AD100006D9A0", CancellationToken.None);

        result.Success.Should().BeFalse();
        result.ErrorMessage.Should().Be("Job 不存在");
    }

    [Fact]
    public async Task CreateBindingAsync_RejectsWhenNoOnlineStationExists()
    {
        await using var db = CreateDbContext();
        var service = new JobLightBindingService(db, new RecordingMqttCommandPublisher(), TimeProvider.System);
        var job = await SeedJobAsync(db, "ABC123");

        var result = await service.CreateBindingAsync(job.Id, "AD100006D9A0", CancellationToken.None);

        result.Success.Should().BeFalse();
        result.ErrorMessage.Should().Be("没有在线基站");
    }

    [Fact]
    public async Task CreateBindingAsync_RejectsDuplicateActiveJobBinding()
    {
        await using var db = CreateDbContext();
        var service = new JobLightBindingService(db, new RecordingMqttCommandPublisher(), TimeProvider.System);
        var job = await SeedJobAsync(db, "ABC123");
        await SeedOnlineStationAsync(db, "90A9F73014FC");
        db.JobLightBindings.Add(new JobLightBinding
        {
            JobId = job.Id,
            Plate = "ABC123",
            StationId = "90A9F73014FC",
            TagId = "AD1000000001",
            GroupNo = 1,
            Status = LightBindingStatus.Bound,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();

        var result = await service.CreateBindingAsync(job.Id, "AD100006D9A0", CancellationToken.None);

        result.Success.Should().BeFalse();
        result.ErrorMessage.Should().Be("这个 Job 已经绑定了灯条");
    }

    [Fact]
    public async Task CreateBindingAsync_RejectsDuplicateActiveTagBinding()
    {
        await using var db = CreateDbContext();
        var service = new JobLightBindingService(db, new RecordingMqttCommandPublisher(), TimeProvider.System);
        var job = await SeedJobAsync(db, "ABC123");
        var otherJob = await SeedJobAsync(db, "XYZ789");
        await SeedOnlineStationAsync(db, "90A9F73014FC");
        db.JobLightBindings.Add(new JobLightBinding
        {
            JobId = otherJob.Id,
            Plate = "XYZ789",
            StationId = "90A9F73014FC",
            TagId = "AD100006D9A0",
            GroupNo = 1,
            Status = LightBindingStatus.Bound,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();

        var result = await service.CreateBindingAsync(job.Id, "AD100006D9A0", CancellationToken.None);

        result.Success.Should().BeFalse();
        result.ErrorMessage.Should().Be("这个灯条已经绑定到其他 Job");
    }

    [Fact]
    public async Task HandleResultAsync_UpdatesPendingBindingToBound()
    {
        await using var db = CreateDbContext();
        var service = new JobLightBindingService(db, new RecordingMqttCommandPublisher(), TimeProvider.System);
        var receivedAt = DateTime.UtcNow;
        db.JobLightBindings.Add(new JobLightBinding
        {
            JobId = 123,
            Plate = "ABC123",
            StationId = "90A9F73014FC",
            TagId = "AD100006D9A0",
            GroupNo = 128,
            Status = LightBindingStatus.PendingBind,
            CreatedAt = receivedAt.AddSeconds(-5),
            UpdatedAt = receivedAt.AddSeconds(-5),
        });
        await db.SaveChangesAsync();

        await service.HandleResultAsync(
            "90A9F73014FC",
            new TaskResultDto
            {
                Results =
                [
                    new TaskItemResultDto
                    {
                        TagID = "AD100006D9A0",
                        Group = 128,
                    },
                ],
            },
            receivedAt,
            CancellationToken.None);

        var binding = await db.JobLightBindings.SingleAsync();
        binding.Status.Should().Be(LightBindingStatus.Bound);
        binding.LastResultAt.Should().BeCloseTo(receivedAt, TimeSpan.FromMilliseconds(1));
        binding.FailureReason.Should().BeNull();
    }

    [Fact]
    public void BuildBindPayload_UsesSupplierJsonShape()
    {
        var payload = EStationMqttCommandPublisher.BuildBindPayload(128, ["AD100006D9A0"]);

        payload.Should().Be("{\"Group\":128,\"Items\":[\"AD100006D9A0\"]}");
    }

    [Fact]
    public void AddJobLightBindingsMigration_IsDiscoverableByEf()
    {
        var source = File.ReadAllText(Path.Combine(
            AppContext.BaseDirectory,
            "..",
            "..",
            "..",
            "..",
            "Workshop.Api",
            "Migrations",
            "20260701090000_AddJobLightBindings.cs"));

        source.Should().Contain("[DbContext(typeof(AppDbContext))]");
        source.Should().Contain("[Migration(\"20260701090000_AddJobLightBindings\")]");
    }

    [Fact]
    public void BuildLightOnPayload_UsesLongRunningBeepAndFlash()
    {
        var payload = EStationMqttCommandPublisher.BuildLightOnPayload("AD100006D9A0");

        payload.Should().Be("{\"Time\":255,\"Items\":[{\"TagID\":\"AD100006D9A0\",\"Beep\":true,\"Colors\":[{\"R\":true,\"G\":false,\"B\":false}],\"Flashing\":true}]}");
    }

    [Fact]
    public void BuildLightOffPayload_UsesStopCommandShape()
    {
        var payload = EStationMqttCommandPublisher.BuildLightOffPayload("AD100006D9A0");

        payload.Should().Be("{\"Time\":0,\"Items\":[{\"TagID\":\"AD100006D9A0\",\"Beep\":false,\"Colors\":[{\"R\":false,\"G\":false,\"B\":false}],\"Flashing\":null}]}");
    }

    private static TestAppDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        return new TestAppDbContext(options);
    }

    private static async Task<Job> SeedJobAsync(AppDbContext db, string plate)
    {
        var vehicle = new Vehicle
        {
            Plate = plate,
            UpdatedAt = DateTime.UtcNow,
        };
        var job = new Job
        {
            Status = "Open",
            Vehicle = vehicle,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
        db.Jobs.Add(job);
        await db.SaveChangesAsync();
        return job;
    }

    private static async Task SeedOnlineStationAsync(AppDbContext db, string stationId)
    {
        db.LightStations.Add(new LightStation
        {
            StationId = stationId,
            IsOnline = true,
            LastHeartbeatAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();
    }

    private sealed class RecordingMqttCommandPublisher : IEStationMqttCommandPublisher
    {
        public List<BindCommand> Commands { get; } = [];

        public Task PublishBindAsync(string stationId, int groupNo, IReadOnlyList<string> tagIds, CancellationToken ct)
        {
            Commands.Add(new BindCommand(stationId, groupNo, tagIds.ToArray()));
            return Task.CompletedTask;
        }

        public Task PublishLightOnAsync(string stationId, string tagId, CancellationToken ct)
            => Task.CompletedTask;

        public Task PublishLightOffAsync(string stationId, string tagId, CancellationToken ct)
            => Task.CompletedTask;
    }

    private sealed record BindCommand(string StationId, int GroupNo, IReadOnlyList<string> TagIds);

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
