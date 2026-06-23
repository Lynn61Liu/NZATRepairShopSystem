using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Workshop.Api.Migrations
{
    public partial class AddJobInvoicePdfContent : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE IF EXISTS job_invoices
                  ADD COLUMN IF NOT EXISTS pdf_content BYTEA,
                  ADD COLUMN IF NOT EXISTS pdf_preview_content BYTEA;
            """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE IF EXISTS job_invoices
                  DROP COLUMN IF EXISTS pdf_preview_content,
                  DROP COLUMN IF EXISTS pdf_content;
            """);
        }
    }
}
