-- Lead pipeline table for multi-platform ad library leads
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

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION update_leads_updated_at();
