-- Mail thread → property mapping (persist across restarts)
-- Run in Supabase SQL editor if you use Supabase for persistence.

create table if not exists mail_thread_property (
  thread_id text primary key,
  property_id text not null,
  created_at timestamptz default now()
);

create index if not exists idx_mail_thread_property_property_id on mail_thread_property(property_id);

-- RLS: allow service role (server) full access; no anon access needed for this table.
