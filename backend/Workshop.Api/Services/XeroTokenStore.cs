using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Workshop.Api.Data;
using Workshop.Api.Models;
using Workshop.Api.Options;

namespace Workshop.Api.Services;

public sealed class XeroTokenStore
{
    private const string Provider = "xero";

    private readonly AppDbContext _db;
    private readonly XeroOptions _options;

    public XeroTokenStore(AppDbContext db, IOptions<XeroOptions> options)
    {
        _db = db;
        _options = options.Value;
    }

    public async Task<XeroTokenState> GetEffectiveAsync(CancellationToken ct)
    {
        var record = await _db.Set<XeroTokenRecord>()
            .AsNoTracking()
            .Where(x => x.Provider == Provider && x.IsActive)
            .OrderByDescending(x => x.IsDefault)
            .ThenBy(x => x.Id)
            .FirstOrDefaultAsync(ct);

        return new XeroTokenState
        {
            RecordId = record?.Id,
            Provider = Provider,
            RefreshToken = record?.RefreshToken?.Trim() ?? "",
            AccessToken = record?.AccessToken,
            AccessTokenExpiresAt = record?.AccessTokenExpiresAt,
            Scope = FirstNonEmpty(record?.Scope, _options.Scopes),
            TenantId = TrimOrNull(record?.TenantId),
            TenantName = TrimOrNull(record?.TenantName),
            FromDatabase = record is not null,
        };
    }

    public Task<List<XeroTokenRecord>> GetAccountsAsync(CancellationToken ct) =>
        _db.Set<XeroTokenRecord>()
            .AsNoTracking()
            .Where(x => x.Provider == Provider)
            .OrderByDescending(x => x.IsDefault)
            .ThenByDescending(x => x.IsActive)
            .ThenBy(x => x.TenantName ?? x.TenantId ?? "")
            .ToListAsync(ct);

    public async Task<bool> SetDefaultAccountAsync(long id, CancellationToken ct)
    {
        var account = await _db.Set<XeroTokenRecord>()
            .FirstOrDefaultAsync(x => x.Id == id && x.Provider == Provider, ct);
        if (account is null)
            return false;

        var now = DateTime.UtcNow;
        var accounts = await _db.Set<XeroTokenRecord>()
            .Where(x => x.Provider == Provider)
            .ToListAsync(ct);

        foreach (var item in accounts)
        {
            item.IsDefault = item.Id == id;
            if (item.Id == id)
                item.IsActive = true;
            item.UpdatedAt = now;
        }

        await _db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<bool> DisableAccountAsync(long id, CancellationToken ct)
    {
        var account = await _db.Set<XeroTokenRecord>()
            .FirstOrDefaultAsync(x => x.Id == id && x.Provider == Provider, ct);
        if (account is null)
            return false;

        var accounts = await _db.Set<XeroTokenRecord>()
            .Where(x => x.Provider == Provider)
            .OrderBy(x => x.Id)
            .ToListAsync(ct);

        var otherActive = accounts
            .Where(x => x.Id != id && x.IsActive)
            .ToList();

        account.IsActive = false;
        account.IsDefault = false;
        account.UpdatedAt = DateTime.UtcNow;

        var nextDefault = otherActive.FirstOrDefault();
        if (nextDefault is not null)
        {
            nextDefault.IsDefault = true;
            nextDefault.UpdatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync(ct);
        return true;
    }

    public Task SaveAuthorizationAsync(
        string refreshToken,
        string? accessToken,
        int? expiresIn,
        string? scope,
        string? tenantId,
        string? tenantName,
        CancellationToken ct) =>
        UpsertAsync(recordId: null, refreshToken, accessToken, expiresIn, scope, tenantId, tenantName, ct);

    public Task SaveRefreshResultAsync(
        long? recordId,
        string refreshToken,
        string? accessToken,
        int? expiresIn,
        string? scope,
        string? tenantId,
        string? tenantName,
        CancellationToken ct) =>
        UpsertAsync(recordId, refreshToken, accessToken, expiresIn, scope, tenantId, tenantName, ct);

    private async Task UpsertAsync(
        long? recordId,
        string refreshToken,
        string? accessToken,
        int? expiresIn,
        string? scope,
        string? tenantId,
        string? tenantName,
        CancellationToken ct)
    {
        var normalizedTenantId = TrimOrNull(tenantId);
        var normalizedTenantName = TrimOrNull(tenantName);
        XeroTokenRecord? record = null;

        if (recordId.HasValue)
        {
            record = await _db.Set<XeroTokenRecord>()
                .FirstOrDefaultAsync(x => x.Id == recordId.Value && x.Provider == Provider, ct);
        }

        if (record is null && normalizedTenantId is not null)
        {
            record = await _db.Set<XeroTokenRecord>()
                .FirstOrDefaultAsync(x => x.Provider == Provider && x.TenantId == normalizedTenantId, ct);
        }

        var hasDefault = await _db.Set<XeroTokenRecord>()
            .AnyAsync(x => x.Provider == Provider && x.IsDefault, ct);

        if (record is null)
        {
            record = new XeroTokenRecord
            {
                Provider = Provider,
                CreatedAt = DateTime.UtcNow,
                IsActive = true,
                IsDefault = !hasDefault,
            };
            _db.Set<XeroTokenRecord>().Add(record);
        }

        record.RefreshToken = refreshToken.Trim();
        record.AccessToken = string.IsNullOrWhiteSpace(accessToken) ? null : accessToken.Trim();
        record.AccessTokenExpiresAt = expiresIn.HasValue
            ? DateTime.UtcNow.AddSeconds(Math.Max(0, expiresIn.Value))
            : null;
        record.Scope = TrimOrNull(scope) ?? record.Scope ?? _options.Scopes;
        record.TenantId = normalizedTenantId ?? record.TenantId;
        record.TenantName = normalizedTenantName ?? record.TenantName;
        record.IsActive = true;
        if (!hasDefault)
            record.IsDefault = true;
        record.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);
    }

    private static string FirstNonEmpty(string? primary, string? fallback) =>
        !string.IsNullOrWhiteSpace(primary) ? primary.Trim() : (fallback ?? "").Trim();

    private static string? TrimOrNull(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }
}

public sealed class XeroTokenState
{
    public long? RecordId { get; init; }
    public string Provider { get; init; } = "xero";
    public string RefreshToken { get; init; } = "";
    public string? AccessToken { get; init; }
    public DateTime? AccessTokenExpiresAt { get; init; }
    public string? Scope { get; init; }
    public string? TenantId { get; init; }
    public string? TenantName { get; init; }
    public bool FromDatabase { get; init; }
}
