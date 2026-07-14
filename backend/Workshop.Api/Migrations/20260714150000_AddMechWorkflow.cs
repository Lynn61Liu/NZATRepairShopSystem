using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Workshop.Api.Data;

#nullable disable

namespace Workshop.Api.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260714150000_AddMechWorkflow")]
public partial class AddMechWorkflow : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<DateTime>(
            name: "completed_at",
            table: "job_parts_services",
            type: "timestamp with time zone",
            nullable: true);

        migrationBuilder.CreateTable(
            name: "job_mech_workflows",
            columns: table => new
            {
                id = table.Column<long>(type: "bigint", nullable: false)
                    .Annotation("Npgsql:ValueGenerationStrategy", Npgsql.EntityFrameworkCore.PostgreSQL.Metadata.NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                job_id = table.Column<long>(type: "bigint", nullable: false),
                status = table.Column<string>(type: "text", nullable: false),
                parts_arrived_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "date_trunc('milliseconds', now())"),
                updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "date_trunc('milliseconds', now())")
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_job_mech_workflows", x => x.id);
                table.ForeignKey(
                    name: "FK_job_mech_workflows_jobs_job_id",
                    column: x => x.job_id,
                    principalTable: "jobs",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "ux_job_mech_workflows_job_id",
            table: "job_mech_workflows",
            column: "job_id",
            unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "job_mech_workflows");
        migrationBuilder.DropColumn(name: "completed_at", table: "job_parts_services");
    }
}
