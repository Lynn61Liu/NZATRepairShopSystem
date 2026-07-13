using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;
using Workshop.Api.Data;

#nullable disable

namespace Workshop.Api.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20260713153000_AddPaymarkTransactions")]
    public partial class AddPaymarkTransactions : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "paymark_transactions",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    transaction_key = table.Column<string>(type: "text", nullable: false),
                    card_acceptor_id_code = table.Column<string>(type: "text", nullable: false),
                    terminal_id = table.Column<string>(type: "text", nullable: false),
                    retrieval_ref = table.Column<string>(type: "text", nullable: false),
                    transaction_number = table.Column<long>(type: "bigint", nullable: false),
                    transaction_time_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    settlement_date = table.Column<DateOnly>(type: "date", nullable: true),
                    card_logo = table.Column<string>(type: "text", nullable: false),
                    suffix = table.Column<string>(type: "text", nullable: false),
                    tran_type = table.Column<int>(type: "integer", nullable: true),
                    transaction_amount = table.Column<decimal>(type: "numeric", nullable: false),
                    purchase_amount = table.Column<decimal>(type: "numeric", nullable: false),
                    cashout_amount = table.Column<decimal>(type: "numeric", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false),
                    action_code = table.Column<string>(type: "text", nullable: false),
                    bin = table.Column<string>(type: "text", nullable: false),
                    matched_job_id = table.Column<long>(type: "bigint", nullable: true),
                    local_note = table.Column<string>(type: "text", nullable: true),
                    raw_payload_json = table.Column<string>(type: "jsonb", nullable: true),
                    imported_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "date_trunc('milliseconds', now())"),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "date_trunc('milliseconds', now())")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_paymark_transactions", x => x.id);
                    table.ForeignKey(
                        name: "fk_paymark_transactions_jobs_matched_job_id",
                        column: x => x.matched_job_id,
                        principalTable: "jobs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "ix_paymark_transactions_matched_job_id",
                table: "paymark_transactions",
                column: "matched_job_id");

            migrationBuilder.CreateIndex(
                name: "ix_paymark_transactions_transaction_time_utc",
                table: "paymark_transactions",
                column: "transaction_time_utc");

            migrationBuilder.CreateIndex(
                name: "ux_paymark_transactions_transaction_key",
                table: "paymark_transactions",
                column: "transaction_key",
                unique: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "paymark_transactions");
        }
    }
}
