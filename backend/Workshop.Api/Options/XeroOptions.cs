namespace Workshop.Api.Options;

public sealed class XeroOptions
{
    public const string SectionName = "Xero";

    public string ClientId { get; set; } = "";
    public string ClientSecret { get; set; } = "";
    public string RedirectUri { get; set; } = "";
    public string Scopes { get; set; } =
        "offline_access accounting.transactions";
}
