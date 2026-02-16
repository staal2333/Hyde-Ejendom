#!/usr/bin/env node
// Create OOH tables in Supabase using the REST API (direct SQL via rpc)
// Usage: node scripts/create-tables.js

require("dotenv").config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  // Use the Supabase Management API / direct Postgres connection
  // Since supabase-js doesn't support raw DDL, we'll use the pg connection
  const fs = require("fs");
  const path = require("path");
  const sql = fs.readFileSync(path.join(__dirname, "setup-db.sql"), "utf-8");
  
  // Split into individual statements
  const statements = sql
    .split(";")
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith("--"));

  console.log(`📋  Running ${statements.length} SQL statements...`);

  // Use the Postgres connection string from env
  const pgUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  
  if (pgUrl) {
    // Direct Postgres connection
    const { Client } = require("pg");
    const client = new Client({ connectionString: pgUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    
    for (const stmt of statements) {
      console.log(`   Executing: ${stmt.substring(0, 60)}...`);
      await client.query(stmt + ";");
    }
    
    await client.end();
    console.log("✅  All tables created!");
  } else {
    console.log("⚠️  No POSTGRES_URL found. Please run the SQL manually in the Supabase dashboard:");
    console.log("   1. Go to supabase.com -> your project -> SQL Editor");
    console.log("   2. Paste the contents of scripts/setup-db.sql");
    console.log("   3. Click Run");
    console.log("\nSQL to run:");
    console.log(sql);
  }
}

main().catch(e => { console.error("❌", e); process.exit(1); });
