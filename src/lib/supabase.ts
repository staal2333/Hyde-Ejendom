// ============================================================
// Supabase client – singleton for server-side usage
//
// Env vars:
//   NEXT_PUBLIC_SUPABASE_URL      – project URL (https://xxx.supabase.co)
//   SUPABASE_SERVICE_ROLE_KEY     – service role key (full access, server only)
// ============================================================

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    "[supabase] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set. " +
      "Cloud features (Postgres + Storage) will be unavailable."
  );
}

/**
 * Server-side Supabase client with service role key.
 * Has full access to database and storage.
 */
export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    })
  : null;

/** Whether Supabase is configured and available */
export const HAS_SUPABASE = !!supabase;

/** The OOH file storage bucket name */
export const OOH_BUCKET = "ooh-files";
