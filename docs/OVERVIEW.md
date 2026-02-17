# Ejendom AI – Feature overview, bottlenecks, optimizations & needs

*Oversigt over alle features, flaskehalse, hvor I kan optimere og hvad der mangler.*

---

## 1. Feature overview

### 1.1 Tabs og ansvar

| Tab | Id | Hovedfunktion | API'er / data |
|-----|-----|----------------|----------------|
| **Home** | `home` | Dashboard: KPI-kort, pipeline-ringe, status-fordeling, staging-alert, genveje, analytics, seneste ejendomme, systemstatus, process-pills | `/api/dashboard`, `/api/properties`, `/api/status` |
| **Discover** | `discover` | Street discovery: vejnavn + by, min score/trafik, scan → SSE progress → kandidattabel, opret i pipeline | `POST /api/discover` (SSE) |
| **Stilladser** | `scaffolding` | By-vælger, daglig scan → progress + log → rapport (kort/tabel/split), filter på type, sortering, “Send top til pipeline”, OOH-frame | `POST /api/discover-scaffolding` (SSE), `POST /api/scaffold-to-pipeline` |
| **Staging** | `staging` | Kø af ejendomme der afventer godkendelse før push til HubSpot | `/api/staged-properties`, approve/reject |
| **Properties** | `properties` | Liste over alle ejendomme, filtre (søg, status, by, score), sortering, expand/collapse, research, feedback, quick-add | `/api/properties`, `/api/run-research`, `/api/feedback`, `/api/setup/create-properties` |
| **Research** | `research` | Kør research på ejendomme, progress + log | `/api/run-research` (SSE) |
| **Street Agent** | `street_agent` | Adresse + by → agent-scan med progress | `POST /api/agent/street` (SSE) |
| **Outreach** | `outreach` | E-mail-kø: statistik, køliste, forhåndsvisning, rediger, send (enkelte eller batch), Gmail-status | `/api/send-email`, `/api/properties`, outreach-data (poll/fetch) |
| **OOH** | `ooh` | Frames, creatives, mockups, forslag, PDF/Slides, klienter | OOH-API’er (frames, creatives, batch-mockup, generate-pdf, proposals, osv.) |
| **Settings** | `settings` | Autonomi-niveau, regler, system-status | Lokal state + evt. `/api/status` |

### 1.2 Globale elementer

- **Sidebar** – navigation mellem tabs, aktiv-indikator, process-pills (discovery, stilladser, research, agent).
- **Toasts** – success/error/info-beskeder.
- **Full Circle Wizard** – modal/workflow (åbnes fra flere steder).
- **Polling** – dashboard hvert 30. sekund, properties hvert 30. sekund når tab er “properties/home/outreach/research”, health hvert 2. min.

### 1.3 API-routes (udvalg)

- **Kerne:** `dashboard`, `properties`, `discover`, `discover-scaffolding`, `scaffold-to-pipeline`, `staged-properties`, `run-research`, `agent/street`, `send-email`, `feedback`, `status`, `health`.
- **OOH:** `ooh/frames`, `ooh/creatives`, `ooh/batch-mockup`, `ooh/generate-pdf`, `ooh/proposals`, `ooh/templates`, track (open/click), follow-up, send-campaign, osv.
- **Cron:** `cron/scaffolding`, `cron/ooh-followup`.
- **Setup:** `setup/create-properties`, `setup/discover`.

---

## 2. Bottlenecks

### 2.1 Arkitektur og vedligeholdelse

| Problem | Beskrivelse |
|--------|-------------|
| **Én kæmpe page** | `page.tsx` er ~2 957 linjer. Al tab-state og meget UI ligger i én fil → svært at navigere, teste og dele arbejde. |
| **Ingen DashboardContext i brug** | `DashboardContext.tsx` findes, men `page.tsx` bruger den ikke. Dashboard/properties-fetch og polling er duplikeret/ligger kun i page. |
| **Delt state overalt** | `dashboard`, `properties`, `fetchData`, `addToast`, `setActiveTab` osv. bruges på tværs af tabs. Uklart hvad der “tilhører” hvem. |
| **Mange useState i page** | 50+ state-variabler i én komponent → re-renders og mentalt overblik bliver tunge. |

