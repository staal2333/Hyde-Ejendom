-- Add ooh_pitch column to leads table for storing LLM-generated OOH sales pitches
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ooh_pitch text;
