using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Workshop.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddJobServiceCatalogInvoiceMapping : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "use_service_catalog_mapping",
                table: "jobs",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "job_service_selections",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    job_id = table.Column<long>(type: "bigint", nullable: false),
                    service_catalog_item_id = table.Column<long>(type: "bigint", nullable: false),
                    service_name_snapshot = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "date_trunc('milliseconds', now())"),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "date_trunc('milliseconds', now())")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_job_service_selections", x => x.id);
                    table.ForeignKey(
                        name: "FK_job_service_selections_jobs_job_id",
                        column: x => x.job_id,
                        principalTable: "jobs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_job_service_selections_service_catalog_items_service_catalo~",
                        column: x => x.service_catalog_item_id,
                        principalTable: "service_catalog_items",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_job_service_selections_job_id",
                table: "job_service_selections",
                column: "job_id");

            migrationBuilder.CreateIndex(
                name: "ix_job_service_selections_service_catalog_item_id",
                table: "job_service_selections",
                column: "service_catalog_item_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "job_service_selections");

            migrationBuilder.DropColumn(
                name: "use_service_catalog_mapping",
                table: "jobs");
        }
    }
}
