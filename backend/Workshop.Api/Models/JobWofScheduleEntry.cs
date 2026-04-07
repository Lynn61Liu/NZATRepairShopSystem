namespace Workshop.Api.Models;

public class JobWofScheduleEntry
{
    public long Id { get; set; }
    public long? JobId { get; set; }
    public string EntryType { get; set; } = "";
    public string? PlaceholderKey { get; set; }
    public DateOnly? ScheduledDate { get; set; }
    public int? ScheduledHour { get; set; }
    public string? Rego { get; set; }
    public string? Contact { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
