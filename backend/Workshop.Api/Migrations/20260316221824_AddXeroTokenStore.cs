using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Workshop.Api.Migrations
{
    public partial class AddXeroTokenStore : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "xero_tokens",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    provider = table.Column<string>(type: "text", nullable: false),
                    refresh_token = table.Column<string>(type: "text", nullable: false),
                    access_token = table.Column<string>(type: "text", nullable: true),
                    access_token_expires_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    scope = table.Column<string>(type: "text", nullable: true),
                    tenant_id = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "date_trunc('milliseconds', now())"),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "date_trunc('milliseconds', now())")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_xero_tokens", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ux_xero_tokens_provider",
                table: "xero_tokens",
                column: "provider",
                unique: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "xero_tokens");
        }
    }
}
