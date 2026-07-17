namespace Workshop.Api.Options;

public sealed class NztaBrowserOptions
{
    public const string SectionName = "NztaBrowser";

    public string BrowserProfilePath { get; set; } = "~/.nzat-nzta-browser";
    public int TimeoutSeconds { get; set; } = 240;
}
