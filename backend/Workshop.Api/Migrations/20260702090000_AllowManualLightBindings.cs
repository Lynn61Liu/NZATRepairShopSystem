using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Workshop.Api.Data;

#nullable disable

namespace Workshop.Api.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20260702090000_AllowManualLightBindings")]
    public partial class AllowManualLightBindings : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE job_light_bindings
                    ALTER COLUMN job_id DROP NOT NULL,
                    ALTER COLUMN plate TYPE VARCHAR(128);
            """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
              
                ALTER TABLE job_light_bindings
                    ALTER COLUMN job_id SET NOT NULL,
                    ALTER COLUMN plate TYPE VARCHAR(32);
            """);
        }
    }
}
