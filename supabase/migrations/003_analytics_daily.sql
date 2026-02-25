CREATE TABLE IF NOT EXISTS analytics_daily (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  discovered int NOT NULL DEFAULT 0,
  staged int NOT NULL DEFAULT 0,
  in_hubspot int NOT NULL DEFAULT 0,
  ready int NOT NULL DEFAULT 0,
  sent int NOT NULL DEFAULT 0,
  replied int NOT NULL DEFAULT 0,
  meetings int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(snapshot_date)
);
