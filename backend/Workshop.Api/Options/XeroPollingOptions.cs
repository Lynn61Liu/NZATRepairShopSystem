namespace Workshop.Api.Options;

public sealed class XeroPollingOptions
{
    public const string SectionName = "XeroPolling";

    public bool Enabled { get; set; } = true;
    public string TimeZoneId { get; set; } = "Pacific/Auckland";
    public string[] SyncTimes { get; set; } = ["10:00", "14:00", "20:00"];
}
