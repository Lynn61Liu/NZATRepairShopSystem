namespace Workshop.Api.Models;

public class GmailAccount
{
    public long Id { get; set; }
    public string Email { get; set; } = "";
    public string RefreshToken { get; set; } = "";
    public string? AccessToken { get; set; }
    public DateTime? AccessTokenExpiresAt { get; set; }
    public string? Scope { get; set; }
    public bool IsActive { get; set; } = true;
    public bool IsDefault { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
