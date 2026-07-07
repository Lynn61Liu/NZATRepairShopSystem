using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Controllers;
using Workshop.Api.Data;
using Workshop.Api.Models;

namespace Workshop.Api.Tests;

public sealed class CustomerSelfServiceQuoteTagTests
{
    [Fact]
    public async Task EnsureQuoteTagAsync_CreatesQuoteTagRelationshipAndQuotePartsService()
    {
        await using var db = CreateDbContext();
        var job = new Job
        {
            Status = "InProgress",
            IsUrgent = false,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
        db.Jobs.Add(job);
        await db.SaveChangesAsync();

        await CustomerSelfServiceJobsController.EnsureQuoteTagAsync(db, job.Id, CancellationToken.None);

        var tag = await db.Tags.SingleAsync(CancellationToken.None);
        tag.Name.Should().Be("报价");
        tag.IsActive.Should().BeTrue();
        (await db.JobTags.AnyAsync(x => x.JobId == job.Id && x.TagId == tag.Id, CancellationToken.None)).Should().BeTrue();
        var partsService = await db.JobPartsServices.SingleAsync(CancellationToken.None);
        partsService.JobId.Should().Be(job.Id);
        partsService.Description.Should().Be("报价");
        partsService.Status.Should().Be(PartsServiceStatus.Quote);
    }

    [Fact]
    public async Task EnsureQuoteTagAsync_UsesQuotePartsContentAsPartsServiceDescription()
    {
        await using var db = CreateDbContext();
        var job = new Job
        {
            Status = "InProgress",
            IsUrgent = false,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
        db.Jobs.Add(job);
        await db.SaveChangesAsync();

        await CustomerSelfServiceJobsController.EnsureQuoteTagAsync(
            db,
            job.Id,
            CancellationToken.None,
            quotePartsContent: " front bumper ");

        var partsService = await db.JobPartsServices.SingleAsync(CancellationToken.None);
        partsService.Description.Should().Be("front bumper");
        partsService.Status.Should().Be(PartsServiceStatus.Quote);
    }

    [Fact]
    public async Task EnsureQuoteTagAsync_ReusesExistingQuoteTagWithoutDuplicatingRelationship()
    {
        await using var db = CreateDbContext();
        var now = DateTime.UtcNow;
        var job = new Job
        {
            Status = "InProgress",
            IsUrgent = false,
            CreatedAt = now,
            UpdatedAt = now,
        };
        var tag = new Tag
        {
            Name = "报价",
            IsActive = true,
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.Jobs.Add(job);
        db.Tags.Add(tag);
        await db.SaveChangesAsync();

        await CustomerSelfServiceJobsController.EnsureQuoteTagAsync(db, job.Id, CancellationToken.None);
        await CustomerSelfServiceJobsController.EnsureQuoteTagAsync(db, job.Id, CancellationToken.None);

        (await db.Tags.CountAsync(CancellationToken.None)).Should().Be(1);
        (await db.JobTags.CountAsync(x => x.JobId == job.Id && x.TagId == tag.Id, CancellationToken.None)).Should().Be(1);
        (await db.JobPartsServices.CountAsync(x => x.JobId == job.Id, CancellationToken.None)).Should().Be(1);
    }

    [Fact]
    public async Task ApplyQuoteEmailAsync_StoresTrimmedEmailOnExistingCustomer()
    {
        await using var db = CreateDbContext();
        var customer = new Customer
        {
            Type = "Personal",
            Name = "Jane Smith",
            Email = "old@example.com",
        };
        db.Customers.Add(customer);
        await db.SaveChangesAsync();

        await CustomerSelfServiceJobsController.ApplyQuoteEmailAsync(db, customer.Id, " quote@example.com ", CancellationToken.None);

        var updated = await db.Customers.SingleAsync(CancellationToken.None);
        updated.Email.Should().Be("quote@example.com");
    }

    private static AppDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        return new AppDbContext(options);
    }
}
