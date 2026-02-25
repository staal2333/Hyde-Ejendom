-- Add research_reasoning column for detailed source attribution and evidence chain
ALTER TABLE staged_properties ADD COLUMN IF NOT EXISTS research_reasoning text;

-- Add data_quality column to store the quality assessment level
ALTER TABLE staged_properties ADD COLUMN IF NOT EXISTS data_quality text;

-- Add contact_reasoning column for why a particular contact was chosen
ALTER TABLE staged_properties ADD COLUMN IF NOT EXISTS contact_reasoning text;
