# Plan: Lead Sourcing & Find de rette personer

Formål: ét sted hvor I kan **sourcé nye kunder/leads** og **finde de rette kontaktpersoner** (marketing, medieindkøb, direktør) i organisationen – med kvalifikation ud fra virksomhedens resultat/egenkapital og **uden at inkludere firmaer/kontakter I allerede har i CRM**.

---

## 1. Mål

- **Sourcé nye virksomheder** der giver mening ift. jeres salg (f.eks. egenkapital, omsætning, branche).
- **Find de rette personer** i hver virksomhed: typisk Marketingschef, Marketingsdirektør, Medieindkøber, Brand Manager, Direktør.
- **Ekskluder eksisterende CRM**: ingen firmaer eller domæner I allerede har i HubSpot (ejendomme-ejere, kontakter, companies).
- **Én indgang i appen**: f.eks. ny fane **"Lead Sourcing"** eller under Discovery.

---

## 2. Datakilder

### 2.1 Virksomheder (hvem skal vi kontakte?)

| Kilde | Hvad vi får | Bemærkning |
|-------|-------------|------------|
| **CVR API** | Navn, CVR, adresse, branche (DB07), stiftelsesdato | I bruger det allerede. CVR har ikke direkte "resultat/egenkapital" i det gratis API. |
| **CVR (betalt / datatilsynet)** | Økonomiske nøgletal (resultat, egenkapital, omsætning) | Kræver adgang (f.eks. Proff, CreditSafe, eller officiel CVR-dataudtræk). |
| **Egen liste / upload** | CSV med CVR eller virksomhedsnavne | Simpel start: I uploader en liste, systemet beriger og finder kontakter. |
| **Branchesøgning** | F.eks. "alle med DB07 = 73.11 (Reklame)" eller brancheord | CVR API understøtter søgning på navn; evt. tredjepart for branchefilter. |

**Anbefaling fase 1:** Start med **CVR + egen liste/upload**. Kvalifikation på egenkapital/resultat kræver enten et betalt datakilde-integration (Proff/CreditSafe) eller manuel/CSV-import af "gode" CVR-numre.

### 2.2 Kontaktpersoner (de rette roller)

| Kilde | Hvad vi får | Bemærkning |
|-------|-------------|------------|
| **CVR** | Virksomhedsnavn, evt. bestyrelse/direktør (offentlige data) | Begrænset til topledelse i nogle tilfælde. |
| **Web / virksomhedens hjemmeside** | "Om os", "Team", "Kontakt" | I har allerede web-scraping i research; kan genbruges til at finde titler. |
| **LinkedIn (API / scraping)** | Titler, evt. navne | LinkedIn API er begrænset; scraping har compliance/ToS-udfordringer. |
| **Email-finder (nuværende)** | Email ud fra domæne + navn/titel | I bruger allerede email-finder; kan køre på "marketing@", "medie@", eller personer fundet på web. |
| **Tredjepart (Apollo, Lusha, Hunter, etc.)** | Kontakter med titel og email | Betalt; kan integreres senere. |

**Målroller (prioritet):**

- Marketingschef / Marketing Manager  
- Marketingsdirektør / CMO  
- Medieindkøber / Media Buyer  
- Brand Manager  
- Direktør / CEO  

Systemet skal kunne **matche titler** fra kilder (web, CVR, evt. LinkedIn) mod disse roller – f.eks. med en fast liste + synonymer og evt. LLM til "er denne titel relevant for marketing/medie?".

### 2.3 Kvalifikation (giver det mening?)

- **Egenkapital / resultat:** Kræver økonomidata (CVR betalt eller anden provider). Alternativ: I importerer en "god liste" (CVR-numre) fra jeres egen vurdering eller et eksternt udtræk.  
- **Størrelse:** Omsætning eller antal ansatte – igen ofte fra betalt kilde; ellers proxy via CVR (stiftelsesdato, branche).  
- **Branche:** CVR DB07 eller jeres egne brancheord – så I fokuserer på reklame, retail, FMCG, etc.  
- **Geografi:** I arbejder med DK; evt. filtrering på region/kommune hvis relevant.

---

## 3. CRM-deduplikation (ikke jeres nuværende kunder)

- **Implementeret:** Dedupe går via **HubSpot Contacts** (ikke Ejendomme). Systemet henter alle kontakters email-domæner og bygger en blocklist. Virksomheder hvis domæne (fra CVR/website) findes blandt disse markeres som «Allerede i CRM» og kan ikke tilføjes igen.  
- **HubSpot – Companies:** Bruges til at oprette nye leads (Company + Contact); blocklist er kun baseret på Contacts.

