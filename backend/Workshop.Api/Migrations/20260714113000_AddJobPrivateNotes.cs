using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Workshop.Api.Data;

#nullable disable

namespace Workshop.Api.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260714113000_AddJobPrivateNotes")]
public partial class AddJobPrivateNotes : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "private_notes",
            table: "jobs",
            type: "text",
            nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "private_notes",
            table: "jobs");
    }
}
