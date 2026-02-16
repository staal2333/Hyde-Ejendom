#!/usr/bin/env node
// ============================================================
// Migrate existing local OOH data to Supabase (Postgres + Storage)
//
// Prerequisites:
//   1. Supabase project created with tables (run setup-db.sql first)
//   2. Storage bucket "ooh-files" created and set to public
//   3. .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
//   4. .ooh-store.json exists with current data
//   5. public/ooh/ has the image files
//
// Usage: node scripts/migrate-to-cloud.js
// ============================================================

require("dotenv").config({ path: ".env.local" });

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "ooh-files";

async function main() {
  // ── Check env vars ──
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error(
      "❌  NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set.\n" +
        "   Create a .env.local file with these values from your Supabase project settings."
    );
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });

  // ── Load local store ──
  const storePath = path.join(process.cwd(), ".ooh-store.json");
  if (!fs.existsSync(storePath)) {
    console.error("❌  .ooh-store.json not found");
    process.exit(1);
  }

  const store = JSON.parse(fs.readFileSync(storePath, "utf-8"));
  console.log(
    `📦  Found: ${Object.keys(store.frames || {}).length} frames, ` +
      `${Object.keys(store.creatives || {}).length} creatives, ` +
      `${Object.keys(store.presentationTemplates || {}).length} templates, ` +
      `${Object.keys(store.networks || {}).length} networks`
  );

  // ── Ensure storage bucket exists ──
  console.log("\n🪣  Checking storage bucket...");
  const { data: buckets } = await supabase.storage.listBuckets();
  const bucketExists = buckets?.some((b) => b.name === BUCKET);
  if (!bucketExists) {
    const { error } = await supabase.storage.createBucket(BUCKET, {
      public: true,
    });
    if (error) {
      console.error("❌  Could not create bucket:", error.message);
      console.log(
        '   Create it manually in Supabase dashboard: Storage -> New Bucket -> "ooh-files" -> Public'
      );
    } else {
      console.log(`   ✅  Created bucket "${BUCKET}"`);
    }
  } else {
    console.log(`   ✅  Bucket "${BUCKET}" already exists`);
  }

  // ── Helper: upload file to Supabase Storage ──
  async function uploadToStorage(localRelPath, storagePath) {
    // Skip if already an HTTP URL
    if (localRelPath.startsWith("http")) {
      console.log(
        `   ⏭️  Already a URL: ${localRelPath.substring(0, 60)}...`
      );
      return localRelPath;
    }

    const localFull = path.join(process.cwd(), "public", localRelPath);
    if (!fs.existsSync(localFull)) {
      console.warn(`   ⚠️  File not found: ${localFull}`);
      return localRelPath; // keep original path as fallback
    }

    const buffer = fs.readFileSync(localFull);
    const ext = path.extname(localFull).toLowerCase();
    const mimeMap = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".pdf": "application/pdf",
    };
    const contentType = mimeMap[ext] || "application/octet-stream";

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType, upsert: true });

    if (error) {
      console.warn(`   ⚠️  Upload failed for ${storagePath}: ${error.message}`);
      return localRelPath;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

    console.log(
      `   ☁️  Uploaded: ${storagePath} (${Math.round(buffer.length / 1024)}KB)`
    );
    return publicUrl;
  }

  // ── Migrate frames ──
  const framesList = Object.values(store.frames || {});
  if (framesList.length) {
    console.log(`\n🖼️  Migrating ${framesList.length} frames...`);
    for (const f of framesList) {
      const imageUrl = await uploadToStorage(
        f.frameImageUrl,
        `frames/${path.basename(f.frameImageUrl)}`
      );

      const { error } = await supabase.from("frames").upsert(
        {
          id: f.id,
          name: f.name,
          location_address: f.locationAddress || null,
          location_city: f.locationCity || null,
          frame_type: f.frameType || "other",
          drive_file_id: f.driveFileId || null,
          frame_image_url: imageUrl,
          placement: f.placement,
          frame_width: f.frameWidth,
          frame_height: f.frameHeight,
          daily_traffic: f.dailyTraffic || null,
          list_price: f.listPrice || null,
          is_active: f.isActive !== false,
          created_at: f.createdAt,
          updated_at: f.updatedAt,
        },
        { onConflict: "id" }
      );

      if (error) {
        console.error(`   ❌  Frame ${f.name}: ${error.message}`);
      } else {
        console.log(`   ✅  Frame: ${f.name} (${f.id})`);
      }
    }
  }

  // ── Migrate creatives ──
  const creativesList = Object.values(store.creatives || {});
  if (creativesList.length) {
    console.log(`\n🎨  Migrating ${creativesList.length} creatives...`);
    for (const c of creativesList) {
      let thumbUrl = c.thumbnailUrl || "";
      if (thumbUrl && !thumbUrl.startsWith("http")) {
        thumbUrl = await uploadToStorage(
          thumbUrl,
          `creatives/${path.basename(thumbUrl)}`
        );
      }

      const { error } = await supabase.from("creatives").upsert(
        {
          id: c.id,
          filename: c.filename || "",
          drive_file_id: c.driveFileId || null,
          drive_folder_id: c.driveFolderId || null,
          company_name: c.companyName || "",
          company_id: c.companyId || null,
          campaign_name: c.campaignName || null,
          mime_type: c.mimeType || null,
          file_size: c.fileSize || null,
          width: c.width || null,
          height: c.height || null,
          thumbnail_url: thumbUrl,
          tags: c.tags || [],
          category: c.category || null,
          color_profile: c.colorProfile || null,
          usage_count: c.usageCount || 0,
          last_used_at: c.lastUsedAt || null,
          created_at: c.createdAt,
          updated_at: c.updatedAt,
        },
        { onConflict: "id" }
      );

      if (error) {
        console.error(`   ❌  Creative ${c.filename}: ${error.message}`);
      } else {
        console.log(`   ✅  Creative: ${c.filename || c.id}`);
      }
    }
  }

  // ── Migrate presentation templates ──
  const templatesList = Object.values(store.presentationTemplates || {});
  if (templatesList.length) {
    console.log(
      `\n📄  Migrating ${templatesList.length} presentation templates...`
    );
    for (const t of templatesList) {
      let pdfUrl = t.pdfFileUrl || "";
      if (pdfUrl && !pdfUrl.startsWith("http")) {
        pdfUrl = await uploadToStorage(
          pdfUrl,
          `templates/${path.basename(pdfUrl)}`
        );
      }

      const { error } = await supabase.from("presentation_templates").upsert(
        {
          id: t.id,
          name: t.name,
          pdf_file_url: pdfUrl,
          page_count: t.pageCount || 0,
          pages: t.pages || [],
          created_at: t.createdAt,
          updated_at: t.updatedAt,
        },
        { onConflict: "id" }
      );

      if (error) {
        console.error(`   ❌  Template ${t.name}: ${error.message}`);
      } else {
        console.log(`   ✅  Template: ${t.name} (${t.id})`);
      }
    }
  }

  // ── Migrate networks ──
  const networksList = Object.values(store.networks || {});
  if (networksList.length) {
    console.log(`\n🌐  Migrating ${networksList.length} networks...`);
    for (const n of networksList) {
      const { error } = await supabase.from("networks").upsert(
        {
          id: n.id,
          name: n.name,
          description: n.description || null,
          frame_ids: n.frameIds || [],
          created_at: n.createdAt,
          updated_at: n.updatedAt,
        },
        { onConflict: "id" }
      );

      if (error) {
        console.error(`   ❌  Network ${n.name}: ${error.message}`);
      } else {
        console.log(`   ✅  Network: ${n.name} (${n.id})`);
      }
    }
  }

  console.log("\n✅  Migration complete!");
  console.log("   Next steps:");
  console.log("   1. Add env vars to Vercel: npx vercel env add");
  console.log("   2. Deploy: npx vercel deploy --prod");
  console.log("   3. Test the OOH tool on the deployed URL");
}

main().catch((e) => {
  console.error("❌  Migration failed:", e);
  process.exit(1);
});
