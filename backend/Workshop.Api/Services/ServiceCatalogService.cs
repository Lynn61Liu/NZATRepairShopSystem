using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Models;

namespace Workshop.Api.Services;

public class ServiceCatalogService
{
    private sealed record RootSeed(
        string ServiceType,
        string Name,
        string? PersonalLinkCode,
        string? DealershipLinkCode,
        int SortOrder);

    private static readonly RootSeed[] DefaultRootSeeds =
    [
        new("wof", "WOF", "208-WOF", "WOF-DEALERSHIP", 0),
        new("mech", "机修", "666WORSHOP Labour Fee", "666WORSHOP Labour Fee", 1),
        new("paint", "喷漆", "206-PNP-L", "206-PNP-L", 2),
    ];

    private readonly AppDbContext _db;
    private readonly ReferenceDataCacheService _referenceDataCache;

    public ServiceCatalogService(AppDbContext db, ReferenceDataCacheService referenceDataCache)
    {
        _db = db;
        _referenceDataCache = referenceDataCache;
    }

    public async Task EnsureSeededAsync(CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var changed = false;

        foreach (var seed in DefaultRootSeeds)
        {
            var existingRoots = await _db.ServiceCatalogItems
                .Where(x => x.Category == "root" && x.ServiceType == seed.ServiceType)
                .OrderBy(x => x.SortOrder)
                .ThenBy(x => x.Id)
                .ToListAsync(ct);

            if (existingRoots.Count == 0)
            {
                _db.ServiceCatalogItems.Add(new ServiceCatalogItem
                {
                    ServiceType = seed.ServiceType,
                    Category = "root",
                    Name = seed.Name,
                    PersonalLinkCode = seed.PersonalLinkCode,
                    DealershipLinkCode = seed.DealershipLinkCode,
                    IsActive = true,
                    SortOrder = seed.SortOrder,
                    CreatedAt = now,
                    UpdatedAt = now,
                });
                changed = true;
                continue;
            }

            foreach (var row in existingRoots)
            {
                var rowChanged = false;

                if (!string.Equals(row.ServiceType, seed.ServiceType, StringComparison.OrdinalIgnoreCase))
                {
                    row.ServiceType = seed.ServiceType;
                    rowChanged = true;
                }

                if (!string.Equals(row.Category, "root", StringComparison.OrdinalIgnoreCase))
                {
                    row.Category = "root";
                    rowChanged = true;
                }

                if (!string.Equals(row.Name, seed.Name, StringComparison.Ordinal))
                {
                    row.Name = seed.Name;
                    rowChanged = true;
                }

                if (!string.Equals(row.PersonalLinkCode, seed.PersonalLinkCode, StringComparison.Ordinal))
                {
                    row.PersonalLinkCode = seed.PersonalLinkCode;
                    rowChanged = true;
                }

                if (!string.Equals(row.DealershipLinkCode, seed.DealershipLinkCode, StringComparison.Ordinal))
                {
                    row.DealershipLinkCode = seed.DealershipLinkCode;
                    rowChanged = true;
                }

                if (!row.IsActive)
                {
                    row.IsActive = true;
                    rowChanged = true;
                }

                if (row.SortOrder != seed.SortOrder)
                {
                    row.SortOrder = seed.SortOrder;
                    rowChanged = true;
                }

                if (rowChanged)
                {
                    row.UpdatedAt = now;
                    changed = true;
                }
            }
        }

        if (changed)
        {
            await _db.SaveChangesAsync(ct);
            await _referenceDataCache.InvalidateServiceCatalogAsync(ct);
        }
    }

    public async Task<long> ResolveActiveRootServiceIdAsync(
        string serviceType,
        string? preferredPersonalLinkCode,
        CancellationToken ct)
    {
        var rows = await _referenceDataCache.GetServiceCatalogItemsAsync(ct);
        var activeRoots = rows
            .Where(x =>
                x.IsActive &&
                string.Equals(x.Category, "root", StringComparison.OrdinalIgnoreCase) &&
                string.Equals(x.ServiceType, serviceType, StringComparison.OrdinalIgnoreCase))
            .OrderBy(x => x.SortOrder)
            .ThenBy(x => x.Id)
            .ToList();

        if (!string.IsNullOrWhiteSpace(preferredPersonalLinkCode))
        {
            var preferred = activeRoots.FirstOrDefault(x =>
                string.Equals(
                    x.PersonalLinkCode?.Trim(),
                    preferredPersonalLinkCode.Trim(),
                    StringComparison.OrdinalIgnoreCase) ||
                string.Equals(
                    x.DealershipLinkCode?.Trim(),
                    preferredPersonalLinkCode.Trim(),
                    StringComparison.OrdinalIgnoreCase));

            if (preferred is not null)
                return preferred.Id;
        }

        var item = activeRoots.FirstOrDefault();
        if (item is null)
            throw new InvalidOperationException($"Active root service '{serviceType}' was not found.");

        return item.Id;
    }
}