### 2.2 Data og netværk

| Problem | Beskrivelse |
|--------|-------------|
| **Dobbelt/overlappende fetch** | Dashboard og properties hentes på mount og ved tab-skift; polling kører uafhængigt. Risiko for unødvendige kald. |
| **Properties ved tab-skift** | `needsProperties` styrer hvornår properties hentes; ved skift til fx Properties kan der allerede køre et fetch fra Home. |
| **Ingen central cache** | Ingen SWR/React Query; hver tab/effect kan trigge egen fetch. |
| **Outreach-data** | Outreach-tab har egen `fetchOutreachData`; ikke integreret i én fælles datalag. |
| **SSE uden standardiseret fejl/retry** | Discover, scaffolding, research, street agent bruger SSE; fejlhåndtering og “prøv igen” er ikke ens på tværs. |

### 2.3 Performance og UX

| Problem | Beskrivelse |
|--------|-------------|
| **Hele page re-renderer** | Stor state i page → enhver state-opdatering kan re-rendere hele træet (inkl. alle tab-indhold). |
| **Tunge komponenter ikke lazy** | OOHPanel og StagingQueue er dynamic, men resten af tab-indholdet rendres stadig (hidden) med meget markup. |
| **Ingen skeletons** | Loading er ofte bare spinner eller “Loading…” – ingen skeleton for tabel/kort/kort. |
| **Store lister uden virtualisering** | Properties-liste og scaffolding-tabel kan blive store; ingen react-window/virtualization. |

### 2.4 Fejl og robusthed

| Problem | Beskrivelse |
|--------|-------------|
| **API-fejl vises ikke ens** | Nogle steder toasts, andre steder `setError` eller ingen feedback. |
| **Ingen struktureret “Prøv igen”** | Ved fejl ved scan/research/outreach er der ikke et ens “Prøv igen”-mønster. |
| **Health poll** | `/api/status` polles hvert 2. min; bruges til systemstatus, men ikke til at stoppe/justere andre kald ved nedbrud. |

---

## 3. Hvor I kan optimere

### 3.1 Kort sigt (lavt besvær)

- **Slå DashboardContext på**  
  Wrap `page.tsx` i `<DashboardProvider>` og erstat lokal `dashboard`/`properties`/`fetchDashboard`/`fetchProperties`/`fetchData` med `useDashboard()`. Én kilde til data og mindre duplikation.

- **Lazy-render tabs**  
  Kun rendere indhold for `activeTab === "xy"` (allerede delvist gjort). Sikre at tunge tabs (OOH, Scaffolding, Properties) ikke mountes før brugeren skifter til dem.

- **Skeletons på tunge tabs**  
  Stilladser, Properties, OOH: vis skeleton (header + tabel/grid) mens data loades i stedet for generisk spinner.

- **Én toast ved API-fejl**  
  Standardisér: ved `!res.ok` eller throw i fetch: `addToast("Noget gik galt. Prøv igen.", "error")` og evt. knap “Genindlæs” hvor det giver mening.

### 3.2 Medium sigt (refaktor + datalag)

- **Færdiggør Fase 1.1**  
  Flyt resten af tabs til egne filer (`DiscoverTab`, `StagingTab`, `PropertiesTab`, `ResearchTab`, `StreetAgentTab`, `OutreachTab`, `OOHTab`, `SettingsTab`). Behold kun layout, provider og `activeTab`-switch i `page.tsx` (mål: ~400–500 linjer).

- **Central fetch + invalidering**  
  Alle steder der kalder `fetch("/api/dashboard")` eller `fetch("/api/properties")` skal gå via context (eller senere SWR/React Query). Efter mutationer (staging approve, research, send email): kald `fetchData()` (eller invalider cache) så dashboard og lister opdateres uden dobbelt-logik.

- **Outreach-data i context eller dedikeret hook**  
  Hent outreach-stats/queue ét sted og gør dem tilgængelige for Outreach-tab (og evt. dashboard), så det ikke er ad-hoc fetch i tabben.

### 3.3 Længere sigt

- **Virtualisering**  
  Ved store lister (Properties, Stilladser-tabel): brug virtualiseret liste (fx `@tanstack/react-virtual` eller `react-window`) så kun synlige rækker rendres.

