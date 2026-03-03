-- ============================================================
-- Ejendom AI – Complete Database Setup
-- Run this ONCE in Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- ── OOH Store tables ──

CREATE TABLE IF NOT EXISTS frames (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  location_address TEXT,
  location_city   TEXT,
  frame_type      TEXT NOT NULL DEFAULT 'other',
  drive_file_id   TEXT,
  frame_image_url TEXT NOT NULL,
  placement       JSONB NOT NULL,
  placements      JSONB NOT NULL DEFAULT '[]',
  frame_width     INT NOT NULL,
  frame_height    INT NOT NULL,
  daily_traffic   INT,
  list_price      NUMERIC,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE frames ADD COLUMN IF NOT EXISTS placements JSONB NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS creatives (
  id              TEXT PRIMARY KEY,
  filename        TEXT NOT NULL,
  drive_file_id   TEXT,
  drive_folder_id TEXT,
  company_name    TEXT NOT NULL DEFAULT '',
  company_id      TEXT,
  campaign_name   TEXT,
  mime_type       TEXT,
  file_size       INT,
  width           INT,
  height          INT,
  thumbnail_url   TEXT,
  tags            JSONB NOT NULL DEFAULT '[]',
  category        TEXT,
  color_profile   TEXT,
  usage_count     INT NOT NULL DEFAULT 0,
  last_used_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS presentation_templates (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  pdf_file_url    TEXT NOT NULL,
  page_count      INT NOT NULL DEFAULT 0,
  pages           JSONB NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS networks (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  frame_ids       JSONB NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── OOH Outreach ──

CREATE TABLE IF NOT EXISTS ooh_contacts (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT,
  company         TEXT NOT NULL DEFAULT '',
  industry        TEXT,
  city            TEXT,
  notes           TEXT,
  tags            JSONB NOT NULL DEFAULT '[]',
  last_contacted_at TIMESTAMPTZ,
  total_proposals_sent INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ooh_campaigns (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft',
  network_id      TEXT,
  frame_ids       JSONB NOT NULL DEFAULT '[]',
  creative_id     TEXT,
  template_id     TEXT,
  contact_ids     JSONB NOT NULL DEFAULT '[]',
  email_subject   TEXT NOT NULL DEFAULT '',
  email_body      TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at         TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ooh_sends (
  id              TEXT PRIMARY KEY,
  campaign_id     TEXT NOT NULL,
  contact_id      TEXT NOT NULL,
  contact_name    TEXT,
  contact_email   TEXT,
  contact_company TEXT,
  proposal_pdf_url TEXT,
  status          TEXT NOT NULL DEFAULT 'queued',
  sent_at         TIMESTAMPTZ,
  opened_at       TIMESTAMPTZ,
  clicked_at      TIMESTAMPTZ,
  replied_at      TIMESTAMPTZ,
  follow_up_count INT NOT NULL DEFAULT 0,
  next_follow_up_at TIMESTAMPTZ,
  gmail_message_id TEXT,
  gmail_thread_id  TEXT,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Staged Properties ──

CREATE TABLE IF NOT EXISTS staged_properties (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  address               TEXT NOT NULL,
  postal_code           TEXT,
  city                  TEXT,
  outdoor_score         REAL,
  outdoor_notes         TEXT,
  daily_traffic         INTEGER,
  traffic_source        TEXT,
  owner_company         TEXT,
  owner_cvr             TEXT,
  research_summary      TEXT,
  research_links        TEXT,
  contact_person        TEXT,
  contact_email         TEXT,
  contact_phone         TEXT,
  email_draft_subject   TEXT,
  email_draft_body      TEXT,
  email_draft_note      TEXT,
  source                TEXT NOT NULL DEFAULT 'discovery',
  stage                 TEXT NOT NULL DEFAULT 'new',
  hubspot_id            TEXT,
  research_started_at   TIMESTAMPTZ,
  research_completed_at TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staged_properties_stage ON staged_properties(stage);
CREATE INDEX IF NOT EXISTS idx_staged_properties_address ON staged_properties(address);

CREATE OR REPLACE FUNCTION staged_property_counts()
RETURNS TABLE(stage TEXT, count BIGINT)
LANGUAGE SQL STABLE
AS $$
  SELECT stage, COUNT(*) FROM staged_properties GROUP BY stage;
$$;

-- ── Email Queue ──

CREATE TABLE IF NOT EXISTS email_queue (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  contact_name TEXT,
  attachments TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  queued_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  error TEXT,
  message_id TEXT,
  retries INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status);
CREATE INDEX IF NOT EXISTS idx_email_queue_queued_at ON email_queue(queued_at);

-- ── KV Store ──

CREATE TABLE IF NOT EXISTS kv_store (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Mail Thread <-> Property mapping ──

CREATE TABLE IF NOT EXISTS mail_thread_property (
  thread_id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL
);

-- ── Agent Activity ──

CREATE TABLE IF NOT EXISTS agent_activity (
  id TEXT PRIMARY KEY,
  street TEXT NOT NULL,
  city TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'discovery',
  progress INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  buildings_found INTEGER,
  created_count INTEGER,
  research_completed INTEGER,
  research_total INTEGER,
  started_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ
);

-- ── AI Settings ──

CREATE TABLE IF NOT EXISTS ai_settings (
  id TEXT PRIMARY KEY,
  tone_of_voice TEXT,
  example_emails TEXT,
  sender_name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Migrations 001-010
-- ============================================================

-- 001: Discovery Config
CREATE TABLE IF NOT EXISTS discovery_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('scaffolding', 'street')),
  city TEXT NOT NULL,
  street TEXT,
  min_score NUMERIC DEFAULT 6,
  min_traffic INTEGER DEFAULT 10000,
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 002: Research reasoning columns on staged_properties
ALTER TABLE staged_properties ADD COLUMN IF NOT EXISTS research_reasoning text;
ALTER TABLE staged_properties ADD COLUMN IF NOT EXISTS data_quality text;
ALTER TABLE staged_properties ADD COLUMN IF NOT EXISTS contact_reasoning text;

-- 003: Analytics Daily
CREATE TABLE IF NOT EXISTS analytics_daily (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  discovered int NOT NULL DEFAULT 0,
  staged int NOT NULL DEFAULT 0,
  in_hubspot int NOT NULL DEFAULT 0,
  ready int NOT NULL DEFAULT 0,
  sent int NOT NULL DEFAULT 0,
  replied int NOT NULL DEFAULT 0,
  meetings int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(snapshot_date)
);

-- 004: App Config
CREATE TABLE IF NOT EXISTS app_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 005: Leads
CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  cvr TEXT,
  address TEXT,
  industry TEXT,
  website TEXT,
  domain TEXT,
  egenkapital NUMERIC,
  resultat NUMERIC,
  omsaetning NUMERIC,
  page_category TEXT,
  page_likes INTEGER,
  ad_count INTEGER DEFAULT 0,
  platforms TEXT[] DEFAULT '{}',
  ooh_score INTEGER DEFAULT 0,
  ooh_reason TEXT,
  source_platform TEXT NOT NULL DEFAULT 'meta',
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','qualified','contacted','customer','lost')),
  hubspot_company_id TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  last_contacted_at TIMESTAMPTZ,
  next_followup_at TIMESTAMPTZ,
  notes JSONB DEFAULT '[]',
  discovered_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_name_unique ON leads(name);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_source_platform ON leads(source_platform);

CREATE OR REPLACE FUNCTION update_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leads_updated_at ON leads;
CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION update_leads_updated_at();

-- 006: Contacts JSONB columns
ALTER TABLE staged_properties ADD COLUMN IF NOT EXISTS contacts jsonb DEFAULT '[]';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contacts jsonb DEFAULT '[]';

-- 007: Lead pitch column
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ooh_pitch text;

-- 008: Research Logs
CREATE TABLE IF NOT EXISTS research_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   text NOT NULL,
  property_name text,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  status        text NOT NULL DEFAULT 'running',
  steps         jsonb NOT NULL DEFAULT '[]',
  cvr_found     text,
  emails_found  text[],
  contacts_found jsonb,
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS research_logs_property_id_idx ON research_logs(property_id);
CREATE INDEX IF NOT EXISTS research_logs_started_at_idx  ON research_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS research_logs_status_idx      ON research_logs(status);

-- 009: Placements
CREATE TABLE IF NOT EXISTS placements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  area_sqm NUMERIC NOT NULL DEFAULT 0,
  list_price_per_sqm_per_week NUMERIC NOT NULL DEFAULT 0,
  kommunale_gebyr NUMERIC NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_placements_name ON placements (name);

-- 010: Agent Briefings
CREATE TABLE IF NOT EXISTS agent_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  summary TEXT NOT NULL DEFAULT '',
  data JSONB NOT NULL DEFAULT '{}',
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_briefings_date ON agent_briefings (date DESC);

-- ============================================================
-- Done! All tables are ready.
-- ============================================================
