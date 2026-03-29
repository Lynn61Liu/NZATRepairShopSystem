using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Workshop.Api.Migrations
{
    /// <inheritdoc />
    public partial class EnforceSinglePaymentPerInvoice : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DELETE FROM job_payments AS older
                USING job_payments AS newer
                WHERE older.job_invoice_id = newer.job_invoice_id
                  AND (
                      older.created_at < newer.created_at
                      OR (older.created_at = newer.created_at AND older.id < newer.id)
                  );
                """);

            migrationBuilder.DropIndex(
                name: "ix_job_payments_job_invoice_id",
                table: "job_payments");

            migrationBuilder.CreateIndex(
                name: "ux_job_payments_job_invoice_id",
                table: "job_payments",
                column: "job_invoice_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ux_job_payments_job_invoice_id",
                table: "job_payments");

            migrationBuilder.CreateIndex(
                name: "ix_job_payments_job_invoice_id",
                table: "job_payments",
                column: "job_invoice_id");
        }
    }
}
