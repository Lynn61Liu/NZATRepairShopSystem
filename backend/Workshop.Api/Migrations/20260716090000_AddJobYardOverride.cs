using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Workshop.Api.Data;

#nullable disable

namespace Workshop.Api.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260716090000_AddJobYardOverride")]
public partial class AddJobYardOverride : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(
            """
            ALTER TABLE jobs
            ADD COLUMN IF NOT EXISTS is_on_yard_override boolean;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(
            """
            ALTER TABLE jobs
            DROP COLUMN IF EXISTS is_on_yard_override;
            """);
    }
}
