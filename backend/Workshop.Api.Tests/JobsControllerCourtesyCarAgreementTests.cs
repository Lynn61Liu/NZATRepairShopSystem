using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Workshop.Api.Controllers;
using Workshop.Api.Data;
using Workshop.Api.Models;
using Workshop.Api.Services;

namespace Workshop.Api.Tests;

public sealed class JobsControllerCourtesyCarAgreementTests
{
    [Fact]
    public async Task GetById_IncludesCourtesyCarAgreementSummary()
    {
        await using var db = CreateDb();
        SeedJobGraph(db);
        SeedCourtesyCarAgreement(db);
        await db.SaveChangesAsync();

        var controller = new JobsController(
            db,
            new PassThroughAppCache(),
            null!,
            null!,
            new WofQueryService(db),
            null!);

        var result = await controller.GetById(1001, CancellationToken.None);

        var content = result.Should().BeOfType<ContentResult>().Subject.Content;
        content.Should().NotBeNullOrWhiteSpace();

        using var json = JsonDocument.Parse(content!);
        var root = json.RootElement;
        var job = root.GetProperty("job");
        job.GetProperty("id").GetString().Should().Be("1001");

        var agreement = job.GetProperty("courtesyCarAgreement");
        agreement.GetProperty("id").GetInt64().Should().Be(7001);
        agreement.GetProperty("status").GetString().Should().Be("submitted");
        agreement.GetProperty("vehiclePlate").GetString().Should().Be("LCZ123");
        agreement.GetProperty("contactName").GetString().Should().Be("Demo Driver");
        agreement.GetProperty("emailTo").GetString().Should().Be("demo.driver@example.com");
        agreement.GetProperty("pdfGeneratedAt").GetString().Should().NotBeNullOrWhiteSpace();
        agreement.GetProperty("emailSentAt").GetString().Should().NotBeNullOrWhiteSpace();
    }

    private static AppDbContext CreateDb()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;
        return new AppDbContext(options);
    }

    private static void SeedJobGraph(AppDbContext db)
    {
        db.Customers.Add(new Customer
        {
            Id = 55,
            Type = "Personal",
            Name = "Demo Driver",
            Phone = "021 555 8888",
            Email = "demo.driver@example.com",
            Address = "12 Queen Street, Auckland",
        });

        db.Vehicles.Add(new Vehicle
        {
            Id = 77,
            Plate = "ABC123",
            Make = "Mazda",
            Model = "Axela",
            CustomerId = 55,
            UpdatedAt = DateTime.UtcNow,
        });

        db.Jobs.Add(new Job
        {
            Id = 1001,
            Status = "Draft",
            IsUrgent = false,
            CustomerId = 55,
            VehicleId = 77,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
    }

    private static void SeedCourtesyCarAgreement(AppDbContext db)
    {
        db.CourtesyCarAgreements.Add(new CourtesyCarAgreement
        {
            Id = 7001,
            JobId = 1001,
            VehicleId = 9001,
            CustomerId = 55,
            Status = "submitted",
            CurrentStep = "review",
            JobVehiclePlate = "ABC123",
            JobCustomerName = "Demo Driver",
            JobCustomerPhone = "021 555 8888",
            JobCustomerEmail = "demo.driver@example.com",
            JobCustomerAddress = "12 Queen Street, Auckland",
            ContactName = "Demo Driver",
            ContactPhone = "021 555 8888",
            ContactEmail = "demo.driver@example.com",
            ContactAddress = "12 Queen Street, Auckland",
            VehiclePlate = "LCZ123",
            VehicleMake = "Toyota",
            VehicleModel = "Corolla",
            PdfGeneratedAt = DateTime.UtcNow,
            EmailSentAt = DateTime.UtcNow,
            EmailTo = "demo.driver@example.com",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
    }

    private sealed class PassThroughAppCache : IAppCache
    {
        public Task<string?> GetStringAsync(string key, CancellationToken ct = default) => Task.FromResult<string?>(null);

        public Task<T?> GetOrCreateAsync<T>(string key, TimeSpan ttl, Func<CancellationToken, Task<T?>> factory, CancellationToken ct = default) where T : class
            => factory(ct);

        public Task<string?> GetOrCreateJsonAsync(string key, TimeSpan ttl, Func<CancellationToken, Task<string?>> factory, CancellationToken ct = default)
            => factory(ct);

        public Task SetStringAsync(string key, string value, TimeSpan ttl, CancellationToken ct = default) => Task.CompletedTask;

        public Task RemoveAsync(string key, CancellationToken ct = default) => Task.CompletedTask;
    }
}
