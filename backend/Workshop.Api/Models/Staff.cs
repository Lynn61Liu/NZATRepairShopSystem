namespace Workshop.Api.Models;

public class Staff
{
    public long Id { get; set; }
    public string Name { get; set; } = "";
    public decimal CostRate { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
