using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using MsOptions = Microsoft.Extensions.Options.Options;
using Workshop.Api.Data;
using Workshop.Api.Models;
using Workshop.Api.Options;
using Workshop.Api.Services;

namespace Workshop.Api.Tests;

public sealed class PartsServicesServiceTests
{
    [Fact]
    public async Task GetPartFlow_ExcludesArchivedJobs()
    {
        await using var db = CreateDbContext();
        var activeJob = SeedJob(db, "Open");
        var archivedJob = SeedJob(db, "Archived");
        SeedPartsService(db, activeJob.Id, "active bumper", PartsServiceStatus.PendingOrder);
        SeedPartsService(db, archivedJob.Id, "archived mirror", PartsServiceStatus.NeedsPt);
        await db.SaveChangesAsync();
        var service = CreateService(db);

        var result = await service.GetPartFlow(CancellationToken.None);

        result.StatusCode.Should().Be(200);
        result.Payload.Should().BeAssignableTo<IEnumerable<object>>();
        var payload = result.Payload.As<IEnumerable<object>>().ToList();
        payload.Should().ContainSingle();
        payload[0].Should().BeEquivalentTo(new { jobId = activeJob.Id.ToString() });
    }

    [Fact]
    public async Task GetPartFlow_IncludesActiveJobTags()
    {
        await using var db = CreateDbContext();
        var job = SeedJob(db, "Open");
        SeedPartsService(db, job.Id, "front bumper", PartsServiceStatus.PendingOrder);
        var quoteTag = SeedTag(db, "报价", isActive: true);
        var inactiveTag = SeedTag(db, "Hidden", isActive: false);
        db.JobTags.Add(new JobTag { JobId = job.Id, TagId = quoteTag.Id, CreatedAt = DateTime.UtcNow });
        db.JobTags.Add(new JobTag { JobId = job.Id, TagId = inactiveTag.Id, CreatedAt = DateTime.UtcNow });
        await db.SaveChangesAsync();
        var service = CreateService(db);

        var result = await service.GetPartFlow(CancellationToken.None);

        result.StatusCode.Should().Be(200);
        var payload = result.Payload.Should().BeAssignableTo<IEnumerable<object>>().Subject.ToList();
        payload.Should().ContainSingle();
        payload[0].Should().BeEquivalentTo(new { tags = new[] { "报价" } });
    }

    private static AppDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        return new AppDbContext(options);
    }

    private static PartsServicesService CreateService(AppDbContext db)
    {
        var gmailOptions = MsOptions.Create(new GmailOptions
        {
            ClientId = "client-id",
            ClientSecret = "client-secret",
            Scopes = "https://www.googleapis.com/auth/gmail.send",
        });
        var httpClientFactory = new ThrowingHttpClientFactory();
        var gmailAccountService = new GmailAccountService(db);
        var tokenService = new GmailTokenService(httpClientFactory, gmailOptions, gmailAccountService);
        var businessHoursService = new BusinessHoursService(MsOptions.Create(new PoFollowUpOptions()));
        var jobPoStateService = new JobPoStateService(db, businessHoursService, MsOptions.Create(new PoFollowUpOptions()));
        var gmailSender = new GmailMessageSenderService(db, httpClientFactory, gmailOptions, tokenService, jobPoStateService);

        return new PartsServicesService(db, gmailSender);
    }

    private static Job SeedJob(AppDbContext db, string status)
    {
        var job = new Job
        {
            Status = status,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
        db.Jobs.Add(job);
        return job;
    }

    private static void SeedPartsService(
        AppDbContext db,
        long jobId,
        string description,
        PartsServiceStatus status)
    {
        db.JobPartsServices.Add(new JobPartsService
        {
            JobId = jobId,
            Description = description,
            Status = status,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
    }

    private static Tag SeedTag(AppDbContext db, string name, bool isActive)
    {
        var tag = new Tag
        {
            Name = name,
            IsActive = isActive,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
        db.Tags.Add(tag);
        db.SaveChanges();
        return tag;
    }

    private sealed class ThrowingHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(new ThrowingHttpMessageHandler());
    }

    private sealed class ThrowingHttpMessageHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            throw new InvalidOperationException("HTTP should not be used by this test.");
        }
    }
}
