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
            .FirstOrDefaultAsync(x => x.Provider == Provider, ct);

        return new XeroTokenState
        {
            Provider = Provider,
            RefreshToken = FirstNonEmpty(record?.RefreshToken, _options.RefreshToken),
            AccessToken = record?.AccessToken,
            AccessTokenExpiresAt = record?.AccessTokenExpiresAt,
            Scope = FirstNonEmpty(record?.Scope, _options.Scopes),
            TenantId = FirstNonEmpty(record?.TenantId, _options.TenantId),
            FromDatabase = record is not null,
        };
    }

    public Task SaveAuthorizationAsync(
        string refreshToken,
        string? accessToken,
        int? expiresIn,
        string? scope,
        string? tenantId,
        CancellationToken ct) =>
        UpsertAsync(refreshToken, accessToken, expiresIn, scope, tenantId, ct);

    public Task SaveRefreshResultAsync(
        string refreshToken,
        string? accessToken,
        int? expiresIn,
        string? scope,
        string? tenantId,
        CancellationToken ct) =>
        UpsertAsync(refreshToken, accessToken, expiresIn, scope, tenantId, ct);

    private async Task UpsertAsync(
        string refreshToken,
        string? accessToken,
        int? expiresIn,
        string? scope,
        string? tenantId,
        CancellationToken ct)
    {
        var record = await _db.Set<XeroTokenRecord>()
            .FirstOrDefaultAsync(x => x.Provider == Provider, ct);

        if (record is null)
        {
            record = new XeroTokenRecord
            {
                Provider = Provider,
                CreatedAt = DateTime.UtcNow,
            };
            _db.Set<XeroTokenRecord>().Add(record);
        }

        record.RefreshToken = refreshToken.Trim();
        record.AccessToken = string.IsNullOrWhiteSpace(accessToken) ? null : accessToken.Trim();
        record.AccessTokenExpiresAt = expiresIn.HasValue
            ? DateTime.UtcNow.AddSeconds(Math.Max(0, expiresIn.Value))
            : null;
        record.Scope = TrimOrNull(scope) ?? record.Scope ?? _options.Scopes;
        record.TenantId = TrimOrNull(tenantId) ?? record.TenantId ?? _options.TenantId;
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
    public string Provider { get; init; } = "xero";
    public string RefreshToken { get; init; } = "";
    public string? AccessToken { get; init; }
    public DateTime? AccessTokenExpiresAt { get; init; }
    public string? Scope { get; init; }
    public string? TenantId { get; init; }
    public bool FromDatabase { get; init; }
}
