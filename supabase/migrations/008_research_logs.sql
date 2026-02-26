-- Research workflow logs
-- Persists per-step results for every research run so they survive Vercel cold starts.
CREATE TABLE IF NOT EXISTS research_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   text NOT NULL,
  property_name text,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  status        text NOT NULL DEFAULT 'running',  -- running | completed | failed | cancelled
  steps         jsonb NOT NULL DEFAULT '[]',      -- array of WorkflowStep objects
  cvr_found     text,                             -- CVR number if discovered
  emails_found  text[],                           -- emails discovered
  contacts_found jsonb,                           -- ranked contacts array
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS research_logs_property_id_idx ON research_logs(property_id);
CREATE INDEX IF NOT EXISTS research_logs_started_at_idx  ON research_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS research_logs_status_idx      ON research_logs(status);
