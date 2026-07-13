namespace Workshop.Api.Options;

public sealed class PaymarkOptions
{
    public const string SectionName = "Paymark";

    public string CardAcceptorIdCode { get; set; } = "10243212";
    public string BrowserProfilePath { get; set; } = "~/.nzat-paymark-browser";
    public string InsightsBaseUrl { get; set; } = "https://insights.paymark.co.nz";
    public string ApiBaseUrl { get; set; } = "https://api.paymark.nz";
    public bool Headless { get; set; } = false;
    public int LoginWaitSeconds { get; set; } = 600;
}
