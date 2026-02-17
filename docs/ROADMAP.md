# Ejendom AI – Roadmap og detaljeret plan

Denne plan dækker vedligeholdelse, Stilladser, OOH, dashboard og UX. Faserne kan køres sekventielt eller i parallel afhængigt af kapacitet.

---

## Fase 1: Refaktorering og skalerbarhed

**Mål:** Gøre codebasen nemmere at vedligeholde og udvide. Ingen nye features for brugeren, men bedre fundament.

### 1.1 Splitte `page.tsx` i tab-komponenter

**Nuværende situation:** `src/app/page.tsx` er >3600 linjer og indeholder al state og UI for alle faner (home, discover, scaffolding, staging, properties, research, ooh, outreach, settings, street_agent).

**Plan:**

| # | Opgave | Detaljer | Estimat |
|---|--------|----------|---------|
| 1.1.1 | Opret mappestruktur | `src/app/(dashboard)/` eller `src/components/tabs/` med én fil per tab: `HomeTab.tsx`, `DiscoverTab.tsx`, `ScaffoldingTab.tsx`, `StagingTab.tsx`, `PropertiesTab.tsx`, `ResearchTab.tsx`, `OOHTab.tsx`, `OutreachTab.tsx`, `SettingsTab.tsx`, `StreetAgentTab.tsx`. | 0.5 d |
| 1.1.2 | Definere delt state og props | Opret `DashboardContext` eller en `useDashboard()` hook der eksporterer: `activeTab`, `setActiveTab`, `dashboard`, `properties`, `fetchData`, `addToast`, samt alle tab-specifikke states (fx `scaffoldReport`, `scaffoldCity`, …). State der kun bruges i én tab flyttes ind i den tab-komponente. | 1 d |
| 1.1.3 | Flytte Home/Dashboard UI | Flyt alt JSX for `activeTab === "home"` ind i `HomeTab.tsx`. Send nødvendige props/context. Verificer at KPI-kort, pipeline, staging-alert, genveje, analytics og system status virker. | 0.5 d |
| 1.1.4 | Flytte Discover-tab | Flyt discovery-form, progress, resultat og alle discovery-relaterede states til `DiscoverTab.tsx`. Bevar integration med staging (opret fra discovery). | 0.5 d |
| 1.1.5 | Flytte Stilladser-tab | Flyt scaffolding-by, trigger/stop, progress, log, report-header, period report, map, tabel og detalje-panel til `ScaffoldingTab.tsx`. Del state med context (fx `scaffoldPeriodCounts` bruges på dashboard). | 0.5 d |
| 1.1.6 | Flytte Staging, Properties, Research | Samme mønster: flyt UI + lokalt state; del kun det der bruges på andre faner (fx `fetchData` efter approve/reject). | 1 d |
| 1.1.7 | Flytte OOH, Outreach, Settings, Street Agent | OOH-tab bruger allerede `<OOHPanel>`. Sikr at `oohInitialFrame`, `oohInitialClient` og tab-switch stadig virker. Flyt evt. wrapper-logik og resten af fanerne. | 0.5 d |
| 1.1.8 | Rydde op i `page.tsx` | `page.tsx` skal kun: (1) wrappe layout/sidebar, (2) huse context/provider, (3) rendere `<Sidebar />` + `{activeTab === "home" && <HomeTab />}` osv. Fjern duplikeret state og gamle kommentarer. | 0.5 d |
| 1.1.9 | Test og regression | Gennemgå alle faner: navigering, data-load, actions (discovery, scaffold scan, research, staging approve, OOH, outreach). Fix eventuelle fejl. | 0.5 d |

**Acceptkriterier:**  
- Ingen ændring i brugeradfærd.  
- `page.tsx` under ~400–500 linjer.  
- Hver tab-fil har et klart ansvar og kan testes/ændres uafhængigt.

**Risici:**  
- Meget state er delt (fx `properties`, `dashboard`). Context eller tydelige props-lister skal dokumenteres.

---

### 1.2 Fælles datalag (context / hooks)

