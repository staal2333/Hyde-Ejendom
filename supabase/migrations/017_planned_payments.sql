-- ============================================================
-- Planlagte betalinger — forventede ind-/udbetalinger til
-- likviditets-prognosen. Plus recurring_burn-override på settings.
-- ============================================================

CREATE TABLE IF NOT EXISTS planned_payments (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL DEFAULT '',
  direction TEXT NOT NULL DEFAULT 'ind' CHECK (direction IN ('ind','ud')),
  amount NUMERIC NOT NULL DEFAULT 0,
  expected_date DATE NOT NULL,
  category TEXT NOT NULL DEFAULT 'andet'
    CHECK (category IN ('faktura','moms','leverandoer','loen','drift','andet')),
  status TEXT NOT NULL DEFAULT 'forventet'
    CHECK (status IN ('forventet','modtaget','betalt')),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planned_payments_date ON planned_payments(expected_date);

-- Manuel override af det månedlige burn (0 = brug auto-beregnet fra bank)
ALTER TABLE case_settings
  ADD COLUMN IF NOT EXISTS recurring_burn NUMERIC NOT NULL DEFAULT 0;
