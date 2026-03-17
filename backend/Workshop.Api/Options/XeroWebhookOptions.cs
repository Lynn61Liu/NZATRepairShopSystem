namespace Workshop.Api.Options;

public sealed class XeroWebhookOptions
{
    public const string SectionName = "XeroWebhook";

    public bool Enabled { get; set; } = true;
    public string SigningKey { get; set; } = "";
    public bool PollingEnabled { get; set; } = true;
    public int PollIntervalMinutes { get; set; } = 10;
    public int MaxInvoicesPerCycle { get; set; } = 25;
}
