-- ============================================================
-- Tilbud — flyt fra disk-storage (.tilbud-store.json) til Postgres.
-- Linjer og faste omkostninger gemmes som JSONB.
-- ============================================================

CREATE TABLE IF NOT EXISTS tilbud (
  id TEXT PRIMARY KEY,
  offer_number TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Tilbud',
  offer_date TEXT NOT NULL DEFAULT '',
  valid_until TEXT DEFAULT '',
  our_reference TEXT DEFAULT '',
  your_reference TEXT DEFAULT '',
  client_name TEXT NOT NULL DEFAULT '',
  media_agency TEXT DEFAULT '',
  campaign_name TEXT DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'DKK',
  vat_pct NUMERIC NOT NULL DEFAULT 25,
  info_compensation_pct NUMERIC NOT NULL DEFAULT 1.5,
  security_pct NUMERIC NOT NULL DEFAULT 1,
  comments TEXT DEFAULT '',
  terms TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','final')),
  lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  fixed_costs JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tilbud_status ON tilbud(status);
CREATE INDEX IF NOT EXISTS idx_tilbud_client_name ON tilbud(client_name);
CREATE INDEX IF NOT EXISTS idx_tilbud_updated_at ON tilbud(updated_at DESC);

CREATE OR REPLACE FUNCTION update_tilbud_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tilbud_updated_at ON tilbud;
CREATE TRIGGER trg_tilbud_updated_at
  BEFORE UPDATE ON tilbud
  FOR EACH ROW
  EXECUTE FUNCTION update_tilbud_updated_at();
