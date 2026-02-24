# Ejendom AI – Forbedringsliste

## KRITISK (påvirker daglig brug)

### Indstillinger
- [ ] Auto-research regler kan ikke toggles fra UI – tilføj toggle-knap direkte (i stedet for kun cron-endpoint)
- [ ] Cron-endpoint vises som plain tekst – tilføj "Kopiér"-knap ved siden af

---

## HØJ PRIORITET (manglende funktionalitet)

### Dashboard
- [ ] Analytics-sektion viser 0 på alt og giver ingen værdi – skjul indtil der er data, eller erstat med "Kom i gang"-guide
- [ ] KPI-kort "Nye stilladsansøgninger" viser kun grøn streg og tekst – bør vise tal eller "Scan ikke kørt endnu"
- [ ] Full Circle-knappen er for diskret – fremhæv som primær CTA (større, mere centralt)
- [ ] Conversion rates (0%, 0%, 8%) demotiverende med lavt datagrundlag – vis kun når der er nok data

### Stilladser
- [ ] Aarhus mangler i by-dropdown – implementer eller vis "Kommer snart"
- [ ] "Start daglig scanning"-knap er uklar – omdøb til "Hent aktive tilladelser nu"
- [ ] Rapport-visning vs. Aktive tilladelser tabs uklare (blå vs. orange prik) – bedre labels

### Research
- [ ] Siden er næsten tom – vis liste over ejendomme der afventer research med "Start"-knapper
- [ ] Ingen live-log eller fremgangsviser under kørsel – implementer SSE/live output
- [ ] Ingen stop-knap til at afbryde igangværende research

### Email Kø
- [ ] Ingen visning af kø-status (queued, sending, sent, failed) – tilføj mail-kø tabel
- [ ] Rate limit-indikator mangler – vis "X mails sendt i dag / X tilbage"
- [ ] "Hent outreach-data"-knap for stor og centreret – flyt til header som sekundær knap

### Ejendomme
- [ ] Kortvisning-tab eksisterer men er ikke implementeret – tilføj geografisk kortvisning
- [ ] "Kør al research"-knap mangler bekræftelsesdialog – farlig uden confirm
- [ ] Ingen "Sidst opdateret"-timestamp på ejendomskort

---

## MEDIUM PRIORITET (UX og flow)

### Discovery
- [ ] De to scantyper (vej og område) som tabs i stedet for under hinanden
- [ ] Ingen historik over tidligere scans – vis "Sidst scannet: Vesterbrogade, 12. feb"
- [ ] Tom-tilstandens placeholder for stor – reducer og tilføj eksempler på gadenavne

### Gade-Agent
- [ ] Ingen historik over tidligere agent-kørsler – log under inputfeltet
- [ ] Manglende by-valgmuligheder – tjek Aarhus og andre byer i dropdown
- [ ] Siden meget tom – udfyld med seneste kørsler / statistik

### Staging
- [ ] "Pushed"-status mangler som kolonne i UI
- [ ] Tom-state linker ikke til Discovery/Gade-Agent – tilføj CTA-knap
- [ ] Forskel Staging vs. Ejendomme ikke forklaret – kort infoboks

### Lead Sourcing
- [ ] META_AD_LIBRARY_ACCESS_TOKEN-advarsel burde linke til Indstillinger → API Integrationer
- [ ] Ingen blocklist-visning i UI – se/rediger blocklist
- [ ] Ingen historik over tidligere discoveries
- [ ] Siden mangler visuelt hierarki – opdel de to sektioner

### OOH Proposals
- [ ] Ingen preview af eksisterende mockups på forsiden
- [ ] Creatives-tab viser kun antal uden thumbnails
- [ ] Ingen kampagne-performance (åbnet/klikket/svaret per proposal)
- [ ] Outreach-underfanens integration med Email Kø tydeliggøres

### Indstillinger
- [ ] Aarhus WFS mangler i systemstatus – tilføj eller marker "ikke implementeret"
- [ ] Ingen setup-guide til manglende API'er (OpenAI, Gmail, Supabase)

---

## LAV PRIORITET (nice to have)

### Login
- [ ] Ingen "Glemt kode"-funktion
- [ ] Ingen multi-user / brugeradministration

### Dashboard
- [ ] "Aktivitets-feed" – seneste hændelser
- [ ] Global søgning / command palette (Cmd+K)

### Navigation
- [ ] Keyboard-shortcuts (1–9, 0) synlige som hint på faner
- [ ] Nav-baren 10+ faner – overvej gruppering (Pipeline / Outreach / Sourcing)

### Ejendomme
- [ ] Score-cirklen 7/10 på alle – tjek test-data/bug

---

## MANGLER HELT (nye features)

- [ ] Onboarding-flow – første login: connect HubSpot, første scan, godkend lead, send mail
- [ ] Notifikationer – alert ved ny stillads (høj score), svar på mail, research-fejl
- [ ] Historik på tværs – alt hvad systemet har gjort 7/30 dage
- [ ] Aarhus WFS fuldt implementeret i Stilladser
- [ ] Role-baseret adgang – "Founder view" vs. "Sales view"
