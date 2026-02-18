# Plan: Ejendomme-kort, redigering og fuld mail-agent (2000 ejendomme / 2 uger)

Formål: **Kort under Ejendomme** med status, **redigering af ejendomsinfo** (mail m.m.), og et **komplet mail-agent-system** i appen: du finder mail hvis AI ikke gør, godkender udkast, og ved tilbagesvar laver AI et svar-udkast (trænet på jeres data/tone) som I kun godkender eller redigerer – med mål om **2000 ejendomme på 2 uger** og AI der håndterer kontakt, opfølgning, udkast og “lytter” til indholdet i mails og tager handling.

---

## 1. Er det muligt?

**Ja**, under nogle betingelser:

| Område | Muligt? | Hvad der skal til |
|--------|--------|-------------------|
| **Kort med ejendomme + status** | Ja | Geocoding (DAWA/Dataforsyningen) for adresser + eksisterende PropertiesMap. |
| **Redigere ejendomsinfo (mail m.m.)** | Ja | API til at opdatere ejendom (HubSpot) + modal/side i UI. |
| **Mail hele vejen i appen** | Ja | I har allerede: afsendelse (Gmail), kø, indbakke-liste, AI-udkast til svar. Mangler: samlet inbox/svar-flow i UI, persistence af thread→ejendom. |
| **AI-udkast til svar (jeres tone)** | Ja | `/api/mail/reply-draft` findes og bruger `TONE_OF_VOICE` + ejendomskontekst. Kan strammes med flere eksempler. |
| **Godkend/rediger og send** | Ja | UI hvor du ser tråd + AI-udkast, redigerer og sender – kræver at send-funktion kan sende som svar i tråd (reply). |
| **2000 ejendomme på 2 uger** | Ja, med begrænsninger | Gmail rate limits (typisk 500/dag for almindelige konti, 2000/dag for Workspace). 2000/14 ≈ 143 mails/dag. Med 200/time i jeres kø = under 1 time sending/dag – **opnåeligt** hvis I har én dedikeret afsender og evt. Workspace. |
| **AI “lytter” og tager action** | Delvist / udbyg | I dag: AI laver udkast til svar. Udbyg: klassificer tilbagemelding (positiv/afvisning/spørgsmål) → forskellige udkast eller “næste skridt” (opfølgning, luk, book møde). Kræver tydelige regler og evt. finjustering. |

**Korte svar:**  
- Kort, redigering og mail-flow i appen: **ja, muligt** med den nuværende stack.  
- 2000 på 2 uger: **ja**, hvis Gmail-limits tillader det (Workspace anbefales) og I primært “godkender” i stedet for at skrive fra bunden.  
- AI der “lytter og tager action”: **ja** ved at udvide reply-draft med klassifikation og handlingsregler (fx “hvis afvisning → luk; hvis interesse → udkast til næste mail”).

---

## 2. Ejendomme: kort og redigering

### 2.1 Kort

- **Formål:** Se alle ejendomme “i loopet” (i pipeline) på et kort med **status** (farve/label).
- **Eksisterende:** `PropertiesMap.tsx` (Leaflet, CARTO-basemap) forventer `PropertyMapPoint[]` med `lat`, `lng`, `property`.
- **Manglende:** Ejendomme fra HubSpot har adresse/postnr/by men ikke koordinater. I skal **geokode** adresser.
  - **Løsning:** API (fx `GET /api/properties/geocode?address=...&postalCode=...&city=...`) der kalder DAWA `adresser?q=...` eller Dataforsyningen og returnerer `lat, lng`. Ved indlæsning af ejendomme: batch-geocode (med cache) og byg `points[]` til kortet.
- **UI:** Under Ejendomme-fanen: toggle “Liste” / “Kort”. I kortvisning: PropertiesMap med `points`, klik på markør åbner popup med navn, adresse, status, evt. “Rediger” / “Se detaljer”.

### 2.2 Redigering af ejendomsinfo (mail m.m.)

- **Formål:** Kunne rette kontaktmail, navn, noter osv. direkte i appen.
- **Backend:** HubSpot ejendom opdateres allerede via `updateEjendom`. Tilføj eller brug eksisterende endpoint (fx `PATCH /api/properties/[id]`) med felter: `mailadresse`, `kontaktperson`, `telefonnummer`, evt. `research_summary` (kun læse/overskrive efter bekræftelse).
- **Frontend:** I ejendomsliste eller kort-popup: “Rediger” åbner modal med felter (navn, adresse, kontaktperson, mail, telefon). Gem → kald API → opdater lokal state / refetch.

---

## 3. Mail-agent-systemet (hele flowet i appen)

### 3.1 Nuværende byggesten

- **Afsendelse:** Gmail API, rate limit (fx 200/time), kø (`email-queue.ts`), link til ejendom (`propertyId`).
- **Tråd→ejendom:** `mail-threads.ts` (in-memory) gemmer `threadId → propertyId` ved send. **Skal persisteres** (Supabase/DB eller fil) så det overlever genstart.
- **Indbakke:** `GET /api/mail/inbox` lister tråde med `propertyId` (fra `getPropertyIdForThread`).
- **AI-udkast til svar:** `POST /api/mail/reply-draft` med `threadId` (og evt. `propertyId`) – returnerer `subject`, `body` i jeres tone.

### 3.2 Din rolle

- **Finde mail:** Hvis AI ikke finder kontakt: du kan redigere ejendommens mail (se 2.2) og evt. køre “find kontakt”/research igen. Udkast til første mail genereres af research-pipeline; du **godkender eller redigerer** i Email Kø og sender.
- **Godkende udkast:** Både første mail og **svar på tilbagesvar** vises som udkast; du godkender eller redigerer og sender.

