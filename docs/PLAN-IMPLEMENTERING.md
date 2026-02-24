# Ejendom AI – Implementeringsplan for forbedringslisten

Planen er opdelt i **faser** med konkrete opgaver, berørte filer og anbefalet rækkefølge. Quick wins er markeret med ⚡.

---

## Fase 1: Kritiske + hurtige høj-prioritet (1–2 uger)

**Mål:** Ingen daglige irritationsmomenter; tydelig værdi på Dashboard og kerneflader.

### 1.1 Indstillinger (KRITISK)
| # | Opgave | Handling | Filer | Note |
|---|--------|----------|-------|------|
| 1 | Cron-endpoint Kopiér-knap | ✅ Allerede implementeret | `SettingsTab.tsx` | — |
| 2 | Auto-research toggle i UI | Verificer at toggle virker; evt. gør den tydeligere | `SettingsTab.tsx` | Toggles findes – test og evt. forstør/label |

### 1.2 Dashboard (HØJ) ⚡
| # | Opgave | Handling | Filer | Note |
|---|--------|----------|-------|------|
| 3 | Analytics viser 0 overalt | Skjul sektionen når `totalSent === 0` (og evt. `opened+clicked === 0`); vis kun når der er data | `HomeTab.tsx` | Wrap Analytics-blokken i `{dashboard?.analytics?.ooh?.totalSent > 0 && (...)}` |
| 4 | KPI stillads viser kun streg | Vis altid tal eller "—" / "Scan ikke kørt endnu"; sikr at `previousDay`/`daily` rendres som tal | `HomeTab.tsx` | Tjek at KPI value ikke er undefined; fallback-tekst ved ingen data |
| 5 | Full Circle for diskret | Større knap, mere centralt (fx over KPI-rækken eller i egen hero-linje), primær farve | `HomeTab.tsx`, evt. `page.tsx` / layout |
| 6 | Conversion rates demotiverende | Vis kun Open/Click/Reply/Meeting % når `totalSent >= 5` (eller lign. threshold) | `HomeTab.tsx` | Samme Analytics-blok; betinget visning af rate-bars |

### 1.3 Stilladser (HØJ) ⚡
| # | Opgave | Handling | Filer | Note |
|---|--------|----------|-------|------|
| 7 | Aarhus i dropdown | Tilføj "Aarhus" i by-liste; eller vis "Aarhus (kommer snart)" disabled | `ScaffoldingTab.tsx`, evt. config | Aarhus WFS findes i koden – tjek om den er i dropdown |
| 8 | "Start daglig scanning" uklar | Omdøb til "Hent aktive tilladelser nu" | `ScaffoldingTab.tsx` | Søg efter knaptekst og erstat |
| 9 | Tabs Rapport vs Aktive uklare | Bedre labels (fx "Rapport" / "Aktive tilladelser") og evt. ikoner | `ScaffoldingTab.tsx` | Find tab-definitioner og opdater label + aria |

### 1.4 Research (HØJ)
| # | Opgave | Handling | Filer | Note |
|---|--------|----------|-------|------|
| 10 | Liste over ejendomme der afventer research | Hent ejendomme med status NY_KRAEVER_RESEARCH (eller RESEARCH_IGANGSAT); vis liste med adresse + "Start research"-knap pr. række | `ResearchTab.tsx`, `page.tsx` (data), evt. `/api/properties` | Kræver at ResearchTab får `properties` eller egen fetch |
| 11 | Stop-knap under research | Knap "Stop" synlig når research kører; kald endpoint eller set flag så løkke stopper | `ResearchTab.tsx`, `page.tsx`, `/api/auto-research` eller research-stream | Backend skal understøtte abort (AbortController / flag) |
| 12 | Live-log / SSE under research | Research kører i dag som batch – tilføj SSE-stream fra research (evt. via /api/auto-research med stream) og vis log i ResearchTab | `ResearchTab.tsx`, `page.tsx`, `/api/auto-research` eller nyt stream-endpoint | Større: refaktor research til at sende events |

