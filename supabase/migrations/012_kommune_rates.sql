-- ============================================================
-- Per-kommune kommunale gebyrer pr. m²
--
-- Kommunale gebyrer (stilladstilladelse + reklame-ansøgning) varierer
-- per kommune. I stedet for ét globalt tal gemmer vi en liste i
-- case_settings og kobler hver case til en specifik kommune.
-- ============================================================

-- Tilføj kommune-felt til cases
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS kommune TEXT DEFAULT '';

-- Tilføj kommunale rates (JSONB array) til case_settings
ALTER TABLE case_settings
  ADD COLUMN IF NOT EXISTS kommunale_rates JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Seed default rates for København og Frederiksberg.
-- Rates er placeholder (0) — brugeren udfylder faktiske beløb i UI.
UPDATE case_settings
SET kommunale_rates = '[
  {"kommune": "København", "perSqm": 0},
  {"kommune": "Frederiksberg", "perSqm": 0}
]'::jsonb
WHERE id = 'default'
  AND (kommunale_rates IS NULL OR kommunale_rates = '[]'::jsonb);
