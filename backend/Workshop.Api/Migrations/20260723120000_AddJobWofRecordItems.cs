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
                item_type TEXT NOT NULL DEFAULT 'status',
                status wof_item_status NOT NULL DEFAULT 'pass',
                fail_reason_id BIGINT REFERENCES wof_fail_reasons(id) ON DELETE SET NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                numeric_value NUMERIC,
                input_value TEXT,
                note TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('milliseconds', now()),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('milliseconds', now()),
                CONSTRAINT ck_job_wof_record_items_item_type CHECK (item_type IN ('status', 'number'))
            );

            ALTER TABLE job_wof_record_items
                ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'status';

            ALTER TABLE job_wof_record_items
                ADD COLUMN IF NOT EXISTS numeric_value NUMERIC;

            ALTER TABLE job_wof_record_items
                DROP CONSTRAINT IF EXISTS ck_job_wof_record_items_item_type;

            ALTER TABLE job_wof_record_items
                ADD CONSTRAINT ck_job_wof_record_items_item_type CHECK (item_type IN ('status', 'number'));

            CREATE INDEX IF NOT EXISTS ix_job_wof_record_items_record_id
                ON job_wof_record_items(job_wof_record_id);

            CREATE INDEX IF NOT EXISTS ix_job_wof_record_items_fail_reason_id
                ON job_wof_record_items(fail_reason_id);

            CREATE UNIQUE INDEX IF NOT EXISTS ux_job_wof_record_items_record_code
                ON job_wof_record_items(job_wof_record_id, code);

            WITH definitions(code, label, item_type, sort_order) AS (
                VALUES
                    ('E1', 'DIRECTION INDICATOR LAMPS (FRONT)', 'status', 1001),
                    ('E2', 'FORWARD-FACING POSITION LAMPS', 'status', 1002),
                    ('E3', 'HEADLAMPS', 'status', 1003),
                    ('E5', 'FRONT AND REAR FOG LAMPS', 'status', 1005),
                    ('E6', 'DIRECTION INDICATOR LAMPS (REAR)', 'status', 1006),
                    ('E7', 'REARWARD FACING POSITION LAMPS', 'status', 1007),
                    ('E8', 'STOP LAMPS', 'status', 1008),
                    ('E9', 'HIGH-MOUNTED STOP LAMPS', 'status', 1009),
                    ('E10', 'REGISTRATION PLATE LAMPS', 'status', 1010),
                    ('E11', 'REAR REFLECTORS', 'status', 1011),
                    ('E12', 'OTHER LAMPS', 'status', 1012),
                    ('E13', 'WINDSCREEN', 'status', 1013),
                    ('E14', 'OTHER GLAZING', 'status', 1014),
                    ('E15', 'DOORS AND HINGED PANELS', 'status', 1015),
                    ('E16', 'MUDGUARDS', 'status', 1016),
                    ('E17', 'EXTERNAL PROJECTIONS', 'status', 1017),
                    ('E18', 'FOOTRESTS (MOTORCYCLES ONLY)', 'status', 1018),
                    ('E19', 'STRUCTURE/CORROSION (PANELS, DOOR PILLARS, ETC)', 'status', 1019),
                    ('E20', 'DIMENSIONS', 'status', 1020),
                    ('I1', 'WIPERS/OPERATION', 'status', 2001),
                    ('I2', 'WASHERS/OPERATION', 'status', 2002),
                    ('I3', 'REAR VIEW MIRRORS', 'status', 2003),
                    ('I4', 'SUN VISORS', 'status', 2004),
                    ('I5', 'SEATBELTS', 'status', 2005),
                    ('I6', 'SEATBELT ANCHORAGES', 'status', 2006),
                    ('I7', 'SEATS AND SEAT ANCHORAGES', 'status', 2007),
                    ('I8', 'HEAD RESTRAINTS', 'status', 2008),
                    ('I9', 'INTERIOR IMPACT', 'status', 2009),
                    ('I10', 'AIRBAG SELF CHECK (DASHBOARD WARNING LAMP)', 'status', 2010),
                    ('I11', 'ABS SELF CHECK (DASHBOARD WARNING LAMP)', 'status', 2011),
                    ('I12', 'AUDIBLE WARNING DEVICE', 'status', 2012),
                    ('I13', 'SPARE WHEEL SECURITY', 'status', 2013),
                    ('C1', 'WHEELS, HUBS AND AXLES', 'status', 3001),
                    ('C2', 'STEERING MECHANISM AND COMPONENTS', 'status', 3002),
                    ('C3', 'SUSPENSION MECHANISM AND COMPONENTS', 'status', 3003),
                    ('C4', 'FUEL TANK AND FUEL LINES', 'status', 3004),
                    ('C5', 'BRAKE COMPONENTS (INCL CONTROLS, LINKAGES, LINES AND HOSES)', 'status', 3005),
                    ('C6', 'EXHAUST SYSTEM AND VISIBLE SMOKE', 'status', 3006),
                    ('C7', 'TYRE CONDITION', 'status', 3007),
                    ('C8', 'TYRE TREAD AND DEPTH', 'status', 3008),
                    ('C9', 'TOWING CONNECTIONS', 'status', 3009),
                    ('C10', 'SAFETY CHAIN (TRAILERS <2000KG GVM)', 'status', 3010),
                    ('C11', 'DUAL SAFETY CHAIN TRAILERS 2000KG-2500KG LADEN (NOT FITTED WITH BREAKAWAY BRAKE)', 'status', 3011),
                    ('C12', 'STRUCTURE/CORROSION (CHASSIS/FLOOR PAN ETC)', 'status', 3012),
                    ('CFL', 'SERVICE BRAKE FRONT LEFT READING', 'number', 4001),
                    ('CFR', 'SERVICE BRAKE FRONT RIGHT READING', 'number', 4002),
                    ('CRL', 'SERVICE BRAKE REAR LEFT READING', 'number', 4003),
                    ('CRR', 'SERVICE BRAKE REAR RIGHT READING', 'number', 4004),
                    ('R1', 'SERVICE BRAKE PERFORMANCE', 'status', 4011),
                    ('R2', 'SERVICE BRAKE BALANCE', 'status', 4012),
                    ('PBL', 'PARKING BRAKE LEFT', 'status', 4021),
                    ('PBR', 'PARKING BRAKE RIGHT', 'status', 4022),
                    ('PBRL', 'PARKING BRAKE LEFT READING', 'number', 4023),
                    ('PBRR', 'PARKING BRAKE RIGHT READING', 'number', 4024),
                    ('R3', 'PARKING BRAKE PERFORMANCE', 'status', 4031),
                    ('R4', 'TRAILER BREAKAWAY BRAKE', 'status', 4032),
                    ('R5', 'SPEEDOMETER', 'status', 4033),
                    ('U1', 'A/F SYSTEM IN WORKING ORDER', 'status', 5001),
                    ('U2', 'A/F CERTIFICATE CURRENT', 'status', 5002),
                    ('U3', 'A/F SYSTEM SAFE', 'status', 5003),
                    ('U4', 'MODIFIED VEHICLE (DECLARATION CERTIFICATE/LVV PLATE)', 'status', 5004),
                    ('U5', 'CHASSIS/VIN NUMBER (PRESENT AND RECORDED CORRECTLY)', 'status', 5005),
                    ('U6', 'STRUCTURE/CORROSION (FIREWALL/INNER GUARDS, ETC)', 'status', 5006),
                    ('U7', 'ENGINE AND DRIVE TRAIN', 'status', 5007),
                    ('U8', 'FUEL SYSTEM', 'status', 5008)
            )
            INSERT INTO job_wof_record_items (
                job_wof_record_id, code, label, item_type, status, sort_order, created_at, updated_at
            )
            SELECT
                records.id,
                definitions.code,
                definitions.label,
                definitions.item_type,
                'pass'::wof_item_status,
                definitions.sort_order,
                date_trunc('milliseconds', now()),
                date_trunc('milliseconds', now())
            FROM job_wof_records AS records
            CROSS JOIN definitions
            ON CONFLICT (job_wof_record_id, code) DO NOTHING;
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
