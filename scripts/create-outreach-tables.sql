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
  replied_at      TIMESTAMPTZ,
  follow_up_count INT NOT NULL DEFAULT 0,
  next_follow_up_at TIMESTAMPTZ,
  gmail_message_id TEXT,
  gmail_thread_id  TEXT,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
