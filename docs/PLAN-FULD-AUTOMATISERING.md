# Plan: Hvad vi har nu – og hvordan vi gør det hele automatisk og godt

---

## Del 1: Opsummering – hvad I har nu

### Ejendomme & pipeline
| Feature | Status | Beskrivelse |
|--------|--------|--------------|
| **Ejendomme fra HubSpot** | ✅ | Liste med status (NY_KRAEVER_RESEARCH → KLAR_TIL_UDSENDELSE → FOERSTE_MAIL_SENDT osv.) |
| **Kort (Leaflet)** | ✅ | Toggle Liste/Kort, geocoding (DAWA), popup med status + "Se detaljer" |
| **Redigering** | ✅ | PropertyEditModal + PATCH `/api/properties/[id]` (navn, kontakt, mail, telefon, outreach_status) |
| **Markér klar** | ✅ | Knap "Push til pipeline" → status KLAR_TIL_UDSENDELSE |
| **Dashboard / Home** | ✅ | Stats, pipeline-visning, hurtig adresse-tilføjelse |

### Outreach & mail
| Feature | Status | Beskrivelse |
|--------|--------|--------------|
| **Klar til godkendelse** | ✅ | Liste over ejendomme med email-udkast; vælg, rediger, send (enkelt eller batch) |
| **EmailComposeModal** | ✅ | Rediger til/emne/indhold, drag-and-drop PDF, gem TIL i HubSpot ved ændring |
| **Email-kø** | ✅ | Rate limit (fx 200/time), Gmail API, tråd→ejendom gemmes (Supabase `mail_thread_property`) |
| **Indbakke** | ✅ | Hent tråde med ejendom-ID; "Åbn og svar"; auto-opdatering hver 5 min når fanen er åben |
| **Svar på tilbagesvar** | ✅ | Reply-draft (AI), klassifikation (afvisning/interesse/spørgsmål/møde), knapper "Luk ejendom" / "Markér som interesseret" |
| **Opfølgning** | ✅ | Blok "Opfølgning" viser ejendomme hvor første mail er sendt 7+ dage siden (uden svar); manuel "Send opfølgning" via Ejendomme-fanen |

### Research & agenter
| Feature | Status | Beskrivelse |
|--------|--------|--------------|
| **Research (enkelt/batch)** | ✅ | run-research, auto-research, workflow engine, HubSpot-opdatering |
| **Gade-Agent / Street Agent** | ✅ | Kør på gader, research + email-udkast |
| **Staging / Full Circle** | ✅ | Staging-kø, godkend/afvis, push til HubSpot |
| **Cron run-research** | ✅ | `GET /api/run-research` med `CRON_SECRET` – kan køres af ekstern scheduler |

### Lead Sourcing
| Feature | Status | Beskrivelse |
|--------|--------|--------------|
| **Meta Ad Library** | ✅ | Hent annoncører (søgeord, land); CVR-match, Proff, dedupe; tilføj til HubSpot |
| **Manuel CVR** | ✅ | Indtast CVR, hent virksomheder |

### OOH (Out of Home)
| Feature | Status | Beskrivelse |
|--------|--------|--------------|
| **Frames, campaigns, sends** | ✅ | OOH-modul med follow-up, PDF, tracking |
| **Cron OOH follow-up** | ✅ | `/api/cron/ooh-followup` |
| **Cron scaffolding** | ✅ | `/api/cron/scaffolding` – daglig stillads-scan |

### Infrastruktur
| Område | Status |
|--------|--------|
| **Auth** | PinGate (PIN), AuthContext |
| **Supabase** | Tråd→ejendom, evt. OOH/staging |
| **Env** | HubSpot, OpenAI, Gmail, Supabase, CRON_SECRET, Meta (valgfrit) |

---

## Del 2: Hvad er manuelt i dag?

1. **Indbakke** – du skal åbne Outreach og evt. klikke "Opdater indbakke" (polling kører kun når fanen er åben).
2. **Opfølgning** – du ser antal "kan få opfølgning", men skal selv gå til Ejendomme, filtrere og sende opfølgning.
3. **Research / pipeline** – du starter research eller Gade-Agent manuelt (medmindre cron kalder run-research).
4. **Lead discovery** – du indtaster søgeord og klikker "Kør lead discovery".
5. **Godkendelse af mails** – du godkender/redigerer alle udkast (første mail + svar) og sender. Det er bevidst (sikkerhed/kvalitet).

