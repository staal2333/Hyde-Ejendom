-- Placement templates for tilbud line auto-population
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