---

## 4. Brugerflow (UX)

### Fase 1 – Minimum viable

1. **Ny fane: "Lead Sourcing"** (eller under Discovery).  
2. **Input:**  
   - Upload CSV med CVR-numre eller virksomhedsnavne, **eller**  
   - Indtast branche/søgeord + (senere) filtre.  
3. **Trin 1 – Virksomheder:**  
   - System henter CVR-data for hver række.  
   - Filtrér fra: sorteliste (CRM CVR + domæner).  
   - Vis liste: virksomhedsnavn, CVR, adresse, branche.  
4. **Trin 2 – Find kontakter:**  
   - For hver valgte virksomhed: find roller (web + evt. CVR).  
   - Match titler mod "Marketingschef, Medieindkøber, Brand Manager, Direktør" (konfigurerbar liste + synonymer).  
   - Kør email-finder på fundne navne/roller.  
5. **Output:**  
   - Tabel/lista med virksomhed + kontakt(er) + email + rolle.  
   - **"Tilføj til pipeline"** – opret ejendom eller "lead"-post i HubSpot (afhænger af jeres data-model).

### Senere

- Søgning direkte på branche (CVR DB07) eller økonomiske kriterier (når I har datakilde).  
- Automatisk scoring (prioriter leads ud fra størrelse, branche, matchet rolle).  
- Sync til HubSpot Companies + Contacts i stedet for kun Ejendomme.

---

## 5. Teknisk skitse

- **Backend:**  
  - API: f.eks. `POST /api/lead-sourcing/companies` (upload CSV eller send CVR-liste).  
  - Hent CVR-data (eksisterende `lib/research/cvr.ts`).  
  - Ny modul: `lib/lead-sourcing/dedupe.ts` – hent CRM CVR/domæner (HubSpot), byg sorteliste, filtrér.  
  - Ny modul: `lib/lead-sourcing/contacts.ts` – find roller (web-scrape virksomhedens side, evt. CVR bestyrelse), titel-match (konfigurerbar liste + evt. LLM), kald eksisterende email-finder.  
- **Frontend:**  
  - Fane "Lead Sourcing" med upload + tabel (virksomheder → kontakter) + "Tilføj til pipeline" / export CSV.  
- **Konfiguration:**  
  - Liste over "målroller" (marketingschef, medieindkøber, …) og synonymer.  
  - Evt. minimum egenkapital/omsætning når datakilden er tilgængelig.

---

## 6. Faser – forslag

| Fase | Indhold | Afhængighed |
|------|--------|-------------|
| **1** | CRM-dedupe: hent CVR + domæner fra HubSpot (Ejendomme + evt. Companies), eksponér som "sorteliste". | HubSpot API |
| **2** | Lead Sourcing UI: upload CSV (CVR eller navne) → CVR-lookup → filtrér mod sorteliste → vis virksomhedsliste. | CVR API, fase 1 |
| **3** | Find kontakter: for valgte virksomheder – web-scrape for titler, match mod målroller, kør email-finder. | Eksisterende research/email-finder |
| **4** | "Tilføj til pipeline": opret record i HubSpot (ejendom eller company/contact) fra valgt lead. | HubSpot API |
| **5** | Kvalifikation: integrer økonomidata (Proff/CreditSafe/anden) eller CSV-import af "gode CVR" med score. | Valgfri betalt kilde |
| **6** | Branche-/søgesourcing: søg CVR på branche eller navn og generer liste til berigelse. | CVR / tredjepart |

---

## 7. Korte svar på "giver det mening?"

- **Resultat/egenkapital:** Kræver ekstern datakilde (betalt) eller manuel/CSV-baseret liste; kan bygges i fase 5.  
- **Ikke allerede i CRM:** Løses med sorteliste fra HubSpot (ejendomme-ejere + evt. companies + kontakter) i fase 1–2.  
- **De rette personer:** Løses med faste målroller (marketingschef, medieindkøber, brand manager, direktør) + titel-match fra web/CVR + eksisterende email-finder.

Hvis I vil, kan næste skridt være at implementere **fase 1 (CRM-dedupe)** og **fase 2 (CSV-upload + CVR-liste + filtrering)** så I hurtigt kan uploade en liste og se "nye" virksomheder uden at ramme jeres nuværende kunder.