---

## Del 3: Mål – "gøre det hele automatisk og godt"

### A. Fuld automation (uden at fjerne menneskelig kontrol hvor det giver mening)

| Prioritet | Handling | Beskrivelse |
|-----------|----------|-------------|
| **1** | **Cron: indbakke + opfølgning** | Et cron-job (fx Vercel Cron eller cron-job.org) kalder fx hver 10. min: (1) `GET /api/mail/inbox` for at opdatere tråd→ejendom-cache, (2) evt. et nyt endpoint der "forbereder" opfølgning (fx markerer ejendomme der skal have opfølgning). UI beholder polling når fanen er åben; cron sikrer at data er frisk når du åbner. |
| **2** | **Cron: opfølgning-udkast (valgfrit)** | Endpoint der for hver "follow-up candidate" (7+ dage, FOERSTE_MAIL_SENDT) genererer et AI-opfølgningsudkast og gemmer det på ejendommen (eller i en kø). Så kan du i UI bare godkende og sende i stedet for at starte fra nul. |
| **3** | **Scheduled research** | I har allerede `run-research` med CRON_SECRET. Sæt en cron der kører fx dagligt kl. 08 med `Authorization: Bearer <CRON_SECRET>`. Regler (hvilke ejendomme) kan styres via Settings eller env. |
| **4** | **Lead discovery (valgfrit)** | Cron der kører Meta lead discovery med faste søgeord/land og gemmer leads (uden at pushe til HubSpot uden godkendelse). UI viser "Nye leads fra cron" – du godkender og tilføjer. |

### B. "Gøre det hele godt" – kvalitet og UX

| Prioritet | Handling | Beskrivelse |
|-----------|----------|-------------|
| **1** | **Tone & eksempler** | Udvid `TONE_OF_VOICE` og `EXAMPLE_EMAILS` (evt. eksempler på "svar på afvisning", "svar på interesse") så AI-udkast er mere konsistente. Evt. få 5–10 rigtige mails (anonymiseret) ind som few-shot. |
| **2** | **Klassifikation skarphed** | Reply-draft klassificerer allerede (positiv/afvisning/spørgsmål/møde/uklar). Overvej: finjuster regex/prompt eller lav et lille LLM-kald udelukkende til kategorisering med 1–2 sætninger kontekst. |
| **3** | **Opfølgning i UI** | I stedet for kun "X ejendomme kan få opfølgning – gå til Ejendomme": knap "Generer opfølgning-udkast" der batch-kører AI for de kandidater og enten viser dem i en liste (godkend enkeltvis) eller gemmer på ejendommen som ny draft. |
| **4** | **Notifikationer (valgfrit)** | Ved nye svar i indbakke eller nye follow-up kandidater: email/slack til dig (fx via Vercel serverless der kalder et webhook). Kræver ekstra integration. |
| **5** | **Fejlhåndtering og logging** | Centraliser log ved "send fejlede", "research fejlede", "Meta token udløbet" så I kan se status (evt. en lille /api/status eller log-side). I har delvist status allerede. |
| **6** | **Rate limits og 2000/2 uger** | Dokumenter Gmail-limits (500/dag almindelig, 2000/dag Workspace). Sæt `EMAIL_RATE_LIMIT_PER_HOUR` så I ikke overskrider. Evt. queue-visning med "sendes i dag" estimat. |

### C. Teknisk stramning

| Prioritet | Handling | Beskrivelse |
|-----------|----------|-------------|
| **1** | **Vercel Cron** | Hvis I hoster på Vercel: definer `vercel.json` med cron-routes (inbox-sync, opfølgning-forberedelse, run-research) så I ikke afhænger af ekstern cron-job.org. |
| **2** | **Env i produktion** | Tjek at alle nødvendige env vars er sat i Vercel (Gmail, HubSpot, OpenAI, Supabase, CRON_SECRET). |
| **3** | **Supabase** | Bekræft at `mail_thread_property` er oprettet i produktion og at RLS/service role er korrekt. |

---

## Del 4: Anbefalet rækkefølge

