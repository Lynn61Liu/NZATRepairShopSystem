using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Workshop.Api.Migrations
{
    public partial class AddCarOnYardReportSettings : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "car_on_yard_report_settings",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", Npgsql.EntityFrameworkCore.PostgreSQL.Metadata.NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    enabled = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    recipients = table.Column<string>(type: "text", nullable: false),
                    send_times = table.Column<string>(type: "text", nullable: false),
                    subject = table.Column<string>(type: "text", nullable: false),
                    time_zone_id = table.Column<string>(type: "text", nullable: false),
                    last_sent_slot_key = table.Column<string>(type: "text", nullable: true),
                    last_sent_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    last_error = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "date_trunc('milliseconds', now())"),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "date_trunc('milliseconds', now())")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_car_on_yard_report_settings", x => x.id);
                });

            migrationBuilder.InsertData(
                table: "car_on_yard_report_settings",
                columns: new[] { "id", "enabled", "recipients", "send_times", "subject", "time_zone_id" },
                values: new object[] { 1L, true, "info@nzautotech.co.nz", "09:30,17:30", "Car On Yard", "Pacific/Auckland" });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "car_on_yard_report_settings");
        }
    }
}