**Mål:** Undgå dobbelt-fetch og uoverensstemmelser mellem dashboard, properties-liste og andre faner.

| # | Opgave | Detaljer | Estimat |
|---|--------|----------|---------|
| 1.2.1 | Beslut arkitektur | Valg: React Context vs. SWR/React Query. Anbefaling: start med Context + `fetchData()` centraliseret; evt. senere tilføj SWR for caching og revalidate. | 0.25 d |
| 1.2.2 | DashboardContext | Opret `src/contexts/DashboardContext.tsx`. Indhold: `dashboard`, `properties`, `loading`, `error`, `fetchDashboard()`, `fetchProperties()`, `fetchData()` (begge). Provider wrappes om appen i `page.tsx` (eller layout). | 0.5 d |
| 1.2.3 | Flytte fetch-kald | Erstat alle steder der kalder `fetch("/api/dashboard")` / `fetch("/api/properties")` med `useDashboard()` og `fetchData()` eller dedikerede metoder. Opdater HomeTab, PropertiesTab, StagingTab osv. | 0.5 d |
| 1.2.4 | Invalidering ved mutationer | Når staging approve/reject, research done, eller OOH-oprettelse sker: kald `fetchData()` (eller invalider cache) så dashboard og lister opdateres. Dokumenter disse punkter. | 0.25 d |

**Acceptkriterier:**  
- Én kilde til dashboard- og properties-data.  
- Ingen dobbelt-load ved tab-skift hvis data allerede er hentet (evt. med simpel “lastFetched”-logik).

---

## Fase 2: Stilladser – filtrering, export og gentagelse

**Mål:** Gør det nemmere at arbejde med “nye” tilladelser og få data ud af systemet.

### 2.1 Filtrer på oprettet (date range)

| # | Opgave | Detaljer | Estimat |
|---|--------|----------|---------|
| 2.1.1 | UI til datofilter | I Stilladser-tab: tilføj en lille toolbar eller dropdown: “Oprettet: Alle / I dag / Sidste 7 dage / Sidste 30 dage / Brugerdefineret”. “Brugerdefineret” kan være to date-inputs (fra–til). | 0.5 d |
| 2.1.2 | Filterlogik | Når bruger vælger fx “Sidste 7 dage”: filtrer `scaffoldReport.topPermits` på `createdDate` inden for det interval. Anvend filteret efter `scaffoldFilter` (type) og før sortering. Opdater “Viser X af Y” til at reflektere filtreret antal. | 0.25 d |
| 2.1.3 | Map og tabel | Både kort og tabel skal vise den filtrerede liste. `mapPermits` og `sorted` bygges ud fra den samme filtrerede mængde. | 0.25 d |
| 2.1.4 | Period report | “Nye oprettet” (I dag / Denne uge / Denne måned) kan forblive som nu (alle permits). Alternativt: vis også antal i det valgte datofilter (fx “12 i valgt periode”). | 0.25 d |

**Acceptkriterier:**  
- Bruger kan vælge “Sidste 7 dage” og kun se tilladelser oprettet inden for 7 dage.  
- Tabel og kort opdateres. Export (næste afsnit) respekterer samme filter.

---

### 2.2 Export (CSV/Excel)

| # | Opgave | Detaljer | Estimat |
|---|--------|----------|---------|
| 2.2.1 | Export-knap | I Stilladser-tab (fx i header eller ved siden af “Viser X af Y”): knap “Export CSV”. Ved klik: generer CSV fra den aktuelle filtrerede og sorterede liste. | 0.25 d |
| 2.2.2 | CSV-indhold | Kolonner: Adresse, Type, Kategori, Score, Trafik, Oprettet, Start, Slut, Uger, Entrepr., Beskrivelse (evt. sagsnr, kontakt). Brug `createdDate`, `startDate`, `endDate` osv. fra `topPermits`. | 0.25 d |
| 2.2.3 | Filnavn og encoding | Filnavn fx `stilladser-{scaffoldCity}-{dato}.csv`. UTF-8 med BOM så Excel viser danske tegn korrekt. | 0.25 d |
| 2.2.4 | (Valgfri) Excel | Hvis I vil undgå Excel-problemer med CSV: brug et lille bibliotek (fx `xlsx` eller `exceljs`) til at generere .xlsx. Kan være fase 2.2 udvidelse. | 0.5 d |

