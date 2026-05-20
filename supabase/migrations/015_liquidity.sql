-- ============================================================
-- Likviditet — kassebeholdning + moms til runway-beregning.
-- Felterne lægges på case_settings (singleton).
-- ============================================================

ALTER TABLE case_settings
  ADD COLUMN IF NOT EXISTS cash_balance NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_balance_updated_at TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS moms_pct NUMERIC NOT NULL DEFAULT 25;
