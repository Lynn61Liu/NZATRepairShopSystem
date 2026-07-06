using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Models;
using Workshop.Api.Options;
using Workshop.Api.Services;
using MsOptions = Microsoft.Extensions.Options.Options;

namespace Workshop.Api.Tests;

public sealed class JobPoStateServiceTests
{
    [Fact]
    public async Task EnsureStatesForNeedsPoJobsAsync_DoesNotCreateStateForArchivedJobs()
    {
        await using var db = CreateDb();
        var now = DateTime.UtcNow;
        db.Jobs.Add(new Job
        {
            Id = 4999,
            NeedsPo = true,
            Status = "Archived",
            CreatedAt = now,
            UpdatedAt = now,
        });
        await db.SaveChangesAsync();

        var service = CreateService(db, enabled: true);

        await service.EnsureStatesForNeedsPoJobsAsync(CancellationToken.None);

        (await db.JobPoStates.AnyAsync(x => x.JobId == 4999)).Should().BeFalse();
    }

    [Fact]
    public async Task SyncStateForJobAsync_RemovesStateForArchivedJobs()
    {
        await using var db = CreateDb();
        var now = DateTime.UtcNow;
        var correlationId = JobPoStateService.BuildCorrelationId(5000);
        db.Jobs.Add(new Job
        {
            Id = 5000,
            NeedsPo = true,
            Status = "Archived",
            CreatedAt = now,
            UpdatedAt = now,
        });
        db.JobPoStates.Add(new JobPoState
        {
            JobId = 5000,
            CorrelationId = correlationId,
            Status = JobPoStateStatus.AwaitingReply,
            FollowUpEnabled = true,
            NextFollowUpDueAt = now.AddMinutes(-10),
            CreatedAt = now,
            UpdatedAt = now,
        });
        await db.SaveChangesAsync();

        var service = CreateService(db, enabled: true);

        await service.SyncStateForJobAsync(5000, CancellationToken.None);

        (await db.JobPoStates.AnyAsync(x => x.JobId == 5000)).Should().BeFalse();
    }

    [Fact]
    public async Task SyncStateForJobAsync_DisablesExistingFollowUp_WhenGlobalFollowUpIsDisabled()
    {
        await using var db = CreateDb();
        var now = DateTime.UtcNow;
        var correlationId = JobPoStateService.BuildCorrelationId(5001);

        db.Jobs.Add(new Job
        {
            Id = 5001,
            NeedsPo = true,
            Status = "Draft",
            CreatedAt = now,
            UpdatedAt = now,
        });
        db.JobPoStates.Add(new JobPoState
        {
            JobId = 5001,
            CorrelationId = correlationId,
            Status = JobPoStateStatus.AwaitingReply,
            FollowUpEnabled = true,
            NextFollowUpDueAt = now.AddMinutes(-10),
            CreatedAt = now,
            UpdatedAt = now,
        });
        db.GmailMessageLogs.Add(new GmailMessageLog
        {
            GmailMessageId = "sent-5001",
            Direction = "sent",
            CounterpartyEmail = "supplier@example.com",
            CorrelationId = correlationId,
            InternalDateMs = new DateTimeOffset(now.AddHours(-8)).ToUnixTimeMilliseconds(),
            CreatedAt = now,
            UpdatedAt = now,
        });
        await db.SaveChangesAsync();

        var service = CreateService(db, enabled: false);

        await service.SyncStateForJobAsync(5001, CancellationToken.None);

        var state = await db.JobPoStates.SingleAsync(x => x.JobId == 5001);
        state.Status.Should().Be(JobPoStateStatus.AwaitingReply);
        state.FollowUpEnabled.Should().BeFalse();
        state.NextFollowUpDueAt.Should().BeNull();
    }

    private static AppDbContext CreateDb()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        return new AppDbContext(options);
    }

    private static JobPoStateService CreateService(AppDbContext db, bool enabled)
    {
        var options = MsOptions.Create(new PoFollowUpOptions
        {
            Enabled = enabled,
        });
        var businessHoursService = new BusinessHoursService(options);
        return new JobPoStateService(db, businessHoursService, options);
    }
}
