using System.Reflection;
using FluentAssertions;
using Workshop.Api.Services;

namespace Workshop.Api.Tests;

public sealed class CourtesyCarSchemaInitializerServiceTests
{
    [Fact]
    public void BuildCourtesyCarSchemaSql_IncludesLegacyColumnBackfillStatements()
    {
        var method = typeof(CourtesyCarSchemaInitializerService)
            .GetMethod("BuildCourtesyCarSchemaSql", BindingFlags.NonPublic | BindingFlags.Static);

        method.Should().NotBeNull("the initializer should centralize the schema SQL");

        var sql = (string)method!.Invoke(null, null)!;

        sql.Should().Contain("ADD COLUMN IF NOT EXISTS loaned_at");
        sql.Should().Contain("ADD COLUMN IF NOT EXISTS borrower_name");
        sql.Should().Contain("ADD COLUMN IF NOT EXISTS borrower_phone");
        sql.Should().Contain("ADD COLUMN IF NOT EXISTS attachments_json");
    }
}