### 3.3 Komplet flow (hvad der skal bygges)

1. **Ét sted for mail (fx under Ejendomme eller dedikeret “Mail”-område):**
   - **“Klar til send”:** Liste over ejendomme med status Klar + udkast; du vælger, redigerer evt. emne/tekst, godkender → send (som i dag).
   - **“Indbakke / Svar”:** Liste over tråde der matcher jeres ejendomme (inbox). Klik på tråd → vis tråd (deres sidste mail + jeres tidligere). Knap “Generer svar-udkast” → AI laver udkast (reply-draft). Du redigerer og godkender → **send som svar i samme tråd** (Gmail: reply på threadId).
2. **Persistens af thread→property:** Ved send: gem `threadId → propertyId` i DB (Supabase) eller anden persistence. Ved indlæsning af inbox: hent mapping fra DB. Så matcher tilbagesvar altid til rigtig ejendom.
3. **Send svar i tråd:** Gmail API understøtter at sende som reply (same thread) ved at sætte `References` / `In-Reply-To` og threadId. Udvid `sendEmail` / queue så “reply” bruger tråd-id og korrekt headers.

### 3.4 AI “lytter” og tager action

- **Idé:** Før AI laver svar-udkast: klassificer modtagerens mail (én sætning): f.eks. “positiv_interest” | “afvisning” | “spørgsmål” | “ønsker_møde” | “uklar”.
- **Implementering:** Et lille LLM-kald (eller regex/keywords) på `theirReply` → `category`. Baseret på category:
  - **afvisning:** Udkast til kort afslutning (“Tak for svar, vi ringer ikke igen”) + evt. opdater ejendom status til “Lukket”.
  - **positiv_interest / ønsker_møde:** Udkast til næste skridt (tilbud, møde, opfølgning).
  - **spørgsmål:** AI svarer på spørgsmål i jeres tone (som nu).
- **Data / tone:** Træn udkast på jeres data ved at bruge `TONE_OF_VOICE` + `EXAMPLE_EMAILS` (evt. udvid med eksempler på “svar på afvisning” / “svar på interesse”). Ingen separat model-træning nødvendigt – prompt + few-shot er nok til at starte.

---

## 4. 2000 ejendomme på 2 uger – krav og tal

- **Tal:** 2000 ejendomme, 14 dage ⇒ ca. **143 første mails per dag** (uden opfølgning). Med opfølgning og svar antager vi samme orden (100–200 mails/dag i gennemsnit).
- **Gmail:**  
  - Almindelig Gmail: typisk 500 mails/dag.  
  - **Google Workspace:** op til 2000/dag (afhænger af konto).  
  **Anbefaling:** Brug Workspace til afsenderkonto, så I har plads til 2000 + opfølgning.
- **Appen:**  
  - Køen understøtter allerede rate limit (fx 200/time). Sæt evt. `EMAIL_RATE_LIMIT_PER_HOUR` så I ikke overskrider Gmail.  
  - Inbox-polling: for at “se tilbagesvar hurtigt” kan I enten lade brugeren trykke “Opdater indbakke” eller køre en cron (fx hver 5.–10. min) der henter nye mails og gemmer thread→property. **Push (webhook) fra Gmail** kræver Pub/Sub og er mere opsætning; polling er simplere til start.
- **Din arbejdsbyrde:** Hvis AI laver udkast til første mail og svar, og du **kun** godkender eller laver små redigeringer, kan volume nås. Hvis du skriver hver mail selv, bliver 2000/2 uger meget tungt.

---

## 5. Faser – forslag

| Fase | Indhold | Prioritet |
|------|--------|-----------|
| **A** | **Kort under Ejendomme:** Geocode API (DAWA) + cache; integrer PropertiesMap; toggle Liste/Kort; popup med status og link til rediger. | Høj |
| **B** | **Rediger ejendom:** PATCH properties API + modal i UI (kontaktperson, mail, telefon). | Høj |
| **C** | **Thread→property persistence:** Gem mapping i Supabase (eller anden DB) ved send; læs ved inbox. | Høj |
| **D** | **Inbox/svar-UI:** Side eller sektion “Indbakke / Svar”: list tråde, klik → vis tråd + “Generer svar-udkast” → vis udkast → rediger → “Send svar” (reply i tråd). | Høj |
| **E** | **Send som reply:** Udvid email-sender så reply bruger Gmail threadId og In-Reply-To/References. | Høj |
| **F** | **AI klassificering af svar:** Kategoriser tilbagemelding (positiv/afvisning/spørgsmål) og vælg skabelon/udkast derefter. | Medium |
| **G** | **Opfølgning og “næste skridt”:** Automatisk forslag til opfølgning (fx “send opfølgning efter 3 dage” for ejendomme uden svar). | Medium |

---

## 6. Sammenfatning

- **Muligt:** Ja. Kort, redigering og fuld mail-flow i appen er muligt med jeres nuværende stack. 2000 på 2 uger kræver Workspace og at I primært godkender AI-udkast.
- **Hvad der skal til:**  
  1) Geocoding + kort under Ejendomme,  
  2) Redigering af ejendom (mail m.m.),  
  3) Persistens af thread→ejendom,  
  4) Samlet inbox/svar-UI med “generer svar → godkend/rediger → send som svar”,  
  5) Gmail send-as-reply,  
  6) (Valgfrit) AI-klassificering af tilbagesvar og handlingsregler.  
- **Anbefaling:** Start med A–E så kort, redigering og det fulde svar-flow kører; tilføj derefter F–G for “lyt og action” og høj volume.
