namespace Workshop.Api.Models;

public class JobMechService
{
    public long Id { get; set; }
    public long JobId { get; set; }
    public string Description { get; set; } = "";
    public decimal? Cost { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