**Fase 1 – Automatisering (1–2 dage)**  
1. Tilføj Vercel Cron (eller ekstern cron) der kalder:  
   - `GET /api/mail/inbox` (eller et lille "sync" endpoint der kun opdaterer cache) hver 10–15 min.  
   - `GET /api/run-research` med CRON_SECRET fx én gang dagligt.  
2. Dokumenter CRON_SECRET og URLs i Settings eller i `docs/`.

**Fase 2 – Opfølgning ordentligt (1 dag)**  
3. Nyt endpoint fx `POST /api/mail/prepare-follow-ups` (eller udvid follow-up-candidates): for hver kandidat (7+ dage), generer AI-opfølgningsudkast og gem som `email_draft_subject` / `email_draft_body` på ejendommen (eller returnér til UI).  
4. I Outreach: i Opfølgning-blokken, knap "Generer opfølgning-udkast for alle" → kald endpoint → vis "X udkast klar" med link til Ejendomme (filter FOERSTE_MAIL_SENDT) hvor de nu har opfølgningstekst klar. Alternativt: vis liste med "Send opfølgning" per ejendom der åbner EmailComposeModal med det udkast.

**Fase 3 – Kvalitet (løbende)**  
5. Saml 5–10 eksempler på jeres rigtige svar (afvisning, interesse, spørgsmål) og put dem i prompt eller EXAMPLE_EMAILS.  
6. Evt. enkelte notifikationer (email ved nye indbakke-svar) hvis I vil have det.

**Fase 4 – Valgfrit**  
7. Lead discovery cron med faste søgeord.  
8. Lille dashboard-side med "seneste fejl" og status for cron-kørsler.

---

## Del 5: Korte svar

| Spørgsmål | Svar |
|-----------|------|
| **Hvad har vi nu?** | Fuld pipeline: ejendomme, kort, redigering, mail (første + svar), indbakke, opfølgning-liste, klassifikation→handling, research, Gade-Agent, staging, lead sourcing, OOH, cron for research/scaffolding/OOH. |
| **Hvad er manuelt?** | Åbne indbakke, starte research, køre lead discovery, godkende alle mails, selv sende opfølgning. |
| **Hvad skal vi gøre for "automatisk"?** | Cron: (1) inbox-sync, (2) daglig run-research, (3) evt. forbered opfølgning-udkast. Derefter er det mest "godkend i UI" i stedet for at starte alt manuelt. |
| **Hvad skal vi gøre for "godt"?** | Bedre tone/eksempler til AI, skarpere klassifikation, opfølgning-udkast direkte i UI, evt. notifikationer og fejl-log. |
| **Hvad med 2000 ejendomme på 2 uger?** | Muligt hvis Gmail-limits tillader (Workspace anbefales). Cron + kø + godkendelse i UI; sæt rate limit så I ikke overskrider. |

---

---

## Implementeret (senest)

- **GET /api/cron/mail-sync** – Syncer tråd→ejendom fra Supabase (kald hver 10. min). Kræver `Authorization: Bearer <CRON_SECRET>` hvis CRON_SECRET er sat.
- **vercel.json** – Cron-schedule: mail-sync hver 10. min (`*/10 * * * *`), run-research hverdage kl. 08 (`0 8 * * 1-5`).
- **POST /api/mail/prepare-follow-ups** – Genererer AI-opfølgning-udkast for kandidater (7+ dage, FOERSTE_MAIL_SENDT), gemmer på ejendommen i HubSpot. Body: `{ days?: 7, limit?: 20 }`.
- **Outreach – Opfølgning:** Knap **Generer opfølgning-udkast** (vises når der er kandidater). Kører prepare-follow-ups og viser toast med antal genereret.

**Bemærk:** Vercel Cron sender ikke automatisk `Authorization: Bearer <CRON_SECRET>`. For at run-research og mail-sync skal køre fra Vercel Cron uden 401, brug enten (1) ekstern cron (fx cron-job.org) med header, eller (2) lad CRON_SECRET være tom i prod for disse routes (mindre sikkert). Alternativt kan routes tjekke for `x-vercel-cron` header og tillade kald uden Bearer når den er sat.

---

*Dokumentet kan opdateres løbende.*
