-- ============================================================
-- Cases: per-stilladscase økonomi-overblik
--
-- A case represents a physical scaffolding installation with its
-- own 1-12 month duration window. Within that window, multiple
-- advertiser bookings (sales) can rotate. Hyde shares the media
-- revenue with the bygherre (default 40/60 split).
--
-- 3 tables:
--   cases             — one row per scaffolding case, sales as JSONB
--   case_settings     — singleton row of default cost prices
--   operating_expenses — recurring monthly costs (rent, salary, etc.)
-- ============================================================

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  case_number TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Case',
  tilbud_id TEXT DEFAULT '',
  placement_id TEXT DEFAULT '',
  address TEXT DEFAULT '',
  bygherre_navn TEXT DEFAULT '',
  bygherre_contact_id TEXT DEFAULT '',
  start_date TEXT DEFAULT '',
  end_date TEXT DEFAULT '',
  varighed_maaneder INTEGER NOT NULL DEFAULT 1
    CHECK (varighed_maaneder BETWEEN 1 AND 12),
  area_sqm NUMERIC NOT NULL DEFAULT 0,
  hyde_share_pct NUMERIC NOT NULL DEFAULT 40
    CHECK (hyde_share_pct BETWEEN 0 AND 100),
  bygherre_share_pct NUMERIC NOT NULL DEFAULT 60
    CHECK (bygherre_share_pct BETWEEN 0 AND 100),
  sales JSONB NOT NULL DEFAULT '[]'::jsonb,
  costs JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'tilbud_sendt'
    CHECK (status IN ('tilbud_sendt','godkendt','opsat','i_drift','nedtaget','afsluttet','tabt')),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_tilbud_id ON cases(tilbud_id);
CREATE INDEX IF NOT EXISTS idx_cases_updated_at ON cases(updated_at DESC);

CREATE OR REPLACE FUNCTION update_cases_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cases_updated_at ON cases;
CREATE TRIGGER trg_cases_updated_at
  BEFORE UPDATE ON cases
  FOR EACH ROW
  EXECUTE FUNCTION update_cases_updated_at();

-- ─── Case settings (singleton) ──────────────────────────────

CREATE TABLE IF NOT EXISTS case_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  produktion_kost_per_sqm NUMERIC NOT NULL DEFAULT 90,
  montering_kost_per_sqm NUMERIC NOT NULL DEFAULT 70,
  default_hyde_share_pct NUMERIC NOT NULL DEFAULT 40
    CHECK (default_hyde_share_pct BETWEEN 0 AND 100),
  default_overhead_per_month NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO case_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

-- ─── Operating expenses ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS operating_expenses (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'andet'
    CHECK (category IN ('loen','leje','forsikring','transport','marketing','software','andet')),
  amount_per_month NUMERIC NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operating_expenses_enabled ON operating_expenses(enabled);

CREATE OR REPLACE FUNCTION update_operating_expenses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_operating_expenses_updated_at ON operating_expenses;
CREATE TRIGGER trg_operating_expenses_updated_at
  BEFORE UPDATE ON operating_expenses
  FOR EACH ROW
  EXECUTE FUNCTION update_operating_expenses_updated_at();
