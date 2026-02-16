# Ejendom AI – Complete Feature & Architecture Documentation

> **Version:** 2.0 | **Last updated:** February 11, 2026
> **Platform:** Next.js 15 (App Router) | TypeScript | Tailwind CSS
> **Deployment:** Railway

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Application Features](#2-application-features)
   - [2.1 Street Discovery](#21-street-discovery-tab-1)
   - [2.2 Scaffolding Discovery](#22-scaffolding--permit-discovery-tab-2)
   - [2.3 Properties Pipeline](#23-properties-pipeline-tab-3)
   - [2.4 AI Research Agent](#24-ai-research-agent-tab-4)
3. [External API Integrations](#3-external-api-integrations)
4. [Core Backend Processes](#4-core-backend-processes)
   - [4.1 Research Workflow](#41-research-workflow-engine)
   - [4.2 Scaffolding Discovery Pipeline](#42-scaffolding-discovery-pipeline)
   - [4.3 Street Discovery Pipeline](#43-street-discovery-pipeline)
   - [4.4 Scoring Systems](#44-scoring-systems)
5. [Data Flow Architecture](#5-data-flow-architecture)
6. [File & Module Reference](#6-file--module-reference)
7. [Property Status Lifecycle](#7-property-status-lifecycle)
8. [Environment Configuration](#8-environment-configuration)

---

## 1. Executive Summary

**Ejendom AI** is an AI-powered property research and outreach platform designed specifically for the Danish outdoor advertising market. It automates the end-to-end process of:

1. **Discovering** buildings with outdoor advertising potential (street scanning + scaffolding permits)
2. **Researching** property owners and administrators using official Danish registries
3. **Finding contact information** for decision-makers at those companies
4. **Generating personalized outreach emails** for first contact

The platform integrates with 10+ external Danish and international APIs, uses GPT-4o-mini for intelligent analysis, and stores all data in HubSpot CRM via custom objects.

---

## 2. Application Features

The application has a sidebar navigation with four main tabs, plus a dashboard pipeline summary.

### 2.1 Street Discovery (Tab 1)

**Purpose:** Scan an entire street to identify buildings with high outdoor advertising potential.

**User Flow:**
1. Enter a street name (e.g., "Vesterbrogade") and select a city
2. Set minimum outdoor score threshold (1-10 slider)
3. Set minimum daily foot/vehicle traffic threshold
4. Click "Scan vej" to start

**What happens behind the scenes:**
1. **Traffic estimation** — Checks estimated daily pedestrian + vehicle traffic for the street using a curated database of Danish streets (Vejdirektoratet data, municipal counts). If traffic is below threshold, the scan is rejected early.
2. **Address fetching** — Queries DAWA (Danmarks Adresser Web API) for every registered address on the street.
3. **Building data enrichment** — Batch-fetches BBR (Building & Dwelling Register) data for each address: building area, number of floors, usage code, year of construction.
4. **Pre-filtering** — Removes irrelevant buildings: garages, sheds, storage units, buildings under 100 m², single-family homes on low-traffic streets.
5. **LLM scoring** — Sends batches of 15 buildings to GPT-4o-mini, which scores each building 1-10 based on traffic, facade size, building type, corner location, visibility, and more.
6. **HubSpot creation** — For buildings scoring at or above the threshold, checks for duplicates and creates new property records in HubSpot with full metadata.

**Real-time feedback:** The entire process streams via Server-Sent Events (SSE) with a live progress bar, event log, and toast notifications.

**Key metrics displayed:**
- Total addresses found on the street
- Buildings passing pre-filter
- Buildings scoring above threshold
- Properties created in HubSpot

---

### 2.2 Scaffolding & Permit Discovery (Tab 2)

**Purpose:** Find active scaffolding permits and scaffold advertising opportunities across Danish cities by querying official municipal GIS systems.

**Why this matters:** Active scaffolding on a building facade = an immediate opportunity for outdoor advertising on that scaffolding. Knowing where scaffolding is right now, and for how long, gives a competitive advantage.

**User Flow:**
1. Select a city (København, Aarhus, Odense, Aalborg)
2. Click "Start daglig scanning"
3. View results in interactive map + sortable table

**What happens behind the scenes:**

1. **WFS API querying** — Connects to the city's official Web Feature Service:
   - **Copenhagen:** `wfs-kbhkort.kk.dk` (koordineringskort_pro profile). Queries the `erhv_raaden_over_vej_events_aktiv_aabne` layer — this contains all currently active road-usage permits.
   - **Aarhus:** `webkort.aarhuskommune.dk` WFS endpoint + Open Data DK portal.

2. **Permit classification** — The raw WFS data contains many permit types (outdoor seating, events, excavation, etc.). The system classifies each record using `sagstype` and `kategori` fields into:
   - **Stilladsreklamer** — Scaffold advertising permits (highest value)
   - **Stilladser** — Physical scaffolding on roads (portal, standard, lade tårn, trappe tårn, etc.)
   - Everything else (byggepladser, kraner, containere, excavation, events, outdoor seating, etc.) is **excluded**.

3. **Deduplication** — Multiple WFS records can share the same address. The system deduplicates by normalized address, keeping the highest-priority permit type per address.

4. **DAWA enrichment** — Each permit's address is looked up via DAWA to obtain postal codes, city names, and precise latitude/longitude coordinates.

5. **Traffic estimation** — Estimates daily pedestrian + vehicle traffic for each address using the same traffic database as street discovery.

6. **Scoring** — Each permit is scored 1-10 based on:
   - Traffic volume (+3 for 40K+, +2 for 25K+, +1 for 10K+, -2 for <10K)
   - Permit type (+2 for stilladsreklamer or stilladser)
   - Duration (+2 for 24+ weeks, +1 for 12+ weeks)
   - Facade area (+1-2 for large facades)
   - Contact info availability (+0.5)
   - Official data source (+0.5)

7. **Report generation** — Produces a daily-report-style summary with category breakdown, top locations, and data source details.

**UI Features:**
- **Two category toggle cards** at the top (Stilladsreklamer / Stilladser) with counts — click to filter
- **Interactive Leaflet map** with color-coded markers (purple for reklamer, indigo for stilladser)
- **Sortable table** with columns: Address, Type, Score, Traffic, Start date, End date, Duration (weeks), Entreprenør
- **Date intelligence:** Each row shows "Xd siden" (days since start) and "Xd tilbage" (days remaining) with color coding:
  - 🔴 Red: <14 days remaining or expired
  - 🟠 Amber: <60 days remaining
  - ⚪ Gray: >60 days remaining
- **View toggle:** "Kort + Tabel" (split), "Kun kort", or "Kun tabel"
- **Map-table interaction:** Clicking a row highlights the corresponding marker on the map and vice versa

**Important:** This feature is report-only — it does **not** push data to HubSpot. It's designed for daily scanning to identify immediate opportunities.

---

### 2.3 Properties Pipeline (Tab 3)

**Purpose:** View and manage all properties stored in HubSpot, track their status through the outreach pipeline.

**Features:**
- **Status filter tabs:** Ny (new), Researching, Researched, Klar (ready), Sendt (sent), Fejl (error)
- **Property cards** showing:
  - Address, postal code, city
  - Outdoor advertising score (1-10 with color ring)
  - Owner company name + CVR number
  - Contact person, email, phone
  - Research summary
  - Email draft (subject + body preview)
- **Search bar** for filtering by address or company name
- **Re-research button** to re-trigger AI research on a previously researched property
- **Single address input** to add a specific property for research

**Pipeline stats (sidebar):**
- Total properties
- Awaiting research
- Ready for outreach
- Emails sent

---

### 2.4 AI Research Agent (Tab 4)

**Purpose:** Trigger and monitor the full AI-powered research workflow for one or multiple properties.

**User Flow:**
1. Select a specific property or "Run all pending"
2. Click "Start Research"
3. Watch the live AI agent log as it progresses through each step

**The live log displays every step:**
- OIS lookup results (owner names)
- CVR matches found
- Web searches performed
- Contacts discovered
- LLM analysis progress
- Email draft generation
- HubSpot updates

See [Section 4.1](#41-research-workflow-engine) for the full step-by-step process.

---

## 3. External API Integrations

### 3.1 HubSpot CRM
| Aspect | Detail |
|--------|--------|
| **Purpose** | Primary data store for properties, contacts, notes, and tasks |
| **Object** | Custom Object `0-420` (Ejendomme/Listings) |
| **Endpoints** | Companies, Contacts, Engagements (notes + tasks) |
| **Auth** | Private App access token |
| **Key file** | `src/lib/hubspot.ts` |
| **Properties stored** | `outreach_status`, `outdoor_score`, `owner_company_name`, `owner_company_cvr`, `research_summary`, `research_links`, `email_draft_subject`, `email_draft_body`, `contact_person`, `contact_email`, `contact_phone` |

### 3.2 OIS.dk (Official Danish Property Ownership)
| Aspect | Detail |
|--------|--------|
| **Purpose** | Authoritative source for property ownership and administration data |
| **Process** | DAWA address lookup → ejerlav.kode + matrikelnr → jordstykker → BFE number → OIS owner/admin query |
| **Endpoint** | `https://ois.dk/api/ejer/get?bfe={bfe}` |
| **Returns** | Owner names, administrator names, property type, ownership structure |
| **Fallback** | Web search for BFE in OIS.dk URLs |
| **Key file** | `src/lib/research/ois.ts` |

### 3.3 CVR API (Danish Business Registry)
| Aspect | Detail |
|--------|--------|
| **Purpose** | Company registration data — name, address, directors, contact info |
| **Primary** | `cvrapi.dk` (free API, query by name or CVR number) |
| **Fallback** | Proff.dk web scraping (for director names and additional data) |
| **Features** | Strict name matching against OIS-sourced names, address validation, email/phone extraction |
| **Key file** | `src/lib/research/cvr.ts` |

### 3.4 DAWA (Danmarks Adresser Web API)
| Aspect | Detail |
|--------|--------|
| **Purpose** | Address resolution, geocoding, building data, postal codes |
| **Base URL** | `https://dawa.aws.dk` (primary), `https://api.dataforsyningen.dk` (fallback) |
| **Endpoints used** | `/adresser`, `/adgangsadresser`, `/jordstykker`, `/bbrlight/bygninger`, `/kommuner` |
| **Usage** | Street scanning (all addresses), scaffolding enrichment (postal codes + coordinates), OIS lookup (BFE number derivation) |
| **Key files** | `src/lib/research/bbr.ts`, `src/lib/discovery/street-scanner.ts`, `src/lib/research/ois.ts` |

### 3.5 BBR (Building & Dwelling Register)
| Aspect | Detail |
|--------|--------|
| **Purpose** | Building characteristics: total area, number of floors, year built, usage code |
| **Access** | Via DAWA `/bbrlight/bygninger` endpoint |
| **Usage** | Pre-filtering buildings (remove garages, sheds, <100m²), enriching property data for LLM scoring |
| **Key file** | `src/lib/research/bbr.ts` |

### 3.6 KBH Kort WFS (Copenhagen Municipal GIS)
| Aspect | Detail |
|--------|--------|
| **Purpose** | Active scaffolding and road-usage permits in Copenhagen |
| **Endpoint** | `https://wfs-kbhkort.kk.dk/k101/ows` |
| **Layer** | `k101:erhv_raaden_over_vej_events_aktiv_aabne` |
| **Format** | GeoJSON via WFS GetFeature |
| **Data fields** | `sagstype`, `kategori`, `lokation`, `projekt_start`, `projekt_slut`, `bygherre`, `entreprenoer`, `facadeareal_m2`, `sagsnr`, geometry |
| **Key file** | `src/lib/discovery/scaffolding.ts` |

### 3.7 Aarhus Kommune WFS
| Aspect | Detail |
|--------|--------|
| **Purpose** | Active permits in Aarhus |
| **Endpoint** | `https://webkort.aarhuskommune.dk/wfs/wfs` |
| **Fallback** | Open Data DK portal |
| **Key file** | `src/lib/discovery/scaffolding.ts` |

### 3.8 OpenAI (GPT-4o-mini)
| Aspect | Detail |
|--------|--------|
| **Purpose** | Intelligent analysis, scoring, contact recommendation, email generation |
| **Model** | `gpt-4o-mini` (configurable via `OPENAI_MODEL` env var) |
| **Usage areas** | Building scoring (street discovery), research analysis, contact ranking, email draft generation |
| **Key file** | `src/lib/llm.ts` |

### 3.9 DuckDuckGo (Web Search)
| Aspect | Detail |
|--------|--------|
| **Purpose** | Company research, contact discovery, fallback data gathering |
| **Method** | HTML scraping of search results (no official API) |
| **Key file** | `src/lib/research/web-scraper.ts` |

### 3.10 Proff.dk (Business Directory)
| Aspect | Detail |
|--------|--------|
| **Purpose** | Fallback for CVR lookups — director names, company details |
| **Method** | Web scraping |
| **Key file** | `src/lib/research/cvr.ts` |

### 3.11 Traffic Data Sources
| Aspect | Detail |
|--------|--------|
| **Purpose** | Estimate daily pedestrian + vehicle traffic for Danish streets |
| **Sources** | Vejdirektoratet (curated database), municipal traffic counts, pattern-based estimation |
| **Key file** | `src/lib/discovery/traffic.ts` |

---

## 4. Core Backend Processes

### 4.1 Research Workflow Engine

**File:** `src/lib/workflow/engine.ts`
**Trigger:** `POST /api/run-research` (single property) or `GET /api/run-research` (batch/cron)
**Streaming:** Server-Sent Events (SSE) for real-time progress

The research workflow executes 8 sequential steps for each property:

#### Step 1: Mark as In Progress
- Updates HubSpot status: `outreach_status → "RESEARCH_IGANGSAT"`
- Prevents duplicate concurrent research on the same property

#### Step 2: Deep Research
**Orchestrated by:** `src/lib/research/index.ts`

| Sub-step | Description |
|----------|-------------|
| **OIS Lookup** | Query OIS.dk for official owner and administrator names via BFE number |
| **CVR Lookup** | Search CVR registry using OIS-provided names. Strict name matching to avoid false positives. If OIS says "Ejendomsselskabet XYZ" then only that company is accepted from CVR |
| **BBR Lookup** | Fetch building characteristics (area, floors, usage, year built) |
| **Web Search** | 6-8 targeted DuckDuckGo searches combining address, owner name, and relevant keywords |
| **Website Scraping** | Scrape up to 5 relevant websites found during web search for contact information |

#### Step 3: LLM Analysis
**File:** `src/lib/llm.ts`

GPT-4o-mini receives all gathered data and produces:
- **Owner company identification** — Name + CVR number
- **Contact recommendations** — Each contact scored with:
  - Relevance: `direct` (proven connection to this specific property) or `indirect` (general administrator)
  - Confidence: 0.0-1.0
  - Role: ejer, administrator, advokat, direktor, etc.
- **Outdoor potential score** — 1-10 rating with detailed reasoning
- **Data quality assessment** — HIGH / MEDIUM / LOW

#### Step 3.5: Contact Injection
Post-LLM processing to ensure completeness:
- **OIS owner injection:** If the official OIS owner isn't in the LLM's contact list, add them with high confidence
- **CVR contact injection:** If CVR data includes an email or phone not yet in the contact list, add it
- **Relevance filtering:** Penalize contacts that appear across multiple unrelated properties (likely generic info@... addresses)

#### Step 3.5b: Email Hunt
**File:** `src/lib/research/email-finder.ts`

If no good email has been found yet:
1. **Pattern guessing** — Try common patterns: `firstname.lastname@domain`, `firstname@domain`, `fl@domain`, etc.
2. **Targeted web search** — Search for the person's name + "email" + company name
3. **Deep website scraping** — Scrape the company's own website for email addresses
4. **Fallback** — Search for the company/owner name + "kontakt" + "email"

#### Step 4: Update HubSpot Property
Saves to HubSpot:
- Owner company name + CVR number
- Outdoor score + score reasoning
- Research summary (what was found, from which sources)
- Research links (URLs of sources used)
- Status → `RESEARCH_DONE_CONTACT_PENDING`

#### Step 5: Upsert Contacts
- Creates or updates contact records in HubSpot
- Associates contacts with the property record
- Copies primary contact info (name, email, phone) onto the property record itself

#### Step 6: Generate Email Draft
GPT-4o-mini generates a personalized outreach email:
- Uses configurable tone of voice (`TONE_OF_VOICE` env var)
- References property-specific details (address, building type, scaffolding, etc.)
- Can use few-shot examples for consistent style (`EXAMPLE_EMAILS` env var)

#### Step 7: Save Draft & Create Tasks
- Saves email draft (subject + body) on the property in HubSpot
- Creates a note on the primary contact with the draft
- Creates a follow-up task in HubSpot

#### Step 8: Final Status Update
- `KLAR_TIL_UDSENDELSE` — if a contact with a valid email was found
- `RESEARCH_DONE_CONTACT_PENDING` — if no email was found (manual follow-up needed)
- `FEJL` — if the process encountered an unrecoverable error

---

### 4.2 Scaffolding Discovery Pipeline

**File:** `src/lib/discovery/scaffolding.ts`
**Trigger:** `POST /api/discover-scaffolding`
**Streaming:** SSE

| Phase | Description |
|-------|-------------|
| **Phase 1: WFS Fetch** | Connect to municipal WFS API. Fetch all active permits (up to 10,000 features). Parse GeoJSON response. |
| **Phase 2: Classification** | For each feature, extract `sagstype` + `kategori`. Classify into Stilladsreklamer or Stilladser. Discard everything else. |
| **Phase 3: Deduplication** | Group by normalized address. Keep highest-priority permit per address. |
| **Phase 4: DAWA Enrichment** | Batch-lookup each address via DAWA API. Obtain postal code, city name, precise lat/lng coordinates. Processes 20 at a time with error handling. |
| **Phase 5: Traffic + Scoring** | Estimate daily traffic for each address. Calculate outdoor score (base 5, modified by traffic, type, duration, facade, contacts). |
| **Phase 6: Report** | Generate daily report text. Sort by score. Present in UI with map + table. |

**Copenhagen WFS field mapping:**

| WFS Field | Usage |
|-----------|-------|
| `sagstype` | Permit type classification (Stilladsreklamer / Midlertidig råden over veje) |
| `kategori` | Detailed scaffold type (Stillads portal bundrammer, Lade tårn, etc.) |
| `lokation` | Street address |
| `projekt_start` | Permit start date |
| `projekt_slut` | Permit end date |
| `bygherre` | Building owner/developer |
| `entreprenoer` | Scaffolding contractor |
| `facadeareal_m2` | Facade area in square meters |
| `sagsnr` | Municipal case number |
| `geometry` | GeoJSON geometry for map display |

---

### 4.3 Street Discovery Pipeline

**File:** `src/lib/discovery/index.ts`
**Trigger:** `POST /api/discover`
**Streaming:** SSE

| Phase | Description |
|-------|-------------|
| **Phase 0: Traffic Check** | Estimate street-level traffic. Reject if below user-defined minimum threshold. |
| **Phase 1: Address Scanning** | DAWA: Fetch all registered addresses on the street. BBR: Batch-fetch building data (5 concurrent requests). Pre-filter: Remove garages, sheds, storage (<100m²). |
| **Phase 2: LLM Scoring** | Send batches of 15 buildings to GPT-4o-mini. Each building scored 1-10 with reasoning. Consider: traffic, facade, building type, corner position, visibility. |
| **Phase 3: HubSpot Creation** | Check for duplicate addresses. Create HubSpot records for buildings ≥ score threshold. Include traffic data, score, reasoning, BBR data. |

---

### 4.4 Scoring Systems

#### Building Score (Street Discovery)
**File:** `src/lib/discovery/scoring.ts`

GPT-4o-mini evaluates each building considering:
- **Traffic volume** — 20K+/day = very attractive, 10-20K = good, <10K = rarely relevant
- **Facade size** — Larger facades = more advertising space
- **Building type** — Commercial > residential associations > single-family
- **Location** — Corner buildings, intersections, near bus stops/metro = bonus
- **Existing scaffolding/renovation** — Active construction = immediate opportunity
- **Visibility** — Street-level visibility and pedestrian exposure

**Output:** Integer score 1-10 + text reasoning

#### Scaffolding Score
**File:** `src/lib/discovery/scaffolding.ts`

Algorithmic scoring (no LLM required):

| Factor | Points |
|--------|--------|
| Base score | 5 |
| Traffic ≥ 40K/day | +3 |
| Traffic ≥ 25K/day | +2 |
| Traffic ≥ 10K/day | +1 |
| Traffic < 10K/day | -2 |
| Stilladsreklamer type | +2 |
| Stilladser type | +2 |
| Duration ≥ 24 weeks | +2 |
| Duration ≥ 12 weeks | +1 |
| Facade ≥ 500m² | +2 |
| Facade ≥ 200m² | +1 |
| Has contact info | +0.5 |
| Official data source | +0.5 |

**Maximum possible:** 10 (capped)

---

## 5. Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
│  Next.js App Router (page.tsx)                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │ Discovery │ │Scaffolding│ │Properties│ │ Research │          │
│  │  Scanner  │ │  Permits  │ │ Pipeline │ │   Agent  │          │
│  └─────┬─────┘ └─────┬─────┘ └─────┬────┘ └─────┬────┘         │
│        │SSE          │SSE         │REST         │SSE            │
└────────┼─────────────┼────────────┼─────────────┼───────────────┘
         ▼             ▼            ▼             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API ROUTES                                  │
│  POST /api/discover          POST /api/discover-scaffolding     │
│  GET  /api/properties        POST /api/run-research             │
│  GET  /api/dashboard         GET  /api/run-research (cron)      │
└────────┬─────────────┬────────────┬─────────────┬───────────────┘
         │             │            │             │
         ▼             ▼            │             ▼
┌──────────────┐ ┌──────────────┐   │   ┌──────────────────────┐
│   DISCOVERY  │ │  SCAFFOLDING │   │   │   WORKFLOW ENGINE     │
│              │ │              │   │   │                       │
│ • DAWA addrs │ │ • WFS fetch  │   │   │ Step 1: Mark status   │
│ • BBR data   │ │ • Classify   │   │   │ Step 2: Deep research │
│ • Pre-filter │ │ • Dedup      │   │   │ Step 3: LLM analysis  │
│ • LLM score  │ │ • DAWA enrich│   │   │ Step 4: Update HS     │
│ • HS create  │ │ • Traffic    │   │   │ Step 5: Contacts      │
│              │ │ • Score      │   │   │ Step 6: Email draft   │
│              │ │ • Report     │   │   │ Step 7: Save & task   │
│              │ │              │   │   │ Step 8: Final status  │
└──────┬───────┘ └──────────────┘   │   └──────────┬───────────┘
       │                            │              │
       │         ┌──────────────────┘              │
       │         │                                 │
       ▼         ▼                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EXTERNAL SERVICES                             │
│                                                                  │
│  ┌─────────┐  ┌──────┐  ┌──────┐  ┌─────────┐  ┌───────────┐  │
│  │ HubSpot │  │ DAWA │  │ OIS  │  │   CVR   │  │  OpenAI   │  │
│  │  CRM    │  │ API  │  │ .dk  │  │  API    │  │ GPT-4o-m  │  │
│  └─────────┘  └──────┘  └──────┘  └─────────┘  └───────────┘  │
│                                                                  │
│  ┌─────────┐  ┌──────┐  ┌──────┐  ┌─────────┐  ┌───────────┐  │
│  │ KBH WFS │  │Aarhus│  │Proff │  │DuckDuck │  │  Traffic  │  │
│  │  GIS    │  │ WFS  │  │ .dk  │  │   Go    │  │   Data    │  │
│  └─────────┘  └──────┘  └──────┘  └─────────┘  └───────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. File & Module Reference

### Frontend
| File | Role |
|------|------|
| `src/app/page.tsx` | Main dashboard — 4 tabs, all UI logic, SSE handling |
| `src/app/layout.tsx` | Root layout with metadata |
| `src/components/ScaffoldingMap.tsx` | Leaflet map component for scaffolding permits |
| `src/components/ScaffoldingMapDynamic.tsx` | Dynamic import wrapper (SSR-safe) for Leaflet |

### API Routes
| File | Method | Role |
|------|--------|------|
| `src/app/api/dashboard/route.ts` | GET | Dashboard statistics (pipeline counts) |
| `src/app/api/properties/route.ts` | GET | Fetch properties from HubSpot |
| `src/app/api/run-research/route.ts` | GET/POST | Research workflow trigger (SSE streaming) |
| `src/app/api/discover/route.ts` | POST | Street discovery scan (SSE streaming) |
| `src/app/api/discover-scaffolding/route.ts` | POST | Scaffolding discovery (SSE streaming) |

### Core Logic
| File | Role |
|------|------|
| `src/lib/workflow/engine.ts` | 8-step research workflow orchestrator |
| `src/lib/research/index.ts` | Research coordinator (OIS → CVR → BBR → Web → Scrape) |
| `src/lib/research/ois.ts` | OIS.dk integration (property ownership via BFE) |
| `src/lib/research/cvr.ts` | CVR API + Proff.dk fallback |
| `src/lib/research/bbr.ts` | BBR building data via DAWA |
| `src/lib/research/web-scraper.ts` | DuckDuckGo search + website scraping |
| `src/lib/research/email-finder.ts` | Multi-strategy email discovery |
| `src/lib/discovery/index.ts` | Street discovery orchestrator |
| `src/lib/discovery/street-scanner.ts` | DAWA address + BBR batch fetching |
| `src/lib/discovery/scaffolding.ts` | Scaffolding permit discovery (WFS) |
| `src/lib/discovery/scoring.ts` | LLM-based building scoring prompts |
| `src/lib/discovery/traffic.ts` | Traffic estimation engine |
| `src/lib/llm.ts` | OpenAI integration (analysis, scoring, email gen) |
| `src/lib/hubspot.ts` | HubSpot API client (CRUD for all objects) |
| `src/lib/config.ts` | Environment configuration |

### Types
| File | Role |
|------|------|
| `src/types/index.ts` | All TypeScript interfaces: Property, Contact, ScaffoldingPermit, ScoredScaffolding, ScaffoldingResult, OisResult, etc. |

---

## 7. Property Status Lifecycle

```
NY_KRAEVER_RESEARCH        → New property, needs research
        ↓
RESEARCH_IGANGSAT          → Research in progress (AI agent running)
        ↓
RESEARCH_DONE_CONTACT_     → Research done, but no email found
PENDING                      (needs manual contact lookup)
        ↓
KLAR_TIL_UDSENDELSE       → Email draft ready, contact found
        ↓
FOERSTE_MAIL_SENDT         → First outreach email sent
        ↓
OPFOELGNING_SENDT          → Follow-up email sent
        ↓
SVAR_MODTAGET              → Reply received from contact
        ↓
LUKKET_VUNDET              → Deal won
        or
LUKKET_TABT                → Deal lost / not interested

FEJL                       → Error during research (can be retried)
```

---

## 8. Environment Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `HUBSPOT_ACCESS_TOKEN` | Yes | HubSpot Private App token with CRM read/write access |
| `OPENAI_API_KEY` | Yes | OpenAI API key for GPT-4o-mini |
| `OPENAI_MODEL` | No | Override model name (default: `gpt-4o-mini`) |
| `CRON_SECRET` | No | Secret token for protecting the batch research cron endpoint |
| `TONE_OF_VOICE` | No | Custom instructions for email tone/style |
| `EXAMPLE_EMAILS` | No | Few-shot example emails for consistent style |

---

## Technical Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Maps | Leaflet + custom markers |
| HTTP | Native `fetch` API |
| HTML parsing | Cheerio |
| LLM | OpenAI GPT-4o-mini |
| CRM | HubSpot (Custom Object 0-420) |
| Streaming | Server-Sent Events (SSE) |
| Deployment | Railway |

---

*This document describes the Ejendom AI platform as of February 2026.*
