using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Workshop.Api.Migrations
{
    public partial class AddGmailDraftIdToJobPoState : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE job_po_state
                ADD COLUMN IF NOT EXISTS gmail_draft_id text;

                ALTER TABLE job_po_state
                ADD COLUMN IF NOT EXISTS gmail_draft_updated_at timestamp with time zone;
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE job_po_state
                DROP COLUMN IF EXISTS gmail_draft_updated_at;

                ALTER TABLE job_po_state
                DROP COLUMN IF EXISTS gmail_draft_id;
                """);
        }
    }
}
