#!/usr/bin/env node
// ============================================================
// Package Offline – Creates a self-contained zip of the OOH tool
//
// Usage:  node scripts/package-offline.js
//
// What it does:
//   1. Runs `next build` (standalone output)
//   2. Assembles a dist/ folder with server + public + data
//   3. Creates EjendomAI-Offline.zip ready to share
// ============================================================

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const ZIP_NAME = "EjendomAI-Offline.zip";
const ZIP_PATH = path.join(ROOT, ZIP_NAME);

// ── Helpers ──────────────────────────────────────────────────

function log(msg) {
  console.log(`\n📦  ${msg}`);
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src)) {
      copyRecursive(path.join(src, item), path.join(dest, item));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

// ── 1. Build ─────────────────────────────────────────────────

log("Building Next.js (standalone)...");
execSync("npm run build", { cwd: ROOT, stdio: "inherit", env: { ...process.env, STANDALONE: "1" } });

const standaloneDir = path.join(ROOT, ".next", "standalone");
if (!fs.existsSync(standaloneDir)) {
  console.error("❌  Standalone output not found. Make sure next.config.ts has output: 'standalone'");
  process.exit(1);
}

// ── 2. Assemble dist/ ────────────────────────────────────────

log("Assembling distribution folder...");
cleanDir(DIST);

// Copy standalone server (includes node_modules subset + server.js)
copyRecursive(standaloneDir, DIST);

// Copy public/ → dist/public/  (standalone doesn't include it)
const publicSrc = path.join(ROOT, "public");
const publicDest = path.join(DIST, "public");
if (fs.existsSync(publicSrc)) {
  log("Copying public/ (frames, creatives, templates, pdf.js)...");
  copyRecursive(publicSrc, publicDest);
}

// Copy .next/static/ → dist/.next/static/  (JS/CSS bundles)
const staticSrc = path.join(ROOT, ".next", "static");
const staticDest = path.join(DIST, ".next", "static");
if (fs.existsSync(staticSrc)) {
  log("Copying .next/static/ (JS/CSS bundles)...");
  copyRecursive(staticSrc, staticDest);
}

// Copy OOH data store
const storeSrc = path.join(ROOT, ".ooh-store.json");
if (fs.existsSync(storeSrc)) {
  log("Copying .ooh-store.json (frame & template data)...");
  fs.copyFileSync(storeSrc, path.join(DIST, ".ooh-store.json"));
}

// ── 3. Create start scripts ─────────────────────────────────

log("Creating start scripts...");

// Windows start.bat
fs.writeFileSync(
  path.join(DIST, "start.bat"),
  `@echo off
echo ============================================
echo   Ejendom AI - OOH Proposal Tool (Offline)
echo ============================================
echo.
echo Starting server...
echo Open http://localhost:3000 in your browser
echo.
echo Press Ctrl+C to stop the server.
echo.
set PORT=3000
set HOSTNAME=0.0.0.0
node server.js
pause
`,
  "utf-8"
);

// macOS/Linux start.sh
fs.writeFileSync(
  path.join(DIST, "start.sh"),
  `#!/bin/bash
echo "============================================"
echo "  Ejendom AI - OOH Proposal Tool (Offline)"
echo "============================================"
echo ""
echo "Starting server..."
echo "Open http://localhost:3000 in your browser"
echo ""
echo "Press Ctrl+C to stop the server."
echo ""
PORT=3000 HOSTNAME=0.0.0.0 node server.js
`,
  "utf-8"
);

// ── 4. Create README ─────────────────────────────────────────

fs.writeFileSync(
  path.join(DIST, "README.txt"),
  `================================================================
  EJENDOM AI - OOH Proposal Tool (Offline Version)
================================================================

KRAV:
  - Node.js 18 eller nyere skal vaere installeret
    Download: https://nodejs.org/

SAADAN STARTER DU:
  1. Pak denne zip ud til en mappe
  2. Dobbeltklik paa "start.bat" (Windows) 
     eller koer "bash start.sh" (Mac/Linux)
  3. Aaben http://localhost:3000 i din browser
  4. Gaa til "OOH Proposals" fanen

INDHOLD:
  - Alle frames med placeringer
  - Alle creatives
  - Alle oplaeg-skabeloner (presentation templates)
  - Komplet server (ingen internet kraevet for OOH)

BEMÆRK:
  - Research/AI features kraever API-noegler (.env.local)
  - OOH mockup-generering virker fuldt offline
  - Data gemmes lokalt i .ooh-store.json

================================================================
`,
  "utf-8"
);

// ── 5. Create ZIP ────────────────────────────────────────────

log("Creating ZIP archive...");

// Remove old zip if exists
if (fs.existsSync(ZIP_PATH)) {
  fs.unlinkSync(ZIP_PATH);
}

// Use PowerShell on Windows to create zip
try {
  execSync(
    `powershell -Command "Compress-Archive -Path '${DIST}\\*' -DestinationPath '${ZIP_PATH}' -Force"`,
    { cwd: ROOT, stdio: "inherit" }
  );
} catch {
  console.log("⚠️  PowerShell zip failed, trying tar...");
  try {
    execSync(`tar -czf "${ZIP_PATH.replace('.zip', '.tar.gz')}" -C "${DIST}" .`, {
      cwd: ROOT,
      stdio: "inherit",
    });
    console.log(`\n✅  Created ${ZIP_NAME.replace('.zip', '.tar.gz')}`);
    done();
  } catch {
    console.log("⚠️  Could not create archive. Distribution folder ready at: dist/");
  }
}

function done() {
  // Calculate size
  const zipStat = fs.existsSync(ZIP_PATH) ? fs.statSync(ZIP_PATH) : null;
  const sizeMB = zipStat ? (zipStat.size / 1024 / 1024).toFixed(1) : "?";

  log(`Done!`);
  console.log(`\n   📁  Distribution folder: dist/`);
  if (zipStat) console.log(`   📦  ZIP archive: ${ZIP_NAME} (${sizeMB} MB)`);
  console.log(`\n   Share the zip file with your users.`);
  console.log(`   They just need Node.js installed + double-click start.bat\n`);
}

if (fs.existsSync(ZIP_PATH)) {
  done();
}
