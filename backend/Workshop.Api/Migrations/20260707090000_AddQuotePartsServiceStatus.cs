using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Workshop.Api.Migrations
{
    public partial class AddQuotePartsServiceStatus : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("ALTER TYPE parts_service_status ADD VALUE IF NOT EXISTS 'quote';", suppressTransaction: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
        }
    }
}
