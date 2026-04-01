namespace Workshop.Api.Models;

public class JobWofState
{
    public long Id { get; set; }
    public long JobId { get; set; }
    public string? ManualStatus { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
