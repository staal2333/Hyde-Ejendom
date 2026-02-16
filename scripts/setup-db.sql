-- ============================================================
-- OOH Store – Vercel Postgres / Neon schema
-- Run this once to create all tables.
-- ============================================================

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

-- Migration: add placements column to existing tables
ALTER TABLE frames ADD COLUMN IF NOT EXISTS placements JSONB NOT NULL DEFAULT '[]';

-- Migration: add clicked_at column to sends
ALTER TABLE ooh_sends ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ;

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

-- ============================================================
-- OOH Outreach tables
-- ============================================================

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

-- ============================================================
-- Staged Properties – Local staging before HubSpot push
-- Properties land here from Discovery / Street Agent / manual add.
-- Only approved properties get pushed to HubSpot CRM.
-- ============================================================

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
  -- Research data (filled after research runs on staging)
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
  -- Staging metadata
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

-- Efficient count-by-stage RPC function (avoids full table scan)
CREATE OR REPLACE FUNCTION staged_property_counts()
RETURNS TABLE(stage TEXT, count BIGINT)
LANGUAGE SQL STABLE
AS $$
  SELECT stage, COUNT(*) FROM staged_properties GROUP BY stage;
$$;