**Acceptkriterier:**  
- Ét klik eksporterer den synlige liste til CSV.  
- Åbning i Excel viser danske tegn og datoer forståeligt.

---

### 2.3 Gentagen scan og notifikation

| # | Opgave | Detaljer | Estimat |
|---|--------|----------|---------|
| 2.3.1 | Cron / scheduled job | I har allerede `src/app/api/cron/scaffolding/route.ts`. Gennemgå at den kører som ønsket (Vercel Cron eller ekstern scheduler). Dokumenter: hvilken by, hvor ofte, og hvad der sker med resultaterne (gemmes de et sted?). | 0.5 d |
| 2.3.2 | Gem “sidste scan”-resultat | Beslut: skal cron-resultatet gemmes i DB eller fil, så dashboard kan vise “Nye stilladser i dag” uden at brugeren selv har kørt scan? Hvis ja: opret en simpel tabel eller fil med `{ city, scannedAt, daily, weekly, monthly }` og en API der returnerer det. | 0.5 d |
| 2.3.3 | Dashboard bruger cron-data | Hvis 2.3.2 er implementeret: dashboard “Nye stilladser i dag” kan vise tal fra seneste cron-scan i stedet for (eller ud over) localStorage fra brugerens egen scan. | 0.25 d |
| 2.3.4 | Badge / notifikation | I sidebar eller på Stilladser-fanen: lille badge “X nye siden i går” hvis der er kørt cron og antal er > 0. Klik fører til Stilladser med filter “Sidste 7 dage” eller lignende. | 0.5 d |

**Acceptkriterier:**  
- Enten: cron kører automatisk og dokumentation er klar; eller: brugeren kører stadig manuelt, men export og filter gør arbejdsflowet bedre.  
- Hvis cron-data gemmes: dashboard eller badge viser opdateret tal.

---

## Fase 3: OOH / forslag – batch, status og skabeloner

**Mål:** Hurtigere arbejdsgang med mockups og opfølgning.

### 3.1 Batch mockups

| # | Opgave | Detaljer | Estimat |
|---|--------|----------|---------|
| 3.1.1 | API | Verificer eller udvid `POST /api/ooh/batch-mockup`: input = `{ frameIds: string[], creativeId: string }`, output = liste af mockup-URL’er eller base64. Hvis ikke findes: implementer loop over frames med samme creative og eksisterende mockup-logik. | 0.5 d |
| 3.1.2 | UI i OOH-panel | I Frames- eller Proposals-view: multi-select af frames (checkboxes) + vælg én creative + knap “Generer mockups (X frames)”. Vis progress og derefter galleri eller links til download. | 0.5 d |
| 3.1.3 | Fejlhåndtering | Hvis én frame fejler: vis hvilken og fortsæt med resten. Samlet status: “3/5 genereret” med mulighed for at prøve de fejlede igen. | 0.25 d |

**Acceptkriterier:**  
- Bruger kan vælge fx 5 frames og 1 creative og få 5 mockups i én operation.

---

### 3.2 Status på forslag og overblik

| # | Opgave | Detaljer | Estimat |
|---|--------|----------|---------|
| 3.2.1 | Filtrer proposals | I OOH Proposals-listen: filtre på status (Sendt / Åbnet / Klikket / Svar / Møde / Solgt). Backend har sandsynligvis allerede status; sikr at UI kan filtrere og evt. sortere på dato. | 0.5 d |
| 3.2.2 | Dashboard-widget | Lille sektion på dashboard: “OOH denne uge” med antal sendt, åbnet, svar. Kan bruge eksisterende `dashboard.analytics.ooh`. Evt. link “Se alle” → OOH Proposals. | 0.25 d |

**Acceptkriterier:**  
- Proposals kan filtreres på status.  
- Dashboard viser et enkelt OOH-overblik med link til OOH.

