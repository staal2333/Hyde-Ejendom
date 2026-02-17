# Business Hub – Vision og plan

*Ét sted hvor alt sker: projekter, prior (backlog), supply chain og al forbundet info.*

---

## 1. Hvad er lavet (Fase 1.1 + 1.2)

- **Alle tabs er udskilt** fra `page.tsx`:
  - `HomeTab`, `DiscoverTab`, `ScaffoldingTab`, `StagingTab`, `PropertiesTab`, `ResearchTab`, `StreetAgentTab`, `OutreachTab`, `OOHTab`, `SettingsTab`
- **DashboardContext** bruges: `dashboard`, `properties`, `fetchData`, `addToast`, `activeTab`, `oohInitialFrame`/`oohInitialClient`, `systemHealth`, osv.
- **page.tsx** har nu: layout, sidebar, provider, tab-switch (én komponent per tab) og de fælles hjælpere (ProgressBar, LogPanel, ResultStat, PipelineStat, PropertyCard) som bruges af flere tabs.
- **Build** gennemfører uden fejl.

**Næste skridt i Fase 1:**  
- Evt. flytte ProgressBar/LogPanel/ResultStat/PipelineStat/PropertyCard til delte UI-komponenter, så `page.tsx` bliver endnu slankere (~400–500 linjer mål fra ROADMAP).  
- Dokumentere hvilke props/context hver tab forventer (i OVERVIEW eller i selve tab-filerne).

---

## 2. Business Hub – vision

**Mål:** Ejendom AI skal fungere som jeres **forretningshub** – det eneste sted I åbner for at:

- Se **alt** der er forbundet med jeres projekter og pipeline
- Styring af **prior** (backlog): hvad venter, hvad er klar, hvad skal gøres i dag
- Få overblik over **supply chain**: stilladser (nye tilladelser), discovery (veje), research, outreach, OOH – og hvordan de hænger sammen
- Beslutninger og handlinger tager udgangspunkt i **samme data** (én sandhed)

### 2.1 Hvad “alt forbundet info” betyder

| Område | I dag | Business hub (mål) |
|--------|--------|---------------------|
| **Projekter** | Ejendomme i pipeline (Properties), OOH-forslag, staging-kø | Ét overblik: “Projekt = ejendom + stillads/OOH/outreach-status”. Klik på et projekt → se alt: research, kontakter, mails, OOH-frames, stillads-tilladelser |
| **Prior (backlog)** | Staging “afventer”, Properties “klar til udsendelse”, dashboard KPI | Én “Prior”-visning: “I dag skal du: X i staging, Y klar til mail, Z nye stilladser”. Prioritet og deadlines (evt. fra HubSpot) samlet ét sted |
| **Supply chain** | Discover → Staging → Properties → Research → Outreach; Stilladser separat; OOH separat | Synlig **kæde**: “Vej → stilladser/research → ejendom → kontakt → mail → OOH”. Hvor er flaskehalse? Hvad kommer næste uge? |
| **Forbundet info** | Data i forskellige tabs og API’er | Samlet kontekst: samme ejendom viser stillads-data, research, kontakt, email-status, OOH-forslag – uden at skifte tab for hver dimension |

### 2.2 Hvordan nuværende tabs passer ind

- **Home** = hub-dashboard: KPI, “hvad skal jeg gøre”, genveje, systemstatus.
- **Discover / Stilladser / Street Agent** = **supply chain input**: nye leads (veje, tilladelser, bygninger).
- **Staging** = **prior-godkendelse**: hvad skal ind i pipeline.
- **Properties** = **projekter (ejendomme)** med status, filter, research, feedback, OOH-start.
- **Research / Outreach** = **supply chain midt**: fra ejendom til klar mail.
- **OOH** = **projekter (forslag og kampagner)** knyttet til ejendomme og kontakter.
- **Settings** = konfiguration og systemtilstand.

Udvidelsen er ikke at erstatte tabs, men at:

1. **Sammenkoble** projekter på tværs (ejendom ↔ stillads ↔ OOH ↔ mail).
2. **Én “Prior / I dag”**-visning der trækker fra staging, klar-til-mail, stilladser, OOH.
3. **Supply chain-overblik**: hvor mange er i hvert trin, hvor er ventetiden, hvad kommer næste.

---

## 3. Plan for “resten” (roadmap Fase 2–5)

Kort reference til **ROADMAP.md** – disse faser står uændret; her er hvad de indebærer og hvordan de understøtter business hub.

### Fase 2: Stilladser – filter, export, cron

- **Filter på oprettet** (dato), **export CSV/Excel**, **cron + badge** (“X nye siden i går”).
- **Hub-værdi:** Stilladser bliver en tydelig del af supply chain; “nye i dag” kan indgå i “I dag”-boksen på dashboard.

### Fase 3: OOH – batch, status, skabeloner

- **Batch mockups**, **filter på forslag-status**, **mail-skabeloner** til opfølgning/tilbud.
- **Hub-værdi:** OOH-projekter og -status samles så de kan vises i et fælles “projekter/prior”-overblik.

### Fase 4: Dashboard og overblik

- **Pipeline-tendens** (graf: sendt/klar over tid).
- **“Hvad skal jeg gøre i dag?”** – staging, klar til mail, stilladser, evt. OOH.
- **Hub-værdi:** Dette er kernesektionen i business hub: ét sted at starte dagen og træffe beslutninger.

### Fase 5: UX – genveje, loading, fejl

- **Tastaturgenveje**, **skeletons**, **ensartet fejlhåndtering og “Prøv igen”**.
- **Hub-værdi:** Mere professionel og pålidelig oplevelse når I bruger hubben dagligt.

---

## 4. Anbefalet rækkefølge (inkl. business hub)

1. **Fase 1 (afslutning):** Evt. flyt fælles UI (ProgressBar, LogPanel, ResultStat, PipelineStat, PropertyCard) til `components/ui` eller `components/dashboard`, så page.tsx når ~400–500 linjer. Dokumenter props/context per tab.
2. **Fase 4.2 (“I dag”-boksen)** kan tages tidligt: én sektion på Home der viser “X i staging, Y klar til mail, Z nye stilladser” med links. Det er den første synlige “business hub”-oplevelse.
3. **Fase 2** (stilladser filter/export/cron) og **Fase 5** (UX) giver hurtig værdi og stabilitet.
4. **Fase 3** (OOH batch/status/skabeloner) og **Fase 4.1** (pipeline-tendens) kan planlægges derefter.
5. **Business hub udvidelser** (projekt-sammenkobling, supply chain-visning, prioritet fra HubSpot) kan defineres som **Fase 6** når Fase 2–5 er under kontrol – med konkrete krav til “projekt = ejendom + alle relaterede data” og “Prior”-visning.

---

## 5. Korte næste-skridt

| Prioritet | Handling |
|-----------|----------|
| Høj | Afslut Fase 1: flyt fælles hjælpere ud af page.tsx; få page under ~500 linjer; kort dokumentation af tab-props. |
| Høj | Implementer Fase 4.2 “I dag”-boks på Home (staging, klar til mail, stilladser + links). |
| Medium | Fase 2: Stilladser filter + export + cron/badge. |
| Medium | Fase 5: Genveje, skeletons, fejlhåndtering. |
| Lavere | Fase 3 OOH + Fase 4.1 tendens; derefter Fase 6 business hub (projekt-sammenkobling, prior, supply chain-overblik). |

---

*Sidst opdateret: februar 2025*
