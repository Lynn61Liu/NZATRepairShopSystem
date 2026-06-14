using System.Reflection;
using System.Runtime.Serialization;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Workshop.Api.Data;
using Workshop.Api.DTOs;
using Workshop.Api.Services;

public class JobInvoiceServiceSanitizeTests
{
    [Fact]
    public async Task SanitizeLineItemsAsync_PreservesExplicitItemCode_WhenInventoryIsMissing()
    {
        var service = CreateServiceWithEmptyInventory();
        var method = typeof(JobInvoiceService).GetMethod(
            "SanitizeLineItemsAsync",
            BindingFlags.NonPublic | BindingFlags.Instance);

        method.Should().NotBeNull();

        var input = new List<XeroInvoiceLineItemInput>
        {
            new()
            {
                Description = "机修",
                ItemCode = "666WORSHOP Labour Fee",
                Quantity = 1m,
                UnitAmount = 0m,
            }
        };

        var task = (Task<List<XeroInvoiceLineItemInput>>)method!.Invoke(
            service,
            new object?[] { input, CancellationToken.None, null })!;

        var result = await task;

        result.Should().ContainSingle();
        result.Single().ItemCode.Should().Be("666WORSHOP Labour Fee");
    }

    private static JobInvoiceService CreateServiceWithEmptyInventory()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        var db = new TestAppDbContext(options);
        var cache = new FakeAppCache();
        var referenceDataCache = new ReferenceDataCacheService(db, cache);

        var service = (JobInvoiceService)FormatterServices.GetUninitializedObject(typeof(JobInvoiceService));
        SetField(service, "_referenceDataCache", referenceDataCache);
        SetField(service, "_logger", NullLogger<JobInvoiceService>.Instance);
        return service;
    }

    private static void SetField<T>(object instance, string fieldName, T value)
    {
        var field = instance.GetType().GetField(fieldName, BindingFlags.Instance | BindingFlags.NonPublic);
        field.Should().NotBeNull($"field {fieldName} should exist");
        field!.SetValue(instance, value);
    }

    private sealed class FakeAppCache : IAppCache
    {
        public Task<string?> GetStringAsync(string key, CancellationToken ct = default)
            => Task.FromResult<string?>(null);

        public Task<T?> GetOrCreateAsync<T>(
            string key,
            TimeSpan ttl,
            Func<CancellationToken, Task<T?>> factory,
            CancellationToken ct = default) where T : class
            => factory(ct);

        public Task<string?> GetOrCreateJsonAsync(
            string key,
            TimeSpan ttl,
            Func<CancellationToken, Task<string?>> factory,
            CancellationToken ct = default)
            => factory(ct);

        public Task SetStringAsync(string key, string value, TimeSpan ttl, CancellationToken ct = default)
            => Task.CompletedTask;

        public Task RemoveAsync(string key, CancellationToken ct = default)
            => Task.CompletedTask;
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