### 1.5 Email Kø (HØJ) ⚡
| # | Opgave | Handling | Filer | Note |
|---|--------|----------|-------|------|
| 13 | Kø-status (queued, sending, sent, failed) | Tilføj tabel eller liste med `outreachData.items` grupperet/ filtreret på status; vis queued, sending, sent, failed | `OutreachTab.tsx` | Data findes i `outreachData.stats` og `outreachData.items` |
| 14 | Rate limit-indikator | Vis fx "X sendt i dag / Y tilbage" fra `sentThisHour` og `rateLimitPerHour` | `OutreachTab.tsx` | `dashboard?.analytics?.emailQueue` eller outreachData |
| 15 | "Hent outreach-data" knap | Flyt til header som sekundær knap (lille, ikon+tekst); reducer størrelse | `OutreachTab.tsx` | Find knap og flyt i layout; styling |

### 1.6 Ejendomme (HØJ) ⚡
| # | Opgave | Handling | Filer | Note |
|---|--------|----------|-------|------|
| 16 | "Kør al research" bekræftelse | `window.confirm` eller modal: "Kør research for alle X ejendomme?" før trigger | `PropertiesTab.tsx` eller `page.tsx` | Wrap triggerResearch(ejendomId?) i confirm når der køres "alle" |
| 17 | Sidst opdateret på ejendomskort | Vis `lastmodifieddate` eller tilsvarende fra HubSpot på PropertyCard | `PropertyCard.tsx`, types/HubSpot | Kræver at felt hentes fra API og vises i UI |
| 18 | Kortvisning-tab | Implementer geografisk kort: brug ejendomme med lat/lng eller geokodér adresser; kort-komponent (Leaflet/Mapbox) | `PropertiesTab.tsx`, evt. `PropertiesMap.tsx`, `/api/properties` | Større: kort + data; tjek om PropertiesMap allerede findes |

---

## Fase 2: Resten af høj prioritet + start på medium (2–3 uger)

### 2.1 Research SSE (afslutning)
- Implementer streaming fra research-endpoint; vis fremgang og log i ResearchTab.

### 2.2 Ejendomme kort
- Færdiggør kortvisning med pins og evt. popup med adresse/status.

### 2.3 Discovery (MEDIUM) ⚡
| # | Opgave | Filer |
|---|--------|-------|
| 19 | Vej vs område som tabs | `DiscoverTab.tsx` – to tabs øverst, indhold skifter |
| 20 | Sidst scannet: [gade], [dato] | Gem sidste scan i localStorage eller context; vis under input |
| 21 | Tom-tilstand mindre + eksempler | Reducer placeholder, tilføj 2–3 eksempelgader som klikbare chips |

### 2.4 Gade-Agent (MEDIUM) ⚡
| # | Opgave | Filer |
|---|--------|-------|
| 22 | Historik over agent-kørsler | LocalStorage eller API; vis liste under input med dato, gade, resultat |
| 23 | By-dropdown (Aarhus m.fl.) | Samme by-liste som Discovery/Stilladser |
| 24 | Seneste kørsler / statistik | Kort statistik-kort (antal oprettet, research, osv.) fra seneste kørsel |

### 2.5 Staging (MEDIUM) ⚡
| # | Opgave | Filer |
|---|--------|-------|
| 25 | Pushed som kolonne | Tilføj kolonne i StagingQueue / tabel |
| 26 | Tom-state CTA | Knap "Start med Discovery" / "Kør Gade-Agent" der navigerer til fanen |
| 27 | Infoboks Staging vs Ejendomme | Kort tekst: Staging = før HubSpot; Ejendomme = i HubSpot |

### 2.6 Lead Sourcing (MEDIUM)
| # | Opgave | Filer |
|---|--------|-------|
| 28 | META-token advarsel → link til Indstillinger | Link til `#settings` eller Indstillinger-fane |
| 29 | Blocklist i UI | Side eller sektion: vis CVR-liste fra `/api/lead-sourcing/blocklist`, tilføj/fjern |
| 30 | Historik discoveries | Gem eller hent tidligere discover-resultater; vis liste |
| 31 | Visuelt hierarki | Sektioner med overskrifter/kort (CVR lookup vs Discover) |

---

## Fase 3: Medium resten + OOH + Indstillinger (2 uger)

