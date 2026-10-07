-- Initial schema for Graduation Ticket System (PostgreSQL)
-- Migration: 0001_init_schema.sql

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET search_path TO public;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- Enums
CREATE TYPE ticket_status AS ENUM (
  'AWAITING_PAYMENT',
  'PROCESSING',
  'CONFIRMED',
  'REJECTED'
);

CREATE TYPE ticket_type AS ENUM (
  'TWO_COMPANIONS',
  'THREE_COMPANIONS'
);

CREATE TYPE qr_code_type AS ENUM (
  'GRADUATE',
  'COMPANION'
);

CREATE TYPE otp_purpose AS ENUM (
  'EMAIL_VERIFICATION',
  'PASSWORD_RESET'
);

CREATE TYPE actor_type AS ENUM (
  'ADMIN',
  'SCANNER'
);

-- Independent tables: Event, College, Admin, Scanner, Setting

CREATE TABLE events (
  id serial PRIMARY KEY,
  name varchar(255) NOT NULL,
  event_date date NOT NULL,
  registration_start timestamp with time zone NOT NULL,
  registration_end timestamp with time zone NOT NULL,
  whatsapp_group_link text NOT NULL,
  is_3companions_enabled boolean NOT NULL DEFAULT true,
  price_2_companions decimal(10,2) NOT NULL,
  price_3_companions decimal(10,2) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_event_registration_period CHECK (registration_start <= registration_end),
  CONSTRAINT chk_event_prices_positive CHECK (price_2_companions >= 0 AND price_3_companions >= 0)
);

CREATE INDEX idx_events_name ON events(name);
CREATE INDEX idx_events_date ON events(event_date);
CREATE INDEX idx_events_registration ON events(registration_start, registration_end);

CREATE TABLE colleges (
  id serial PRIMARY KEY,
  name varchar(255) NOT NULL,
  event_id integer NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT unique_college_name_per_event UNIQUE (name, event_id)
);

CREATE INDEX idx_colleges_event_id ON colleges(event_id);

