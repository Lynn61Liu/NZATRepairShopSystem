using Npgsql;

namespace CarjamImporter.Infrastructure;

public sealed class DbConnectionFactory
{
    private readonly string _connStr;

    public DbConnectionFactory(string connStr)
    {
        _connStr = connStr;
    }

    public NpgsqlConnection Create() => new NpgsqlConnection(_connStr);
}
