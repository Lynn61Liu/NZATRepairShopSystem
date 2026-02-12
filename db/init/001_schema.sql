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

-- Jobs
CREATE TABLE jobs (
  id BIGSERIAL PRIMARY KEY,
  status TEXT NOT NULL,
  is_urgent BOOLEAN NOT NULL,
  vehicle_id BIGINT,
  customer_id BIGINT,
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
