using System.Reflection;
using System.Runtime.Serialization;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Workshop.Api.Data;
using Workshop.Api.Models;
using Workshop.Api.Services;

public class JobInvoiceServicePdfStorageTests
{
    [Fact]
    public async Task GetPdfAsync_ReturnsPdfBytes_FromDatabaseEvenWhenFileIsMissing()
    {
        var service = CreateService();
        var db = GetDb(service);

        var expected = new byte[] { 37, 80, 68, 70, 45, 49, 46, 52 };
        db.JobInvoices.Add(new JobInvoice
        {
            JobId = 42,
            Provider = "xero",
            ExternalInvoiceId = Guid.NewGuid().ToString(),
            PdfContent = expected,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();

        var result = await service.GetPdfAsync(42, CancellationToken.None);

        result.Should().NotBeNull();
        result!.ContentType.Should().Be("application/pdf");
        result.Bytes.Should().Equal(expected);
    }

    [Fact]
    public async Task GetPdfPreviewAsync_ReturnsPreviewBytes_FromDatabaseEvenWhenFileIsMissing()
    {
        var service = CreateService();
        var db = GetDb(service);

        var expected = new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 };
        db.JobInvoices.Add(new JobInvoice
        {
            JobId = 43,
            Provider = "xero",
            ExternalInvoiceId = Guid.NewGuid().ToString(),
            PdfPreviewContent = expected,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();

        var result = await service.GetPdfPreviewAsync(43, CancellationToken.None);

        result.Should().NotBeNull();
        result!.ContentType.Should().Be("image/png");
        result.Bytes.Should().Equal(expected);
    }

    private static JobInvoiceService CreateService()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        var db = new TestAppDbContext(options);
        var service = (JobInvoiceService)FormatterServices.GetUninitializedObject(typeof(JobInvoiceService));
        SetField(service, "_db", db);
        SetField(service, "_logger", NullLogger<JobInvoiceService>.Instance);
        return service;
    }

    private static TestAppDbContext GetDb(JobInvoiceService service)
        => (TestAppDbContext)typeof(JobInvoiceService)
            .GetField("_db", BindingFlags.Instance | BindingFlags.NonPublic)!
            .GetValue(service)!;

    private static void SetField<T>(object instance, string fieldName, T value)
    {
        var field = instance.GetType().GetField(fieldName, BindingFlags.Instance | BindingFlags.NonPublic);
        field.Should().NotBeNull($"field {fieldName} should exist");
        field!.SetValue(instance, value);
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
            modelBuilder.Entity<Workshop.Api.Models.Vehicle>().Ignore(x => x.RawJson);
        }
    }
}