- **SWR eller React Query**  
  Erstat manuel polling med cache + revalidate. Reducer antal kald og gør “stale-while-revalidate” og “prøv igen” ensartet.

- **SSE-helper med retry**  
  Fælles `useSSE` eller `consumeSSE` med standardiseret fejl, timeout og “Prøv igen” for discover, scaffolding, research, street agent.

---

## 4. Behov (needs)

### 4.1 Plan (roadmap) – hvad der mangler

- **Fase 1.1**  
  - **Done:** ScaffoldingTab er udtrukket og brugt i page; ScaffoldingMap/MapPermit fjernet fra page.  
  - **Mangler:** HomeTab, DiscoverTab, StagingTab, OOHTab er oprettet som komponenter men er **ikke** indlagt i den nuværende `page.tsx` (efter revert).  
  - **Mangler:** PropertiesTab, ResearchTab, StreetAgentTab, OutreachTab, SettingsTab er ikke udtrukket endnu.  
  - **Mål:** `page.tsx` under ~400–500 linjer; én fil per tab med klart ansvar.

- **Fase 1.2 (datalag)**  
  - **Mangler:** Page bruger ikke `DashboardProvider`/`useDashboard()`.  
  - **Behov:** Wrap app i provider, flyt dashboard/properties-fetch og evt. polling ind i context, og brug `fetchData()`/invalidering ved mutationer.

### 4.2 Tekniske behov

- **Dokumentation**  
  - Hvilke props/context hver tab forventer.  
  - Hvor `fetchData()` skal kaldes efter mutationer (staging, research, email, OOH).  
  - Miljøvariabler og API-nøgler (HubSpot, Gmail, Supabase, osv.).

- **Test**  
  - Manuel test af alle tabs og vigtige flows (discover, scaffold scan, research, staging approve, OOH, outreach).  
  - Evt. enkelte integrationstests for kritiske API-routes.

- **Cron og deployment**  
  - Dokumenter hvordan `cron/scaffolding` og `cron/ooh-followup` kører (Vercel Cron eller ekstern scheduler).  
  - Beslut om stillads-cron-resultat gemmes (DB/fil) så dashboard kan vise “Nye stilladser i dag” uden brugerens egen scan (Fase 2.3).

### 4.3 Produkt-/funktionsbehov (fra roadmap)

- **Fase 2 – Stilladser:** datofilter, CSV/Excel-export, cron + badge “X nye”.  
- **Fase 3 – OOH:** batch mockups, filtrer proposals på status, mail-skabeloner.  
- **Fase 4 – Dashboard:** pipeline-tendens (historik/graf), “Hvad skal jeg gøre i dag?”.  
- **Fase 5 – UX:** tastaturgenveje (Esc, evt. Ctrl+tal), loading/skeleton, ens fejlhåndtering og “Prøv igen”.

---

## 5. Full detail plan (Fase 1.1 + 1.2)

1. **Wire DashboardProvider i page**  
   Wrap med `<DashboardProvider>`, brug `useDashboard()` i page og fjern lokal `fetchDashboard`/`fetchProperties`/`fetchData` og dobbelt-polling. Derefter kan tabs trække data fra context.

2. **Genindsæt de eksisterende tab-komponenter**  
   HomeTab, DiscoverTab, StagingTab, OOHTab er klar i `src/components/tabs/`. Indsæt dem i page igen (med de nødvendige props fra context/page) så page bliver kortere og konsistent med ScaffoldingTab.

3. **Udtag resten af tabs**  
   Efter prioritet: PropertiesTab (stor), ResearchTab, StreetAgentTab, OutreachTab, OOHTab (allerede komponent), SettingsTab. Behold i page kun: layout, sidebar, provider, `activeTab`-switch og evt. Full Circle Wizard + toasts.

4. **Standardisér fejl og loading**  
   Én måde at vise API-fejl (toast + “Prøv igen” hvor relevant) og indfør skeleton på 1–2 tunge tabs som pilot.

Når Fase 1.1 og 1.2 er på plads, er det nemmere at tilføje Fase 2–5 (filter, export, OOH batch, dashboard-tendens, UX) i de rigtige komponenter uden at røre hele page.

---

*Sidst opdateret: februar 2025*
