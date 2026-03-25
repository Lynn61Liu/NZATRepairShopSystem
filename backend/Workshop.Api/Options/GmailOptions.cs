namespace Workshop.Api.Options;

public sealed class GmailOptions
{
    public const string SectionName = "Gmail";

    public string ClientId { get; set; } = "";
    public string ClientSecret { get; set; } = "";
    public string RedirectUri { get; set; } = "";
    public string Scopes { get; set; } =
        "openid email https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly";
}
