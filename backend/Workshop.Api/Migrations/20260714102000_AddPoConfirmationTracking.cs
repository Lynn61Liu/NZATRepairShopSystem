using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Workshop.Api.Data;

#nullable disable

namespace Workshop.Api.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260714102000_AddPoConfirmationTracking")]
public partial class AddPoConfirmationTracking : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(name: "pending_po_number", table: "job_po_state", type: "text", nullable: true);
        migrationBuilder.AddColumn<string>(name: "confirmation_status", table: "job_po_state", type: "text", nullable: true);
        migrationBuilder.AddColumn<string>(name: "confirmation_note", table: "job_po_state", type: "text", nullable: true);
        migrationBuilder.AddColumn<DateTime>(name: "confirmation_last_attempt_at", table: "job_po_state", type: "timestamp with time zone", nullable: true);
        migrationBuilder.AddColumn<DateTime>(name: "xero_email_sent_at", table: "job_po_state", type: "timestamp with time zone", nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "pending_po_number", table: "job_po_state");
        migrationBuilder.DropColumn(name: "confirmation_status", table: "job_po_state");
        migrationBuilder.DropColumn(name: "confirmation_note", table: "job_po_state");
        migrationBuilder.DropColumn(name: "confirmation_last_attempt_at", table: "job_po_state");
        migrationBuilder.DropColumn(name: "xero_email_sent_at", table: "job_po_state");
    }
}
