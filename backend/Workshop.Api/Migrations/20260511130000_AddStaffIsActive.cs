using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Workshop.Api.Migrations
{
    public partial class AddStaffIsActive : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE staff
                ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

                UPDATE staff
                SET is_active = true
                WHERE is_active IS NULL;
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE staff
                DROP COLUMN IF EXISTS is_active;
                """);
        }
    }
}
