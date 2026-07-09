using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Workshop.Api.Migrations
{
    public partial class RepairCourtesyCarSchema : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                CREATE TABLE IF NOT EXISTS courtesy_cars (
                  id BIGSERIAL PRIMARY KEY,
                  plate TEXT NOT NULL,
                  make TEXT,
                  model TEXT,
                  color TEXT,
                  year INTEGER,
                  mileage INTEGER,
                  fuel_level TEXT,
                  agreed_vehicle_value NUMERIC NOT NULL DEFAULT 0,
                  status TEXT NOT NULL DEFAULT 'available',
                  note TEXT,
                  wof_expiry DATE,
                  rego_expiry DATE,
                  loaned_at TIMESTAMPTZ,
                  borrower_name TEXT,
                  borrower_phone TEXT,
                  attachments_json JSONB,
                  returned_at TIMESTAMPTZ,
                  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                );

                CREATE UNIQUE INDEX IF NOT EXISTS ux_courtesy_cars_plate ON courtesy_cars (plate);

                CREATE TABLE IF NOT EXISTS courtesy_car_agreements (
                  id BIGSERIAL PRIMARY KEY,
                  job_id BIGINT NOT NULL,
                  vehicle_id BIGINT NOT NULL,
                  customer_id BIGINT,
                  status TEXT NOT NULL DEFAULT 'draft',
                  current_step TEXT NOT NULL DEFAULT 'contact',
                  job_vehicle_plate TEXT,
                  job_customer_name TEXT,
                  job_customer_phone TEXT,
                  job_customer_email TEXT,
                  job_customer_address TEXT,
                  contact_name TEXT,
                  contact_phone TEXT,
                  contact_email TEXT,
                  contact_address TEXT,
                  driver_license_number TEXT,
                  driver_license_expiry DATE,
                  emergency_contact_name TEXT,
                  emergency_contact_phone TEXT,
                  terms_confirmed BOOLEAN NOT NULL DEFAULT false,
                  signature_name TEXT,
                  vehicle_plate TEXT,
                  vehicle_make TEXT,
                  vehicle_model TEXT,
                  vehicle_color TEXT,
                  vehicle_year INTEGER,
                  vehicle_mileage INTEGER,
                  vehicle_fuel_level TEXT,
                  agreed_vehicle_value NUMERIC NOT NULL DEFAULT 0,
                  vehicle_wof_expiry DATE,
                  vehicle_rego_expiry DATE,
                  attachments_json JSONB,
                  pdf_file_path TEXT,
                  pdf_generated_at TIMESTAMPTZ,
                  email_sent_at TIMESTAMPTZ,
                  email_to TEXT,
                  email_message_id TEXT,
                  submitted_at TIMESTAMPTZ,
                  closed_at TIMESTAMPTZ,
                  cancelled_at TIMESTAMPTZ,
                  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                );

                CREATE INDEX IF NOT EXISTS ix_courtesy_car_agreements_job_id ON courtesy_car_agreements (job_id);
                CREATE INDEX IF NOT EXISTS ix_courtesy_car_agreements_vehicle_id ON courtesy_car_agreements (vehicle_id);
                CREATE INDEX IF NOT EXISTS ix_courtesy_car_agreements_status ON courtesy_car_agreements (status);

                CREATE TABLE IF NOT EXISTS courtesy_car_agreement_events (
                  id BIGSERIAL PRIMARY KEY,
                  courtesy_car_agreement_id BIGINT NOT NULL,
                  event_type TEXT NOT NULL,
                  actor_type TEXT,
                  actor_name TEXT,
                  payload_json JSONB,
                  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                );

                CREATE INDEX IF NOT EXISTS ix_courtesy_car_agreement_events_agreement_id ON courtesy_car_agreement_events (courtesy_car_agreement_id);
            """);

            migrationBuilder.Sql("""
                DO $$
                BEGIN
                  IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'fk_courtesy_car_agreements_job'
                  ) THEN
                    ALTER TABLE courtesy_car_agreements
                      ADD CONSTRAINT fk_courtesy_car_agreements_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;
                  END IF;

                  IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'fk_courtesy_car_agreements_vehicle'
                  ) THEN
                    ALTER TABLE courtesy_car_agreements
                      ADD CONSTRAINT fk_courtesy_car_agreements_vehicle FOREIGN KEY (vehicle_id) REFERENCES courtesy_cars(id) ON DELETE RESTRICT;
                  END IF;

                  IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'fk_courtesy_car_agreements_customer'
                  ) THEN
                    ALTER TABLE courtesy_car_agreements
                      ADD CONSTRAINT fk_courtesy_car_agreements_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
                  END IF;

                  IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'fk_courtesy_car_agreement_events_agreement'
                  ) THEN
                    ALTER TABLE courtesy_car_agreement_events
                      ADD CONSTRAINT fk_courtesy_car_agreement_events_agreement FOREIGN KEY (courtesy_car_agreement_id) REFERENCES courtesy_car_agreements(id) ON DELETE CASCADE;
                  END IF;
                END $$;
            """);

        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DROP TABLE IF EXISTS courtesy_car_agreement_events;
                DROP TABLE IF EXISTS courtesy_car_agreements;
                DROP TABLE IF EXISTS courtesy_cars;
            """);
        }
    }
}
