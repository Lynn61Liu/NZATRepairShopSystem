using CarjamImporter;
using Microsoft.Extensions.Configuration;

namespace CarjamImporter.Infrastructure;

public sealed class AppConfig
{
    private readonly IConfiguration _config;

    private AppConfig(IConfiguration config)
    {
        _config = config;
    }

    public static AppConfig Load(string basePath)
    {
        var config = new ConfigurationBuilder()
            .SetBasePath(basePath)
            .AddJsonFile("appsettings.json", optional: true, reloadOnChange: false)
            .AddUserSecrets<Program>(optional: true)
            .AddEnvironmentVariables()
            .Build();

        return new AppConfig(config);
    }

    public string? GetConnectionString(string name) => _config.GetConnectionString(name);
}
