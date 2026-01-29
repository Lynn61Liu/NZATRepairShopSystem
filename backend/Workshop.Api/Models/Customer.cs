namespace Workshop.Api.Models;

public class Customer
{
    public long Id { get; set; }
    public string Type { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public string? Address { get; set; }
    public string? BusinessCode { get; set; }
    public string? Notes { get; set; }
}
