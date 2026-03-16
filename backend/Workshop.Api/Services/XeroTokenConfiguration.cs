using Microsoft.Extensions.Options;
using Workshop.Api.Options;

namespace Workshop.Api.Services;

public sealed class XeroTokenConfiguration
{
    private readonly XeroOptions _options;

    public XeroTokenConfiguration(IOptions<XeroOptions> options)
    {
        _options = options.Value;
    }

    public string ClientId => _options.ClientId;
    public string ClientSecret => _options.ClientSecret;
    public string RedirectUri => _options.RedirectUri;
    public string Scopes => _options.Scopes;
}
