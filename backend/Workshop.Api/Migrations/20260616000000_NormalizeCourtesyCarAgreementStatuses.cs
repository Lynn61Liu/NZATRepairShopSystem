using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Workshop.Api.Migrations
{
    public partial class NormalizeCourtesyCarAgreementStatuses : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                UPDATE courtesy_car_agreements
                SET status = 'inprogress'
                WHERE status = 'in_progress';

                UPDATE courtesy_car_agreements
                SET status = 'submitted',
                    submitted_at = COALESCE(submitted_at, email_sent_at, updated_at),
                    closed_at = NULL
                WHERE status = 'closed';
            """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                UPDATE courtesy_car_agreements
                SET status = 'in_progress'
                WHERE status = 'inprogress';

                UPDATE courtesy_car_agreements
                SET status = 'closed'
                WHERE status = 'submitted';
            """);
        }
    }
}
