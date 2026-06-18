using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Workshop.Api.Data;

namespace Workshop.Api.Services;

public sealed class CourtesyCarSchemaInitializerService : IHostedService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<CourtesyCarSchemaInitializerService> _logger;

    public CourtesyCarSchemaInitializerService(
        IServiceScopeFactory scopeFactory,
        ILogger<CourtesyCarSchemaInitializerService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        try
        {
            await db.Database.ExecuteSqlRawAsync(BuildCourtesyCarSchemaSql(), cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to initialize courtesy car schema.");
            throw;
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private static string BuildCourtesyCarSchemaSql() => """
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

        ALTER TABLE courtesy_cars
          ADD COLUMN IF NOT EXISTS loaned_at TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS borrower_name TEXT,
          ADD COLUMN IF NOT EXISTS borrower_phone TEXT,
          ADD COLUMN IF NOT EXISTS attachments_json JSONB;

        CREATE UNIQUE INDEX IF NOT EXISTS ux_courtesy_cars_plate ON courtesy_cars (plate);

        CREATE TABLE IF NOT EXISTS courtesy_car_agreements (
          id BIGSERIAL PRIMARY KEY,
          job_id BIGINT NOT NULL,
          vehicle_id BIGINT,
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
              ADD CONSTRAINT fk_courtesy_car_agreements_vehicle FOREIGN KEY (vehicle_id) REFERENCES courtesy_cars(id) ON DELETE SET NULL;
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

        INSERT INTO courtesy_cars (
          plate, make, model, color, year, mileage, fuel_level, agreed_vehicle_value, status, note, wof_expiry, rego_expiry, loaned_at, borrower_name, borrower_phone, attachments_json, returned_at
        ) VALUES
          ('LCZ123', 'Toyota', 'Corolla', 'Silver', 2021, 48210, '3/4 tank', 22000, 'available', NULL, '2026-07-10', '2026-07-06', NULL, NULL, NULL, '[]'::jsonb, NULL),
          ('MKP456', 'Honda', 'Civic', 'White', 2020, 56100, 'Half tank', 19500, 'on_loan', NULL, '2026-06-21', '2026-08-12', '2026-06-13 09:15:00+00', 'Alex Chen', '021 555 0101', '[]'::jsonb, NULL),
          ('NQR789', 'Mazda', 'Demio', 'Blue', 2019, 73880, 'Full tank', 15000, 'available', NULL, '2026-05-10', '2026-07-05', NULL, NULL, NULL, '[]'::jsonb, NULL),
          ('HBD012', 'Hyundai', 'i30', 'Black', 2022, 22410, 'Half tank', 27000, 'unavailable', 'Minor dent repair in progress at panel shop.', '2026-07-18', '2026-06-20', NULL, NULL, NULL, '[]'::jsonb, NULL),
          ('TJF345', 'Nissan', 'Tiida', 'Red', 2018, 82215, '1/2 tank', 11000, 'available', NULL, '2026-08-01', '2026-09-11', NULL, NULL, NULL, '[]'::jsonb, '2026-06-12 08:30:00+00')
        ON CONFLICT (plate) DO NOTHING;

        UPDATE courtesy_car_agreements
        SET status = 'inprogress'
        WHERE status = 'in_progress';

        UPDATE courtesy_car_agreements
        SET status = 'submitted',
            submitted_at = COALESCE(submitted_at, email_sent_at, updated_at),
            closed_at = NULL
        WHERE status = 'closed' AND closed_at IS NULL;

        ALTER TABLE courtesy_car_agreements
          ALTER COLUMN vehicle_id DROP NOT NULL;
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'fk_courtesy_car_agreements_vehicle'
          ) THEN
            ALTER TABLE courtesy_car_agreements DROP CONSTRAINT fk_courtesy_car_agreements_vehicle;
          END IF;

          ALTER TABLE courtesy_car_agreements
            ADD CONSTRAINT fk_courtesy_car_agreements_vehicle FOREIGN KEY (vehicle_id) REFERENCES courtesy_cars(id) ON DELETE SET NULL;
        END $$;
        """;
}
