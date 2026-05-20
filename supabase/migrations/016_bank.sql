-- ============================================================
-- Bank-transaktioner — importeret fra Lunar kontoudtog (PDF).
-- Bruges til at fodre Likviditet-dashboardet med faktiske tal.
-- ============================================================

CREATE TABLE IF NOT EXISTS bank_transactions (
  id TEXT PRIMARY KEY,              -- hash af dato+titel+beløb+saldo (dedup ved gen-import)
  posted_date DATE NOT NULL,
  posted_time TEXT DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  amount NUMERIC NOT NULL DEFAULT 0,
  balance NUMERIC NOT NULL DEFAULT 0,
  fx_amount NUMERIC,                -- oprindeligt beløb i fremmed valuta
  fx_currency TEXT,
  category TEXT NOT NULL DEFAULT 'andet'
    CHECK (category IN ('indtaegt','leverandoer','software','loen','skat_moms','overfoersel','andet')),
  account TEXT DEFAULT '',
  imported_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_tx_date ON bank_transactions(posted_date DESC);
CREATE INDEX IF NOT EXISTS idx_bank_tx_category ON bank_transactions(category);