---

### 3.3 Skabeloner til mails (opfølgning / tilbud)

| # | Opgave | Detaljer | Estimat |
|---|--------|----------|---------|
| 3.3.1 | Datamodel | Beslut hvor skabeloner gemmes: i OOH-store (frames/creatives/proposals) eller separat. Fx `emailTemplates: { id, name, subject, body, type: "followup" | "proposal" }`. | 0.25 d |
| 3.3.2 | CRUD API | `GET/POST /api/ooh/templates` eller `/api/ooh/email-templates`: liste, opret, opdater, slet. Gem i samme store som resten af OOH (fx Supabase-tabel). | 0.5 d |
| 3.3.3 | UI til skabeloner | I OOH-panel: ny underfane eller sektion “Mail-skabeloner”. Liste med navn, forhåndsvisning af emne, rediger/slet. “Ny skabelon” med felter subject + body (rich text eller plain). | 0.5 d |
| 3.3.4 | Brug ved send | Når bruger sender et forslag eller opfølgning: dropdown “Vælg skabelon” og udfyld subject/body fra skabelon. Bruger kan redigere før send. | 0.25 d |

**Acceptkriterier:**  
- Mindst én skabelon kan oprettes og vælges ved udsendelse.  
- Emne og brødtekst kan redigeres før send.

---

## Fase 4: Dashboard og overblik

**Mål:** Ét sted der viser tendenser og “hvad skal jeg gøre i dag?”.

### 4.1 Pipeline-tendens

| # | Opgave | Detaljer | Estimat |
|---|--------|----------|---------|
| 4.1.1 | Historik af tal | For at vise “sendt denne uge” eller “ejendomme uge 5 vs 6” skal der gemmes tidsserier. Muligheder: (A) Ny tabel `pipeline_snapshots` med daglige/ugentlige tal (total, ready, sent); (B) Aggreger fra eksisterende data (HubSpot, sends) hvis datoer findes. | 0.5 d |
| 4.1.2 | API | `GET /api/dashboard/history?period=week` returnerer fx sidste 4 uger med tal per uge. Implementer baseret på valgt datakilde. | 0.5 d |
| 4.1.3 | Graf på dashboard | Simpel søjlediagram eller linjediagram: “Sendt per uge”, “Nye i pipeline per uge”. Brug fx Chart.js, Recharts eller CSS-bars. | 0.5 d |

**Acceptkriterier:**  
- Dashboard viser visuelt hvordan “sendt” eller “klar” har udviklet sig over de sidste uger.

---

### 4.2 “Hvad skal jeg gøre i dag?”

| # | Opgave | Detaljer | Estimat |
|---|--------|----------|---------|
| 4.2.1 | Sektion på dashboard | Ny boks øverst eller under KPI: “I dag” eller “Handlinger”. Indhold: (1) X i staging afventer review → link til Staging; (2) Y klar til udsendelse → link til Outreach; (3) Z nye stilladser i dag → link til Stilladser; (4) evt. “Nye forslag uden svar” → OOH. | 0.5 d |
| 4.2.2 | Prioritering | Rækkefølge kan være konfigurerbar eller fast: fx staging først, derefter klar til udsendelse, derefter stilladser. Hver linje er en knap der skifter tab og evt. sætter filter. | 0.25 d |

**Acceptkriterier:**  
- Bruger ser 3–5 konkrete handlinger med tal og links.  
- Klik fører til den rigtige fane med relevant kontekst.

---

## Fase 5: UX – genveje, loading og fejl

**Mål:** Mere professionel og fejlsikker oplevelse.

### 5.1 Tastaturgenveje

| # | Opgave | Detaljer | Estimat |
|---|--------|----------|---------|
| 5.1.1 | Global keydown | I layout eller page: `useEffect` med `keydown`. Esc: luk modal/detalje-panel. Evt. Ctrl/Cmd + tal: skift tab (1=Home, 2=Discover, …). Dokumenter genveje i UI (fx lille “?”-tooltip eller Settings-sektion). | 0.5 d |
| 5.1.2 | Tab-specifikke | Stilladser: G for grid/table (allerede evt. map/table). OOH: ingen krav. Research: evt. R for “Kør research”. Valgfrit. | 0.25 d |

