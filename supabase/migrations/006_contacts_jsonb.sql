-- Add contacts JSONB column for storing multiple contacts per property/lead
ALTER TABLE staged_properties ADD COLUMN IF NOT EXISTS contacts jsonb DEFAULT '[]';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contacts jsonb DEFAULT '[]';
