using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Workshop.Api.Migrations.ProcurementDb
{
    /// <inheritdoc />
    public partial class AddInventoryMovementsAndMaterialLocation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "location",
                table: "workshop_materials",
                type: "text",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "inventory_movements",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    material_id = table.Column<int>(type: "integer", nullable: false),
                    previous_stock = table.Column<int>(type: "integer", nullable: false),
                    new_stock = table.Column<int>(type: "integer", nullable: false),
                    quantity_delta = table.Column<int>(type: "integer", nullable: false),
                    movement_type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    source = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    source_file = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    note = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    occurred_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_inventory_movements", x => x.id);
                    table.ForeignKey(
                        name: "FK_inventory_movements_workshop_materials_material_id",
                        column: x => x.material_id,
                        principalTable: "workshop_materials",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_inventory_movements_material_occurred_id",
                table: "inventory_movements",
                columns: new[] { "material_id", "occurred_at", "id" },
                descending: new[] { false, true, true });

            migrationBuilder.CreateIndex(
                name: "ix_inventory_movements_stocktake_usage",
                table: "inventory_movements",
                columns: new[] { "occurred_at", "material_id" },
                descending: new[] { true, false },
                filter: "movement_type = 'Stocktake' AND quantity_delta < 0");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "inventory_movements");

            migrationBuilder.DropColumn(
                name: "location",
                table: "workshop_materials");
        }
    }
}