**Acceptkriterier:**  
- Esc lukker åbne modals.  
- Mindst én genvej til at skifte tab eller handling er dokumenteret.

---

### 5.2 Loading og skeleton

| # | Opgave | Detaljer | Estimat |
|---|--------|----------|---------|
| 5.2.1 | Skeleton-komponenter | Opret `SkeletonCard`, `SkeletonTable` (nogle få linjer med pulse-animation). Brug i stedet for bare “Loading…” eller spinner hvor det giver mening. | 0.25 d |
| 5.2.2 | Per-tab loading | Når Stilladser-tab åbnes og der ikke er data: vis skeleton for header + tabel. Når OOH loades: skeleton for frame-grid. Properties: skeleton for property-liste. | 0.5 d |
| 5.2.3 | Inline loading | Ved actions (fx “Send til pipeline”, “Kør research”): behold knap men vis spinner eller “Venter…” så brugeren ikke dobbeltklikker. | 0.25 d |

**Acceptkriterier:**  
- Tunge faner viser skeleton under load.  
- Actions viser tydelig loading-state.

---

### 5.3 Fejlhåndtering

| # | Opgave | Detaljer | Estimat |
|---|--------|----------|---------|
| 5.3.1 | API-fejl | Ved fetch til dashboard, properties, scaffolding, OOH: hvis `!res.ok` eller throw: vis en lille toast eller inline-besked “Noget gik galt. Prøv igen.” med knap “Genindlæs”. Undgå tom skærm. | 0.5 d |
| 5.3.2 | Scaffolding-scan fejl | Hvis scan fejler (timeout, 500): vis i log-panelet og evt. toast. Knap “Prøv igen” som genstarter scan. | 0.25 d |
| 5.3.3 | OOH/research fejl | Samme mønster: fejlbesked + mulighed for at prøve igen. Log evt. fejl til backend til senere analyse (valgfrit). | 0.25 d |

**Acceptkriterier:**  
- Ingen steder ender brugeren med helt tom skærm uden forklaring.  
- Mindst ét “Prøv igen”-punkt på kritiske flows (scan, send, research).

---

## Oversigt og prioritering

| Fase | Beskrivelse | Estimat (dage) | Afhængigheder |
|------|-------------|----------------|----------------|
| 1 | Refaktorering (splitting + context) | ~5–6 | Ingen |
| 2 | Stilladser (filter, export, cron/badge) | ~2.5–3.5 | Ingen |
| 3 | OOH (batch, status, skabeloner) | ~2.5–3 | Kan køre parallelt med 1–2 |
| 4 | Dashboard (tendens + “I dag”) | ~1.5–2 | 1.2 hjælper; 4.1 kræver datamodel |
| 5 | UX (genveje, loading, fejl) | ~1.5–2 | Kan køre parallelt |

**Anbefalet rækkefølge:**  
1. Start med **Fase 1.1** (splitting af page.tsx) så resten bliver nemmere at implementere i mindre komponenter.  
2. Derefter enten **Fase 2** (hurtig værdi til stillads-workflow) eller **Fase 5** (fejl og loading) for at øge robustheden.  
3. **Fase 3** og **Fase 4** kan planlægges efter behov og kapacitet.

---

## Noter til implementering

- **Branches:** Overvej én branch per fase (fx `feat/phase1-refactor`, `feat/phase2-scaffolding-export`).  
- **Tests:** Ved refaktorering: manuel test af alle faner og vigtige flows. Evt. tilføj enkelte integrationstests for API’er.  
- **Dokumentation:** Opdater README med nye genveje, hvordan cron kører, og hvordan man deployer.  
- **Design:** Ved nye UI-elementer (filter, export-knap, “I dag”-boks) – brug eksisterende design tokens og komponenter fra `globals.css` og Tailwind for konsistens.

---

*Sidst opdateret: februar 2025*
