-- Migration: Create discovery_config table
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query)

CREATE TABLE IF NOT EXISTS discovery_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('scaffolding', 'street')),
  city TEXT NOT NULL,
  street TEXT,
  min_score NUMERIC DEFAULT 6,
  min_traffic INTEGER DEFAULT 10000,
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE discovery_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY discovery_config_service_role ON discovery_config
  FOR ALL
  USING (true)
  WITH CHECK (true);
