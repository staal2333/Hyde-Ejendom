-- ============================================================
-- Omdøb kommune-rate fra perSqm → perSqmPerDag
--
-- Kommunale gebyrer faktureres pr. m² PR. DØGN (fx Frederiksberg
-- 4,5 kr/m²/døgn), ikke som en samlet sats. Det her er en rent
-- semantisk JSONB-omdøbning.
-- ============================================================

UPDATE case_settings
SET kommunale_rates = (
  SELECT jsonb_agg(
    CASE
      WHEN r ? 'perSqmPerDag' THEN r  -- allerede migreret
      ELSE jsonb_build_object(
        'kommune', r->>'kommune',
        'perSqmPerDag', COALESCE((r->>'perSqm')::numeric, 0)
      )
    END
  )
  FROM jsonb_array_elements(kommunale_rates) AS r
)
WHERE id = 'default'
  AND jsonb_typeof(kommunale_rates) = 'array'
  AND jsonb_array_length(kommunale_rates) > 0;

-- Seed Frederiksberg-raten hvis den findes med 0
UPDATE case_settings
SET kommunale_rates = (
  SELECT jsonb_agg(
    CASE
      WHEN (r->>'kommune') ILIKE 'frederiksberg' AND COALESCE((r->>'perSqmPerDag')::numeric, 0) = 0
        THEN jsonb_set(r, '{perSqmPerDag}', '4.5'::jsonb)
      ELSE r
    END
  )
  FROM jsonb_array_elements(kommunale_rates) AS r
)
WHERE id = 'default';
