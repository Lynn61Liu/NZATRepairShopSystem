using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;
using Workshop.Api.Data;

#nullable disable

namespace Workshop.Api.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20260713170000_AddPaymarkQuickJobOptions")]
    public partial class AddPaymarkQuickJobOptions : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "paymark_quick_job_options",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    code = table.Column<string>(type: "text", nullable: false),
                    label = table.Column<string>(type: "text", nullable: false),
                    service_type = table.Column<string>(type: "text", nullable: false),
                    description = table.Column<string>(type: "text", nullable: false),
                    xero_item_code = table.Column<string>(type: "text", nullable: true),
                    account_code = table.Column<string>(type: "text", nullable: true),
                    tax_type = table.Column<string>(type: "text", nullable: true),
                    default_amount_incl_gst = table.Column<decimal>(type: "numeric", nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    sort_order = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "date_trunc('milliseconds', now())"),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "date_trunc('milliseconds', now())")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_paymark_quick_job_options", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_paymark_quick_job_options_sort_order",
                table: "paymark_quick_job_options",
                column: "sort_order");

            migrationBuilder.CreateIndex(
                name: "ux_paymark_quick_job_options_code",
                table: "paymark_quick_job_options",
                column: "code",
                unique: true);

            migrationBuilder.Sql("""
                INSERT INTO paymark_quick_job_options
                    (code, label, service_type, description, xero_item_code, account_code, tax_type, default_amount_incl_gst, is_active, sort_order, created_at, updated_at)
                VALUES
                    ('puncture', 'Puncture Repair', 'mech', 'Puncture Repair', '666WORSHOP Labour Fee', NULL, 'OUTPUT2', 0, TRUE, 10, now(), now()),
                    ('service', 'Service', 'mech', 'Service', '666WORSHOP Labour Fee', NULL, 'OUTPUT2', 0, TRUE, 20, now(), now()),
                    ('wof', 'WOF', 'wof', 'WOF Inspection', '208-WOF', NULL, 'OUTPUT2', 60, TRUE, 30, now(), now()),
                    ('battery', 'Battery', 'mech', 'Battery', '666WORSHOP Labour Fee', NULL, 'OUTPUT2', 0, TRUE, 40, now(), now()),
                    ('other', 'Other', 'mech', 'General repair', '666WORSHOP Labour Fee', NULL, 'OUTPUT2', 0, TRUE, 50, now(), now())
                ON CONFLICT (code) DO NOTHING;
            """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "paymark_quick_job_options");
        }
    }
}
