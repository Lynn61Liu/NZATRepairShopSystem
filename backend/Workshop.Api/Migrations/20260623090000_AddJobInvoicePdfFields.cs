using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Workshop.Api.Migrations
{
    public partial class AddJobInvoicePdfFields : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE IF EXISTS job_invoices
                  ADD COLUMN IF NOT EXISTS pdf_file_path TEXT,
                  ADD COLUMN IF NOT EXISTS pdf_preview_path TEXT,
                  ADD COLUMN IF NOT EXISTS pdf_downloaded_at TIMESTAMPTZ,
                  ADD COLUMN IF NOT EXISTS pdf_preview_generated_at TIMESTAMPTZ;
            """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE IF EXISTS job_invoices
                  DROP COLUMN IF EXISTS pdf_preview_generated_at,
                  DROP COLUMN IF EXISTS pdf_downloaded_at,
                  DROP COLUMN IF EXISTS pdf_preview_path,
                  DROP COLUMN IF EXISTS pdf_file_path;
            """);
        }
    }
}
