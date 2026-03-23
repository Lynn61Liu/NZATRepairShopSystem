namespace Workshop.Api.Models;

public class SystemSyncState
{
    public long Id { get; set; }
    public string SyncKey { get; set; } = "";
    public DateTime? LastSyncedAt { get; set; }
    public string? LastResult { get; set; }
    public string? LastError { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
