using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
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
        var service = new JobLightBindingService(db, publisher, TimeProvider.System, NullLogger<JobLightBindingService>.Instance);
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
        var service = new JobLightBindingService(db, new RecordingMqttCommandPublisher(), TimeProvider.System, NullLogger<JobLightBindingService>.Instance);
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
        var service = new JobLightBindingService(db, new RecordingMqttCommandPublisher(), TimeProvider.System, NullLogger<JobLightBindingService>.Instance);
        await SeedOnlineStationAsync(db, "90A9F73014FC");

        var result = await service.CreateBindingAsync(999, "AD100006D9A0", CancellationToken.None);

        result.Success.Should().BeFalse();
        result.ErrorMessage.Should().Be("Job 不存在");
    }

    [Fact]
    public async Task CreateBindingAsync_RejectsWhenNoOnlineStationExists()
    {
        await using var db = CreateDbContext();
        var service = new JobLightBindingService(db, new RecordingMqttCommandPublisher(), TimeProvider.System, NullLogger<JobLightBindingService>.Instance);
        var job = await SeedJobAsync(db, "ABC123");

        var result = await service.CreateBindingAsync(job.Id, "AD100006D9A0", CancellationToken.None);

        result.Success.Should().BeFalse();
        result.ErrorMessage.Should().Be("没有在线基站");
    }

    [Fact]
    public async Task CreateBindingAsync_OverridesDuplicateActiveJobBindingByJobId()
    {
        await using var db = CreateDbContext();
        var service = new JobLightBindingService(db, new RecordingMqttCommandPublisher(), TimeProvider.System, NullLogger<JobLightBindingService>.Instance);
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

        result.Success.Should().BeTrue();
        result.Binding.Should().NotBeNull();
        result.Binding!.JobId.Should().Be(job.Id);
        result.Binding.TagId.Should().Be("AD100006D9A0");

        var rows = await db.JobLightBindings.OrderBy(x => x.Id).ToListAsync();
        rows.Should().Contain(x =>
            x.JobId == job.Id &&
            x.Status == LightBindingStatus.PendingBind &&
            x.TagId == "AD100006D9A0");
        rows.Should().Contain(x =>
            x.JobId == job.Id &&
            x.TagId == "AD1000000001" &&
            x.Status == LightBindingStatus.Unbound &&
            x.FailureReason == "已被 Job ABC123 覆盖绑定。");
    }

    [Fact]
    public async Task CreateBindingAsync_OverridesDuplicateActiveTagBinding()
    {
        await using var db = CreateDbContext();
        var service = new JobLightBindingService(db, new RecordingMqttCommandPublisher(), TimeProvider.System, NullLogger<JobLightBindingService>.Instance);
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

        result.Success.Should().BeTrue();
        result.Binding.Should().NotBeNull();
        result.Binding!.JobId.Should().Be(job.Id);
        result.Binding.TagId.Should().Be("AD100006D9A0");

        var rows = await db.JobLightBindings.OrderBy(x => x.Id).ToListAsync();
        rows.Should().Contain(x =>
            x.JobId == otherJob.Id &&
            x.Status == LightBindingStatus.Unbound &&
            x.FailureReason == "已被 Job ABC123 覆盖绑定。");
        rows.Should().Contain(x =>
            x.JobId == job.Id &&
            x.Status == LightBindingStatus.PendingBind &&
            x.TagId == "AD100006D9A0");
    }

    [Fact]
    public async Task CreateBindingAsync_WithOverrideExisting_UnboundsOldTagBinding()
    {
        await using var db = CreateDbContext();
        var service = new JobLightBindingService(db, new RecordingMqttCommandPublisher(), TimeProvider.System, NullLogger<JobLightBindingService>.Instance);
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

        var result = await service.CreateBindingAsync(job.Id, "AD100006D9A0", true, CancellationToken.None);

        result.Success.Should().BeTrue();
        var rows = await db.JobLightBindings.OrderBy(x => x.JobId).ToListAsync();
        rows.Should().Contain(x =>
            x.JobId == otherJob.Id &&
            x.Status == LightBindingStatus.Unbound &&
            x.FailureReason == "已被 Job ABC123 覆盖绑定。");
        rows.Should().Contain(x =>
            x.JobId == job.Id &&
            x.Status == LightBindingStatus.PendingBind &&
            x.TagId == "AD100006D9A0");
    }

    [Fact]
    public async Task CreateBindingAsync_WithOverrideExisting_AllowsScannedCodeWithoutTagPattern()
    {
        await using var db = CreateDbContext();
        var publisher = new RecordingMqttCommandPublisher();
        var service = new JobLightBindingService(db, publisher, TimeProvider.System, NullLogger<JobLightBindingService>.Instance);
        var job = await SeedJobAsync(db, "ABC123");
        await SeedOnlineStationAsync(db, "90A9F73014FC");

        var result = await service.CreateBindingAsync(job.Id, " scan-123 ", true, CancellationToken.None);

        result.Success.Should().BeTrue();
        result.Binding.Should().NotBeNull();
        result.Binding!.TagId.Should().Be("SCAN-123");
        publisher.Commands.Should().ContainSingle(command => command.TagIds.SequenceEqual(new[] { "SCAN-123" }));
    }

    [Fact]
    public async Task CreateManualBindingAsync_OverridesExistingActiveTagBinding()
    {
        await using var db = CreateDbContext();
        var publisher = new RecordingMqttCommandPublisher();
        var service = new JobLightBindingService(db, publisher, TimeProvider.System, NullLogger<JobLightBindingService>.Instance);
        var oldJob = await SeedJobAsync(db, "XYZ789");
        await SeedOnlineStationAsync(db, "90A9F73014FC");
        db.JobLightBindings.Add(new JobLightBinding
        {
            JobId = oldJob.Id,
            Plate = "XYZ789",
            StationId = "90A9F73014FC",
            TagId = "SCAN-123",
            GroupNo = 1,
            Status = LightBindingStatus.Bound,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();

        var result = await service.CreateManualBindingAsync("钥匙柜 A1", "scan-123", CancellationToken.None);

        result.Success.Should().BeTrue();
        result.Binding.Should().NotBeNull();
        result.Binding!.JobId.Should().BeNull();
        result.Binding.Plate.Should().Be("钥匙柜 A1");
        result.Binding.TagId.Should().Be("SCAN-123");

        var rows = await db.JobLightBindings.OrderBy(x => x.Id).ToListAsync();
        rows.Should().Contain(x =>
            x.JobId == oldJob.Id &&
            x.Status == LightBindingStatus.Unbound &&
            x.FailureReason == "已被 钥匙柜 A1 覆盖绑定。");
        rows.Should().Contain(x =>
            x.JobId == null &&
            x.Plate == "钥匙柜 A1" &&
            x.Status == LightBindingStatus.PendingBind &&
            x.TagId == "SCAN-123");
        publisher.Commands.Should().ContainSingle(command => command.TagIds.SequenceEqual(new[] { "SCAN-123" }));
    }

    [Fact]
    public async Task CreateManualBindingAsync_OverridesExistingActivePlateBinding()
    {
        await using var db = CreateDbContext();
        var publisher = new RecordingMqttCommandPublisher();
        var service = new JobLightBindingService(db, publisher, TimeProvider.System, NullLogger<JobLightBindingService>.Instance);
        await SeedOnlineStationAsync(db, "90A9F73014FC");
        db.JobLightBindings.Add(new JobLightBinding
        {
            JobId = null,
            Plate = "钥匙柜 A1",
            StationId = "90A9F73014FC",
            TagId = "SCAN-222",
            GroupNo = 7,
            Status = LightBindingStatus.Bound,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();

        var result = await service.CreateManualBindingAsync("钥匙柜 A1", "scan-123", CancellationToken.None);

        result.Success.Should().BeTrue();
        result.Binding.Should().NotBeNull();
        result.Binding!.JobId.Should().BeNull();
        result.Binding.Plate.Should().Be("钥匙柜 A1");
        result.Binding.TagId.Should().Be("SCAN-123");

        var rows = await db.JobLightBindings.OrderBy(x => x.Id).ToListAsync();
        rows.Should().Contain(x =>
            x.JobId == null &&
            x.Plate == "钥匙柜 A1" &&
            x.TagId == "SCAN-222" &&
            x.Status == LightBindingStatus.Unbound &&
            x.FailureReason == "已被 钥匙柜 A1 覆盖绑定。");
        rows.Should().Contain(x =>
            x.JobId == null &&
            x.Plate == "钥匙柜 A1" &&
            x.TagId == "SCAN-123" &&
            x.Status == LightBindingStatus.PendingBind);
        publisher.Commands.Should().ContainSingle(command => command.TagIds.SequenceEqual(new[] { "SCAN-123" }));
    }

    [Fact]
    public async Task HandleResultAsync_UpdatesPendingBindingToBound()
    {
        await using var db = CreateDbContext();
        var service = new JobLightBindingService(db, new RecordingMqttCommandPublisher(), TimeProvider.System, NullLogger<JobLightBindingService>.Instance);
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
    public async Task HandleResultAsync_LogsGroupMismatchAndLeavesBindingPending()
    {
        await using var db = CreateDbContext();
        var logger = new CapturingLogger<JobLightBindingService>();
        var service = new JobLightBindingService(db, new RecordingMqttCommandPublisher(), TimeProvider.System, logger);
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
                        Group = 127,
                    },
                ],
            },
            receivedAt,
            CancellationToken.None);

        var binding = await db.JobLightBindings.SingleAsync();
        binding.Status.Should().Be(LightBindingStatus.PendingBind);
        logger.Entries.Should().Contain(entry =>
            entry.Level == LogLevel.Warning &&
            entry.Message.Contains("group mismatch", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task GetDeviceBindingsAsync_IncludesVehicleModelAndColourForBoundJobBinding()
    {
        await using var db = CreateDbContext();
        var service = new JobLightBindingService(db, new RecordingMqttCommandPublisher(), TimeProvider.System, NullLogger<JobLightBindingService>.Instance);
        var job = await SeedJobAsync(db, "ABC123", make: "Toyota", model: "Aqua", year: 2020, colour: "Blue");
        db.JobLightBindings.Add(new JobLightBinding
        {
            JobId = job.Id,
            Plate = "ABC123",
            StationId = "90A9F73014FC",
            TagId = "AD100006D9A0",
            GroupNo = 128,
            Status = LightBindingStatus.Bound,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();

        var rows = await service.GetDeviceBindingsAsync(CancellationToken.None);

        rows.Should().ContainSingle();
        rows[0].VehicleModel.Should().Be("2020 Toyota Aqua");
        rows[0].VehicleColour.Should().Be("Blue");
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
    public void AllowManualLightBindingsMigration_IsDiscoverableByEf()
    {
        var source = File.ReadAllText(Path.Combine(
            AppContext.BaseDirectory,
            "..",
            "..",
            "..",
            "..",
            "Workshop.Api",
            "Migrations",
            "20260702090000_AllowManualLightBindings.cs"));

        source.Should().Contain("[DbContext(typeof(AppDbContext))]");
        source.Should().Contain("[Migration(\"20260702090000_AllowManualLightBindings\")]");
        source.Should().Contain("ALTER COLUMN job_id DROP NOT NULL");
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

    private static async Task<Job> SeedJobAsync(
        AppDbContext db,
        string plate,
        string? make = null,
        string? model = null,
        int? year = null,
        string? colour = null)
    {
        var vehicle = new Vehicle
        {
            Plate = plate,
            Make = make,
            Model = model,
            Year = year,
            Colour = colour,
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

    private sealed record CapturedLogEntry(LogLevel Level, string Message);

    private sealed class CapturingLogger<T> : ILogger<T>
    {
        public List<CapturedLogEntry> Entries { get; } = [];

        public IDisposable BeginScope<TState>(TState state)
            where TState : notnull
            => NullScope.Instance;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            Entries.Add(new CapturedLogEntry(logLevel, formatter(state, exception)));
        }

        private sealed class NullScope : IDisposable
        {
            public static readonly NullScope Instance = new();

            public void Dispose()
            {
            }
        }
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
