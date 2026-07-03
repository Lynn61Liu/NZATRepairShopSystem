-- Initial schema for NZAT Jan2026

-- Enums
CREATE TYPE wof_record_state AS ENUM ('pass', 'fail', 'recheck');
CREATE TYPE wof_ui_state AS ENUM ('pass', 'fail', 'recheck', 'printed');
CREATE TYPE parts_service_status AS ENUM (
  'pending_order',
  'needs_pt',
  'parts_trader',
  'pickup_or_transit'
);
CREATE TYPE worklog_service_type AS ENUM ('pnp', 'mech');

-- Vehicles
CREATE TABLE vehicles (
  id BIGSERIAL PRIMARY KEY,
  plate TEXT NOT NULL,
  make TEXT,
  model TEXT,
  year INTEGER,
  vin TEXT,
  engine TEXT,
  rego_expiry DATE,
  colour TEXT,
  body_style TEXT,
  engine_no TEXT,
  chassis TEXT,
  cc_rating INTEGER,
  fuel_type TEXT,
  seats INTEGER,
  country_of_origin TEXT,
  gross_vehicle_mass INTEGER,
  refrigerant TEXT,
  fuel_tank_capacity_litres NUMERIC,
  full_combined_range_km NUMERIC,
  wof_expiry DATE,
  odometer INTEGER,
  nz_first_registration DATE,
  customer_id BIGINT,
  raw_json JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ux_vehicles_plate ON vehicles (plate);

-- Courtesy cars
CREATE TABLE courtesy_cars (
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

CREATE UNIQUE INDEX ux_courtesy_cars_plate ON courtesy_cars (plate);

CREATE TABLE courtesy_car_agreements (
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

CREATE INDEX ix_courtesy_car_agreements_job_id ON courtesy_car_agreements (job_id);
CREATE INDEX ix_courtesy_car_agreements_vehicle_id ON courtesy_car_agreements (vehicle_id);
CREATE INDEX ix_courtesy_car_agreements_status ON courtesy_car_agreements (status);
ALTER TABLE courtesy_car_agreements
  ADD CONSTRAINT fk_courtesy_car_agreements_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;
ALTER TABLE courtesy_car_agreements
  ADD CONSTRAINT fk_courtesy_car_agreements_vehicle FOREIGN KEY (vehicle_id) REFERENCES courtesy_cars(id) ON DELETE SET NULL;
ALTER TABLE courtesy_car_agreements
  ADD CONSTRAINT fk_courtesy_car_agreements_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

CREATE TABLE courtesy_car_agreement_events (
  id BIGSERIAL PRIMARY KEY,
  courtesy_car_agreement_id BIGINT NOT NULL,
  event_type TEXT NOT NULL,
  actor_type TEXT,
  actor_name TEXT,
  payload_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_courtesy_car_agreement_events_agreement_id ON courtesy_car_agreement_events (courtesy_car_agreement_id);
ALTER TABLE courtesy_car_agreement_events
  ADD CONSTRAINT fk_courtesy_car_agreement_events_agreement FOREIGN KEY (courtesy_car_agreement_id) REFERENCES courtesy_car_agreements(id) ON DELETE CASCADE;


-- Customers
CREATE TABLE customers (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  business_code TEXT,
  notes TEXT
);

-- Staff
CREATE TABLE staff (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  cost_rate NUMERIC NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Jobs
CREATE TABLE jobs (
  id BIGSERIAL PRIMARY KEY,
  status TEXT NOT NULL,
  is_urgent BOOLEAN NOT NULL,
  vehicle_id BIGINT,
  customer_id BIGINT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tags
CREATE TABLE tags (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Job Tags
CREATE TABLE job_tags (
  job_id BIGINT NOT NULL,
  tag_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, tag_id)
);

-- WOF Service (header record)
CREATE TABLE wof_service (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- WOF Fail Reasons
CREATE TABLE wof_fail_reasons (
  id BIGSERIAL PRIMARY KEY,
  label TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Job WOF Records
CREATE TABLE job_wof_records (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  rego TEXT NOT NULL,
  make_model TEXT,
  odo TEXT,
  record_state wof_record_state NOT NULL,
  is_new_wof BOOLEAN,
  new_wof_date DATE,
  auth_code TEXT,
  check_sheet TEXT,
  cs_no TEXT,
  wof_label TEXT,
  label_no TEXT,
  fail_reasons TEXT,
  previous_expiry_date DATE,
  organisation_name TEXT NOT NULL,
  excel_row_no INTEGER NOT NULL,
  source_file TEXT,
  note TEXT,
  wof_ui_state wof_ui_state NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Parts Services
CREATE TABLE job_parts_services (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL,
  description TEXT NOT NULL,
  status parts_service_status NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Parts Service Notes
CREATE TABLE job_parts_notes (
  id BIGSERIAL PRIMARY KEY,
  parts_service_id BIGINT NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mech Services
CREATE TABLE job_mech_services (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL,
  description TEXT NOT NULL,
  cost NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Paint Services
CREATE TABLE job_paint_services (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  current_stage INTEGER NOT NULL DEFAULT -1,
  panels INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Worklogs
CREATE TABLE worklogs (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL,
  staff_id BIGINT NOT NULL,
  service_type worklog_service_type NOT NULL DEFAULT 'pnp',
  work_date DATE NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  admin_note TEXT,
  source TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_worklogs_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  CONSTRAINT fk_worklogs_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE RESTRICT
);