### 3.1 OOH Proposals
| # | Opgave | Filer |
|---|--------|-------|
| 32 | Preview af mockups på forsiden | Liste med thumbnails eller links til de seneste mockups |
| 33 | Creatives thumbnails | Vis thumbnails i Creatives-tab (hent URL fra creatives API) |
| 34 | Kampagne-performance | Vis åbnet/klikket/svaret per proposal eller per kampagne |
| 35 | Outreach-integration tydelig | Kort tekst eller link: "Send via Email Kø" fra OOH til outreach |

### 3.2 Indstillinger
| # | Opgave | Filer |
|---|--------|-------|
| 36 | Aarhus WFS i systemstatus | Tilføj ping eller "Aarhus WFS" med status (implementeret / ikke implementeret) | `api/status` eller health, `SettingsTab.tsx` |
| 37 | Setup-guide manglende API'er | Sektion: "Manglende integrationer" med link til env docs og evt. .env.example |

---

## Fase 4: Lav prioritet (1–2 uger)

### 4.1 Login
- Glemt kode: ekstra side eller flow (afhænger af auth-provider).
- Multi-user: kun design/note indtil I vælger auth-model.

### 4.2 Dashboard
- Aktivitets-feed: backend-eventlog eller aggregat fra HubSpot + sends; vis seneste N på Dashboard.
- Command palette (Cmd+K): global komponent med søgning (adresser, ejendomme, faner).

### 4.3 Navigation
- Keyboard-hint på faner (lille "1", "2" … ved siden af label).
- Gruppering: dropdown eller "Pipeline" / "Outreach" / "Sourcing" med underfaner.

### 4.4 Ejendomme
- Undersøg score 7/10 på alle: er det test-data eller bug i scoring?

---

## Fase 5: Nye features (backlog / længere sigt)

| # | Feature | Kort beskrivelse |
|---|---------|-------------------|
| 38 | Onboarding-flow | Første login: trinvis guide (connect HubSpot → første scan → godkend lead → send mail). |
| 39 | Notifikationer | Alerts (in-app eller push): ny stillads høj score, svar på mail, research-fejl. |
| 40 | Historik på tværs | Én side/panel: "Seneste 7/30 dage" – alle events (scans, research, mails, stillads). |
| 41 | Aarhus WFS fuld | Færdiggør Aarhus i stillads-modul (allerede delvist). |
| 42 | Role-baseret adgang | Founder vs Sales view (filtrer faner eller data). |

---

## Anbefalet rækkefølge (sprint 1)

1. **Fase 1.2** (Dashboard) – opg 3–6 – hurtig visuel forbedring.  
2. **Fase 1.3** (Stilladser) – opg 7–9 – tekster og dropdown.  
3. **Fase 1.5** (Email Kø) – opg 13–15 – tabel + rate limit + knap.  
4. **Fase 1.6** (Ejendomme) – opg 16–17 – confirm + timestamp (kort kan vente).  
5. **Fase 1.4** (Research) – opg 10–11 først (liste + stop); SSE (opg 12) i Fase 2.

---

## Filer der ofte berøres

| Område | Filer |
|--------|--------|
| Dashboard / Home | `src/components/tabs/HomeTab.tsx`, `src/app/page.tsx` |
| Stilladser | `src/components/tabs/ScaffoldingTab.tsx` |
| Research | `src/components/tabs/ResearchTab.tsx`, `src/app/page.tsx`, `src/app/api/auto-research/route.ts` |
| Email Kø | `src/components/tabs/OutreachTab.tsx` |
| Ejendomme | `src/components/tabs/PropertiesTab.tsx`, `src/components/dashboard/PropertyCard.tsx` |
| Discovery | `src/components/tabs/DiscoverTab.tsx` |
| Gade-Agent | `src/components/tabs/StreetAgentTab.tsx` |
| Staging | `src/components/StagingQueue.tsx`, `src/components/tabs/StagingTab.tsx` |
| Lead Sourcing | `src/components/tabs/LeadSourcingTab.tsx` |
| OOH | `src/components/OOHPanel.tsx`, `src/components/tabs/OOHTab.tsx` |
| Indstillinger | `src/components/tabs/SettingsTab.tsx`, `src/app/api/status/route.ts` |

---

## Checkliste mod FORBEDRINGSLISTE.md

Efter hver opgave: opdater `docs/FORBEDRINGSLISTE.md` og sæt `[x]` på den pågældende linje, så listen altid matcher denne plan.
