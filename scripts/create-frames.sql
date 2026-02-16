CREATE TABLE IF NOT EXISTS frames (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  location_address TEXT,
  location_city   TEXT,
  frame_type      TEXT NOT NULL DEFAULT 'other',
  drive_file_id   TEXT,
  frame_image_url TEXT NOT NULL,
  placement       JSONB NOT NULL,
  frame_width     INT NOT NULL,
  frame_height    INT NOT NULL,
  daily_traffic   INT,
  list_price      NUMERIC,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
