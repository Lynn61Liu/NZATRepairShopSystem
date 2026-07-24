using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Workshop.Api.Data;

#nullable disable

namespace Workshop.Api.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260723120000_AddJobWofRecordItems")]
public partial class AddJobWofRecordItems : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(
            """
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wof_item_status') THEN
                    CREATE TYPE wof_item_status AS ENUM ('pass', 'fail', 'na');
                END IF;
            END $$;

            CREATE TABLE IF NOT EXISTS job_wof_record_items (
                id BIGSERIAL PRIMARY KEY,
                job_wof_record_id BIGINT NOT NULL REFERENCES job_wof_records(id) ON DELETE CASCADE,
                code TEXT NOT NULL,
                label TEXT NOT NULL,
                status wof_item_status NOT NULL DEFAULT 'pass',
                fail_reason_id BIGINT REFERENCES wof_fail_reasons(id) ON DELETE SET NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                input_value TEXT,
                note TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('milliseconds', now()),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('milliseconds', now())
            );

            CREATE INDEX IF NOT EXISTS ix_job_wof_record_items_record_id
                ON job_wof_record_items(job_wof_record_id);

            CREATE INDEX IF NOT EXISTS ix_job_wof_record_items_fail_reason_id
                ON job_wof_record_items(fail_reason_id);

            CREATE UNIQUE INDEX IF NOT EXISTS ux_job_wof_record_items_record_code
                ON job_wof_record_items(job_wof_record_id, code);
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(
            """
            DROP TABLE IF EXISTS job_wof_record_items;
            DROP TYPE IF EXISTS wof_item_status;
            """);
    }
}
