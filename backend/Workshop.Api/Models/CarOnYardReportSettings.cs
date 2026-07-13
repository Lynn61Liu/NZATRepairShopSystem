namespace Workshop.Api.Models;

public class CarOnYardReportSettings
{
    public long Id { get; set; }
    public bool Enabled { get; set; } = true;
    public string Recipients { get; set; } = "info@nzautotech.co.nz";
    public string SendTimes { get; set; } = "09:30,17:30";
    public string Subject { get; set; } = "Car On Yard";
    public string TimeZoneId { get; set; } = "Pacific/Auckland";
    public string? LastSentSlotKey { get; set; }
    public DateTime? LastSentAtUtc { get; set; }
    public string? LastError { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
