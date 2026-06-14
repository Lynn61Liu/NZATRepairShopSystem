using Microsoft.EntityFrameworkCore;
using FluentAssertions;
using Workshop.Api.Data;
using Workshop.Api.Models;
using Workshop.Api.Services;

public class ServiceCatalogServiceTests
{
    [Fact]
    public async Task EnsureSeededAsync_UpdatesExistingRootRows_ToCanonicalLinkCodes()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        await using var db = new TestAppDbContext(options);
        db.ServiceCatalogItems.AddRange(
            new ServiceCatalogItem
            {
                ServiceType = "mech",
                Category = "root",
                Name = "旧机修",
                PersonalLinkCode = "old-personal",
                DealershipLinkCode = "old-dealership",
                IsActive = false,
                SortOrder = 9,
                CreatedAt = DateTime.UtcNow.AddDays(-1),
                UpdatedAt = DateTime.UtcNow.AddDays(-1),
            },
            new ServiceCatalogItem
            {
                ServiceType = "mech",
                Category = "child",
                Name = "换机油",
                IsActive = true,
                SortOrder = 1,
                CreatedAt = DateTime.UtcNow.AddDays(-1),
                UpdatedAt = DateTime.UtcNow.AddDays(-1),
            });
        await db.SaveChangesAsync();

        var cache = new FakeAppCache();
        var referenceDataCache = new ReferenceDataCacheService(db, cache);
        var service = new ServiceCatalogService(db, referenceDataCache);

        await service.EnsureSeededAsync(CancellationToken.None);

        var mechRoots = await db.ServiceCatalogItems
            .Where(x => x.Category == "root" && x.ServiceType == "mech")
            .OrderBy(x => x.Id)
            .ToListAsync();

        mechRoots.Should().ContainSingle();
        var mechRoot = mechRoots.Single();
        mechRoot.Name.Should().Be("机修");
        mechRoot.PersonalLinkCode.Should().Be("666WORSHOP Labour Fee");
        mechRoot.DealershipLinkCode.Should().Be("666WORSHOP Labour Fee");
        mechRoot.IsActive.Should().BeTrue();
        mechRoot.SortOrder.Should().Be(1);

        var child = await db.ServiceCatalogItems.SingleAsync(x => x.Category == "child" && x.ServiceType == "mech");
        child.Name.Should().Be("换机油");
        child.SortOrder.Should().Be(1);

        cache.RemovedKeys.Should().Equal("ref-data:service-catalog:all:v1");
    }

    [Fact]
    public async Task ResolveActiveRootServiceIdAsync_PrefersMatchingPersonalLinkCode()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;

        await using var db = new TestAppDbContext(options);
        db.ServiceCatalogItems.AddRange(
            new ServiceCatalogItem
            {
                ServiceType = "mech",
                Category = "root",
                Name = "旧机修",
                PersonalLinkCode = "203-Services",
                DealershipLinkCode = "203-Services",
                IsActive = true,
                SortOrder = 0,
                CreatedAt = DateTime.UtcNow.AddDays(-1),
                UpdatedAt = DateTime.UtcNow.AddDays(-1),
            },
            new ServiceCatalogItem
            {
                ServiceType = "mech",
                Category = "root",
                Name = "机修",
                PersonalLinkCode = "666WORSHOP Labour Fee",
                DealershipLinkCode = "666WORSHOP Labour Fee",
                IsActive = true,
                SortOrder = 1,
                CreatedAt = DateTime.UtcNow.AddDays(-1),
                UpdatedAt = DateTime.UtcNow.AddDays(-1),
            });
        await db.SaveChangesAsync();

        var cache = new FakeAppCache();
        var referenceDataCache = new ReferenceDataCacheService(db, cache);
        var service = new ServiceCatalogService(db, referenceDataCache);

        var resolvedId = await service.ResolveActiveRootServiceIdAsync(
            "mech",
            "666WORSHOP Labour Fee",
            CancellationToken.None);

        var resolved = await db.ServiceCatalogItems.SingleAsync(x => x.Id == resolvedId);
        resolved.PersonalLinkCode.Should().Be("666WORSHOP Labour Fee");
    }

    private sealed class FakeAppCache : IAppCache
    {
        public List<string> RemovedKeys { get; } = [];

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
        {
            RemovedKeys.Add(key);
            return Task.CompletedTask;
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
