namespace Workshop.Api.Models;

public sealed class XeroTokenRecord
{
    public long Id { get; set; }
    public string Provider { get; set; } = "xero";
    public string RefreshToken { get; set; } = "";
    public string? AccessToken { get; set; }
    public DateTime? AccessTokenExpiresAt { get; set; }
    public string? Scope { get; set; }
    public string? TenantId { get; set; }
    public string? TenantName { get; set; }
    public bool IsActive { get; set; } = true;
    public bool IsDefault { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