CREATE TABLE admins (
  id serial PRIMARY KEY,
  username varchar(50) NOT NULL UNIQUE,
  password_hash varchar(255) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE scanners (
  id serial PRIMARY KEY,
  username varchar(50) NOT NULL UNIQUE,
  password_hash varchar(255) NOT NULL,
  created_by_admin_id integer NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
  event_id integer NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_scanners_event_id ON scanners(event_id);
CREATE INDEX idx_scanners_created_by_admin_id ON scanners(created_by_admin_id);

CREATE TABLE settings (
  key varchar(100) NOT NULL PRIMARY KEY,
  value text NOT NULL
);

-- Related tables: Graduate, UniversityRecord, Ticket

CREATE TABLE graduates (
  id serial PRIMARY KEY,
  full_name varchar(255) NOT NULL,
  gender varchar(10) NOT NULL,
  college_id integer NOT NULL REFERENCES colleges(id) ON DELETE RESTRICT,
  email varchar(255) NOT NULL UNIQUE,
  phone varchar(50) NOT NULL,
  email_verified boolean NOT NULL DEFAULT false,
  father_name varchar(255) NOT NULL,
  mother_name varchar(255) NOT NULL,
  password_hash varchar(255) NOT NULL,
  university_id varchar(100) NOT NULL,
  unique_graduate_code uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_graduate_college_university UNIQUE (college_id, university_id)
);

CREATE INDEX idx_graduates_college_id ON graduates(college_id);
CREATE INDEX idx_graduates_email ON graduates(email);
CREATE INDEX idx_graduates_university_id ON graduates(university_id);
CREATE INDEX idx_graduates_unique_code ON graduates(unique_graduate_code);

CREATE TABLE university_records (
  id serial PRIMARY KEY,
  event_id integer NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  university_id varchar(100) NOT NULL,
  full_name varchar(255) NOT NULL,
  father_name varchar(255) NOT NULL,
  mother_name varchar(255) NOT NULL,
  gender varchar(10) NOT NULL,
  college_id integer NOT NULL REFERENCES colleges(id) ON DELETE RESTRICT,
  imported_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_event_university_id UNIQUE (event_id, university_id)
);

CREATE INDEX idx_university_records_event_id ON university_records(event_id);
CREATE INDEX idx_university_records_college_id ON university_records(college_id);
CREATE INDEX idx_university_records_university_id ON university_records(university_id);

CREATE TABLE tickets (
  id serial PRIMARY KEY,
  graduate_id integer NOT NULL REFERENCES graduates(id) ON DELETE CASCADE,
  event_id integer NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  ticket_type ticket_type NOT NULL,
  companions_count smallint NOT NULL,
  price decimal(10,2) NOT NULL,
  status ticket_status NOT NULL DEFAULT 'AWAITING_PAYMENT',
  rejection_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at timestamp with time zone,
  CONSTRAINT chk_ticket_companions_count CHECK (
    (ticket_type = 'TWO_COMPANIONS' AND companions_count = 2) OR
    (ticket_type = 'THREE_COMPANIONS' AND companions_count = 3)
  ),
  CONSTRAINT chk_ticket_confirmed_time CHECK (
    (status = 'CONFIRMED' AND confirmed_at IS NOT NULL) OR
    (status != 'CONFIRMED' AND confirmed_at IS NULL)
  ),
  -- Each graduate has only one ticket per event
  CONSTRAINT unique_ticket_graduate_event UNIQUE (graduate_id, event_id)
);

CREATE INDEX idx_tickets_graduate_id ON tickets(graduate_id);
CREATE INDEX idx_tickets_event_id ON tickets(event_id);
CREATE INDEX idx_tickets_status ON tickets(status);

-- Dependent tables: Payment, QRCode, OTPCode, AuditLog

CREATE TABLE payments (
  id serial PRIMARY KEY,
  ticket_id integer NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  transaction_number varchar(100) NOT NULL,
  amount decimal(10,2) NOT NULL,
  sender_name varchar(255) NOT NULL,
  submitted_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at timestamp with time zone,
  CONSTRAINT unique_transaction_number UNIQUE (transaction_number)
);

CREATE INDEX idx_payments_ticket_id ON payments(ticket_id);
CREATE INDEX idx_payments_transaction_number ON payments(transaction_number);

CREATE TABLE qr_codes (
  id serial PRIMARY KEY,
  ticket_id integer NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  code_type qr_code_type NOT NULL,
  code_value uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  is_activated boolean NOT NULL DEFAULT false,
  scanned_at timestamp with time zone,
  scanned_by_scanner_id integer REFERENCES scanners(id) ON DELETE SET NULL,
  CONSTRAINT chk_qr_scanned_fields CHECK (
    (is_activated IS TRUE AND scanned_at IS NOT NULL AND scanned_by_scanner_id IS NOT NULL) OR
    (is_activated IS FALSE AND scanned_at IS NULL AND scanned_by_scanner_id IS NULL)
  )
);

CREATE INDEX idx_qr_codes_ticket_id ON qr_codes(ticket_id);
CREATE INDEX idx_qr_codes_code_value ON qr_codes(code_value);
CREATE INDEX idx_qr_codes_type ON qr_codes(code_type);
CREATE INDEX idx_qr_codes_scanned_by_scanner_id ON qr_codes(scanned_by_scanner_id);
CREATE INDEX idx_qr_codes_is_activated ON qr_codes(is_activated);

CREATE TABLE otp_codes (
  id serial PRIMARY KEY,
  graduate_id integer NOT NULL REFERENCES graduates(id) ON DELETE CASCADE,
  purpose otp_purpose NOT NULL,
  code_hash varchar(255) NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  failed_attempts smallint NOT NULL DEFAULT 0,
  used_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_otp_used_expired CHECK (
    (used_at IS NULL) OR (used_at <= expires_at)
  )
);

CREATE INDEX idx_otp_codes_graduate_id ON otp_codes(graduate_id);
CREATE INDEX idx_otp_codes_purpose ON otp_codes(purpose);
CREATE INDEX idx_otp_codes_expires_at ON otp_codes(expires_at);

CREATE TABLE audit_logs (
  id serial PRIMARY KEY,
  actor_type actor_type NOT NULL,
  actor_id integer NOT NULL,
  action varchar(255) NOT NULL,
  target varchar(255) NOT NULL,
  details text,
  created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_actor_type_id ON audit_logs(actor_type, actor_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_target ON audit_logs(target);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- Triggers and functions to maintain data integrity
CREATE OR REPLACE FUNCTION update_ticket_confirmed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'CONFIRMED' AND OLD.status != 'CONFIRMED' THEN
    NEW.confirmed_at = CURRENT_TIMESTAMP;
  ELSIF NEW.status != 'CONFIRMED' AND OLD.status = 'CONFIRMED' THEN
    NEW.confirmed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ticket_status_confirmed
  BEFORE UPDATE ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_ticket_confirmed_at();

-- Additional constraints for data integrity
-- Ensure QR codes for companions can only be activated after graduate QR is scanned
-- This is enforced at application level as per SRS, but schema is ready

COMMENT ON CONSTRAINT unique_ticket_graduate_event ON tickets IS 'Each graduate has only one ticket per event as per SRS';
COMMENT ON CONSTRAINT unique_transaction_number ON payments IS 'Transaction number must be unique as per SRS';
COMMENT ON CONSTRAINT unique_event_university_id ON university_records IS 'Event and university_id pair must be unique as per SRS';