namespace Workshop.Api.Models;

public class WofFailReason
{
    public long Id { get; set; }
    public string Label { get; set; } = "";
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
