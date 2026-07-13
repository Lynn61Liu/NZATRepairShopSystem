using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Workshop.Api.Migrations;

public partial class BackfillJobWofState : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(
            """
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                      AND table_name = 'job_wof_state'
                ) THEN
                    IF EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'jobs'
                          AND column_name = 'wof_manual_status'
                    ) THEN
                        INSERT INTO job_wof_state (job_id, manual_status, created_at, updated_at)
                        SELECT DISTINCT
                            s.job_id,
                            j.wof_manual_status,
                            date_trunc('milliseconds', now()),
                            date_trunc('milliseconds', now())
                        FROM job_service_selections AS s
                        INNER JOIN service_catalog_items AS c ON c.id = s.service_catalog_item_id
                        INNER JOIN jobs AS j ON j.id = s.job_id
                        WHERE c.service_type = 'wof'
                          AND NOT EXISTS (
                              SELECT 1
                              FROM job_wof_state AS w
                              WHERE w.job_id = s.job_id
                          );
                    ELSE
                        INSERT INTO job_wof_state (job_id, manual_status, created_at, updated_at)
                        SELECT DISTINCT
                            s.job_id,
                            NULL,
                            date_trunc('milliseconds', now()),
                            date_trunc('milliseconds', now())
                        FROM job_service_selections AS s
                        INNER JOIN service_catalog_items AS c ON c.id = s.service_catalog_item_id
                        WHERE c.service_type = 'wof'
                          AND NOT EXISTS (
                              SELECT 1
                              FROM job_wof_state AS w
                              WHERE w.job_id = s.job_id
                          );
                    END IF;
                END IF;
            END $$;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(
            """
            DELETE FROM job_wof_state
            WHERE job_id IN (
                SELECT DISTINCT s.job_id
                FROM job_service_selections AS s
                INNER JOIN service_catalog_items AS c ON c.id = s.service_catalog_item_id
                WHERE c.service_type = 'wof'
            );
            """);
    }
}
