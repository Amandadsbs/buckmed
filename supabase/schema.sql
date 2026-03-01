-- ═══════════════════════════════════════════════════════════════════════════════
-- MedTracker – Supabase Database Schema
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Patients ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patients (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('human', 'pet')) DEFAULT 'human',
  species     TEXT,                          -- for pets (e.g. "Golden Retriever")
  birth_date  DATE,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Caregivers ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS caregivers (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                  TEXT NOT NULL,
  phone                 TEXT NOT NULL UNIQUE,  -- E.164 format: +15551234567
  email                 TEXT UNIQUE,
  google_refresh_token  TEXT,                  -- stored after OAuth flow
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Medications ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS medications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id  UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  dosage      TEXT NOT NULL,
  frequency   TEXT NOT NULL CHECK (frequency IN (
                'daily', 'twice_daily', 'three_times_daily', 'weekly', 'custom'
              )),
  times       TEXT[]  NOT NULL DEFAULT '{}',   -- e.g. ['08:00', '20:00']
  start_date  DATE    NOT NULL DEFAULT CURRENT_DATE,
  end_date    DATE,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Medication Logs ────────────────────────────────────────────────────────────
-- The UNIQUE constraint on (medication_id, scheduled_date, scheduled_time)
-- is the PRIMARY database-level guard against double-dosing:
-- only ONE row can exist per medication per time slot per day.
CREATE TABLE IF NOT EXISTS medication_logs (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  medication_id    UUID NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  caregiver_id     UUID REFERENCES caregivers(id) ON DELETE SET NULL,
  scheduled_date   DATE NOT NULL,
  scheduled_time   TIME NOT NULL,
  completed_at     TIMESTAMPTZ,  -- NULL = pending, set = done
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ✅ KEY CONSTRAINT: prevents double-dosing at the DB level
  CONSTRAINT unique_dose_per_slot UNIQUE (medication_id, scheduled_date, scheduled_time)
);

-- ─── ADDITIONAL SAFETY: partial unique index blocks concurrent "done" inserts ──
-- Ensures only one completed_at value can exist per slot
CREATE UNIQUE INDEX IF NOT EXISTS idx_log_one_completion
  ON medication_logs (medication_id, scheduled_date, scheduled_time)
  WHERE completed_at IS NOT NULL;

-- ── Indexes ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_logs_date       ON medication_logs (scheduled_date);
CREATE INDEX IF NOT EXISTS idx_logs_medication ON medication_logs (medication_id);
CREATE INDEX IF NOT EXISTS idx_meds_patient    ON medications (patient_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ══════════════════════════════════════════════════════════════════════════════
-- Enable RLS on all tables
ALTER TABLE patients        ENABLE ROW LEVEL SECURITY;
ALTER TABLE caregivers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE medications     ENABLE ROW LEVEL SECURITY;
ALTER TABLE medication_logs ENABLE ROW LEVEL SECURITY;

-- For now, allow all authenticated users full access.
-- Tighten these policies when you add Supabase Auth.
CREATE POLICY "Allow all for authenticated" ON patients
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated" ON caregivers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated" ON medications
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated" ON medication_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Service role bypasses RLS (used by cron jobs)
-- Nothing to configure — Supabase service role always bypasses RLS.

-- ══════════════════════════════════════════════════════════════════════════════
-- REAL-TIME PUBLICATION
-- ══════════════════════════════════════════════════════════════════════════════
-- Enable real-time for medication_logs (used by MedChecklist live updates)
ALTER PUBLICATION supabase_realtime ADD TABLE medication_logs;

-- ══════════════════════════════════════════════════════════════════════════════
-- SEED DATA (optional – delete in production)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO caregivers (id, name, phone) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Primary Caregiver', '+15550000001'),
  ('00000000-0000-0000-0000-000000000002', 'Secondary Caregiver', '+15550000002')
ON CONFLICT DO NOTHING;

INSERT INTO patients (id, name, type, species) VALUES
  ('00000000-0000-0000-0000-000000000010', 'John Smith', 'human', NULL),
  ('00000000-0000-0000-0000-000000000011', 'Buddy', 'pet', 'Golden Retriever')
ON CONFLICT DO NOTHING;

INSERT INTO medications (id, patient_id, name, dosage, frequency, times, start_date) VALUES
  (
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000010',
    'Aspirin', '100mg', 'daily', ARRAY['08:00'], CURRENT_DATE
  ),
  (
    '00000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000010',
    'Metformin', '500mg', 'twice_daily', ARRAY['08:00', '20:00'], CURRENT_DATE
  ),
  (
    '00000000-0000-0000-0000-000000000022',
    '00000000-0000-0000-0000-000000000011',
    'Simparica Trio', '1 chew', 'weekly', ARRAY['09:00'], CURRENT_DATE
  )
ON CONFLICT DO NOTHING;

-- Generate today's logs for the seed medications
INSERT INTO medication_logs (medication_id, scheduled_date, scheduled_time)
SELECT id, CURRENT_DATE, unnest(times)::TIME
FROM medications
ON CONFLICT ON CONSTRAINT unique_dose_per_slot DO NOTHING;
