using Microsoft.EntityFrameworkCore;
using Workshop.Api.Data;
using Workshop.Api.Models;

namespace Workshop.Api.Services;

public sealed class GmailAccountService
{
    private readonly AppDbContext _db;

    public GmailAccountService(AppDbContext db)
    {
        _db = db;
    }

    public Task<List<GmailAccount>> GetAccountsAsync(CancellationToken ct) =>
        _db.GmailAccounts.AsNoTracking()
            .OrderByDescending(x => x.IsDefault)
            .ThenBy(x => x.Email)
            .ToListAsync(ct);

    public Task<GmailAccount?> GetByIdAsync(long id, CancellationToken ct) =>
        _db.GmailAccounts.FirstOrDefaultAsync(x => x.Id == id, ct);

    public Task<GmailAccount?> GetEffectiveAccountAsync(CancellationToken ct) =>
        _db.GmailAccounts.AsNoTracking()
            .Where(x => x.IsActive)
            .OrderByDescending(x => x.IsDefault)
            .ThenBy(x => x.Id)
            .FirstOrDefaultAsync(ct);

    public async Task<GmailAccount> UpsertAuthorizedAccountAsync(
        string email,
        string refreshToken,
        string? accessToken,
        int? expiresIn,
        string? scope,
        CancellationToken ct)
    {
        var normalizedEmail = email.Trim();
        var account = await _db.GmailAccounts.FirstOrDefaultAsync(
            x => x.Email.ToLower() == normalizedEmail.ToLower(),
            ct);

        var now = DateTime.UtcNow;
        var hasDefault = await _db.GmailAccounts.AnyAsync(x => x.IsDefault, ct);

        if (account is null)
        {
            account = new GmailAccount
            {
                Email = normalizedEmail,
                CreatedAt = now,
                IsActive = true,
                IsDefault = !hasDefault,
            };
            _db.GmailAccounts.Add(account);
        }

        account.Email = normalizedEmail;
        account.RefreshToken = refreshToken.Trim();
        account.AccessToken = string.IsNullOrWhiteSpace(accessToken) ? null : accessToken.Trim();
        account.AccessTokenExpiresAt = expiresIn.HasValue ? now.AddSeconds(Math.Max(1, expiresIn.Value)) : account.AccessTokenExpiresAt;
        account.Scope = string.IsNullOrWhiteSpace(scope) ? account.Scope : scope.Trim();
        account.IsActive = true;
        account.UpdatedAt = now;

        if (!hasDefault)
            account.IsDefault = true;

        await _db.SaveChangesAsync(ct);
        return account;
    }

    public async Task<bool> SetDefaultAccountAsync(long id, CancellationToken ct)
    {
        var account = await _db.GmailAccounts.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (account is null)
            return false;

        var accounts = await _db.GmailAccounts.ToListAsync(ct);
        var now = DateTime.UtcNow;
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
        var account = await _db.GmailAccounts.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (account is null)
            return false;

        var accounts = await _db.GmailAccounts
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

    public async Task TouchAccessTokenAsync(long id, string? accessToken, int? expiresIn, string? scope, CancellationToken ct)
    {
        var account = await _db.GmailAccounts.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (account is null)
            return;

        account.AccessToken = string.IsNullOrWhiteSpace(accessToken) ? null : accessToken.Trim();
        account.AccessTokenExpiresAt = expiresIn.HasValue ? DateTime.UtcNow.AddSeconds(Math.Max(1, expiresIn.Value)) : account.AccessTokenExpiresAt;
        account.Scope = string.IsNullOrWhiteSpace(scope) ? account.Scope : scope.Trim();
        account.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
    }
}
