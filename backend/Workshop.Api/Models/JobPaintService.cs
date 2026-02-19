namespace Workshop.Api.Models;

public class JobPaintService
{
    public long Id { get; set; }
    public long JobId { get; set; }
    public string Status { get; set; } = "pending";
    public int CurrentStage { get; set; } = -1;
    public int Panels { get; set; } = 1;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
