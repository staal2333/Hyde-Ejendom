# Ejendom AI – Research Agent v1

AI-drevet ejendomsresearch-agent der automatisk finder ejere, kontaktpersoner og genererer outreach-mails til ejendomme.

## Hvad gør den?

1. **Finder ejendomme** i HubSpot med status `NY_KRAEVER_RESEARCH`
2. **Researcher** automatisk via CVR, BBR, web-scraping og søgemaskiner
3. **Analyserer** data med GPT-4o-mini – finder ejere, administratorer og kontaktpersoner
4. **Genererer mailudkast** tilpasset jeres tone of voice
5. **Gemmer alt i HubSpot** – kontakter, noter med mailudkast og opfølgningstasks

Du/I gennemgår og sender mails manuelt fra HubSpot.

## Arkitektur

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   HubSpot   │◄───►│  Next.js API │◄───►│  OpenAI     │
│  (CRM data) │     │  (Railway)   │     │  (GPT-4o-m) │
└─────────────┘     └──────┬───────┘     └─────────────┘
                           │
                    ┌──────┴───────┐
                    │  Research    │
                    │  - CVR API   │
                    │  - BBR/DAWA  │
                    │  - Web scrape│
                    │  - DuckDuckGo│
                    └──────────────┘
```

## Workflow

```
Ejendom (NY_KRAEVER_RESEARCH)
    │
    ▼
Research (CVR, BBR, web)
    │
    ▼
LLM Analyse (ejer, kontakter, outdoor score)
    │
    ▼
HubSpot Update (company + contacts)
    │
    ▼
LLM Email Draft (personlig outreach-mail)
    │
    ▼
HubSpot Note + Task (mailudkast klar til review)
    │
    ▼
Status: KLAR_TIL_UDSENDELSE
```

## Quick Start

### 1. Klon og installer

```bash
git clone <repo-url>
cd ejendom-ai
npm install
```

### 2. Opsæt miljøvariabler

```bash
cp .env.example .env.local
```

Udfyld:
- `HUBSPOT_ACCESS_TOKEN` – [Opret Private App i HubSpot](https://developers.hubspot.com/docs/api/private-apps)
- `OPENAI_API_KEY` – [Hent API-nøgle](https://platform.openai.com/api-keys)
- `CRON_SECRET` – Valgfri, beskytter research-endpointet

### 3. Opsæt HubSpot Custom Properties

**Company properties** (opret i HubSpot → Settings → Properties → Companies):

| Property | Internal name | Type |
|----------|--------------|------|
| Outreach Status | `outreach_status` | Single-line text |
| Outdoor Score | `outdoor_score` | Number |
| Owner Company Name | `owner_company_name` | Single-line text |
| Owner Company CVR | `owner_company_cvr` | Single-line text |
| Research Summary | `research_summary` | Multi-line text |
| Research Links | `research_links` | Multi-line text |
| Outdoor Potential Notes | `outdoor_potential_notes` | Multi-line text |

**Contact properties** (opret i HubSpot → Settings → Properties → Contacts):

| Property | Internal name | Type |
|----------|--------------|------|
| Rolle | `rolle` | Single-line text |
| Contact Source | `contact_source` | Single-line text |
| Contact Confidence | `contact_confidence` | Number |
| Primær for ejendom | `primaer_for_ejendom` | Single-line text |

### 4. Kør lokalt

```bash
npm run dev
```

Åbn [http://localhost:3000](http://localhost:3000) for dashboard.

### 5. Test research

1. Opret en company i HubSpot med:
   - `name`: Ejendommens navn
   - `address`: Adresse
   - `zip`: Postnummer
   - `city`: By
   - `outreach_status`: `NY_KRAEVER_RESEARCH`

2. Klik "Kør research nu" i dashboardet, eller kald:
   ```
   GET /api/run-research
   ```

## Deploy til Railway

1. Opret nyt projekt på [Railway](https://railway.app)
2. Connect til GitHub repo
3. Tilføj environment variables (se `.env.example`)
4. Railway deployer automatisk

### Cron Job
Opsæt et cron job i Railway (eller brug en ekstern cron-service):
- **URL**: `https://your-app.railway.app/api/run-research`
- **Schedule**: `0 * * * *` (hver time)
- **Header**: `Authorization: Bearer <CRON_SECRET>`

## API Endpoints

| Endpoint | Metode | Beskrivelse |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/dashboard` | GET | Dashboard statistik |
| `/api/properties` | GET | Liste over alle ejendomme |
| `/api/run-research` | GET | Kør research for alle ventende ejendomme |
| `/api/run-research` | POST | Kør research for én ejendom (`{ propertyId }`) |

## Outreach Status Lifecycle

```
NY_KRAEVER_RESEARCH → RESEARCH_IGANGSAT → RESEARCH_DONE_CONTACT_PENDING
    → KLAR_TIL_UDSENDELSE → FOERSTE_MAIL_SENDT → OPFOELGNING_SENDT
    → SVAR_MODTAGET → LUKKET_VUNDET / LUKKET_TABT
```

## Fremtidige forbedringer (v2+)

- [ ] Automatisk mail-udsendelse via HubSpot/Gmail
- [ ] Finetuning af LLM baseret på dine rettelser
- [ ] Automatisk opfølgning
- [ ] Integration med flere datakilder (OIS, Tingbogen)
- [ ] Bedre scoring-model for outdoor potentiale
- [ ] Multi-user support med roller
