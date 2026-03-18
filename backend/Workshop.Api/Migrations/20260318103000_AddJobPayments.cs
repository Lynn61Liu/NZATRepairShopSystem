using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Workshop.Api.Migrations
{
    public partial class AddJobPayments : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "job_payments",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", Npgsql.EntityFrameworkCore.PostgreSQL.Metadata.NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    job_id = table.Column<long>(type: "bigint", nullable: false),
                    job_invoice_id = table.Column<long>(type: "bigint", nullable: false),
                    provider = table.Column<string>(type: "text", nullable: false),
                    external_payment_id = table.Column<string>(type: "text", nullable: true),
                    external_invoice_id = table.Column<string>(type: "text", nullable: true),
                    method = table.Column<string>(type: "text", nullable: false),
                    amount = table.Column<decimal>(type: "numeric", nullable: false),
                    payment_date = table.Column<DateOnly>(type: "date", nullable: false),
                    reference = table.Column<string>(type: "text", nullable: true),
                    account_code = table.Column<string>(type: "text", nullable: true),
                    account_name = table.Column<string>(type: "text", nullable: true),
                    external_status = table.Column<string>(type: "text", nullable: true),
                    request_payload_json = table.Column<string>(type: "text", nullable: true),
                    response_payload_json = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "date_trunc('milliseconds', now())"),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "date_trunc('milliseconds', now())")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_job_payments", x => x.id);
                    table.ForeignKey(
                        name: "FK_job_payments_job_invoices_job_invoice_id",
                        column: x => x.job_invoice_id,
                        principalTable: "job_invoices",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_job_payments_jobs_job_id",
                        column: x => x.job_id,
                        principalTable: "jobs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_job_payments_job_id",
                table: "job_payments",
                column: "job_id");

            migrationBuilder.CreateIndex(
                name: "ix_job_payments_job_invoice_id",
                table: "job_payments",
                column: "job_invoice_id");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "job_payments");
        }
    }
}
