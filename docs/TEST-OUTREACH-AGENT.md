# Test: Outreach-agent (indbakke, opfølgning, klassifikation)

## 1. Miljøvariabler (.env.local)

| Variabel | Påkrævet til | Note |
|----------|----------------|------|
| `HUBSPOT_ACCESS_TOKEN` | Alt | Pipeline + ejendomsstatus |
| `OPENAI_API_KEY` | AI-svar-udkast + klassifikation | Reply-draft bruger GPT |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` | Indbakke + send svar | OAuth fra Google Cloud + OAuth Playground |
| `GMAIL_FROM_EMAIL`, `GMAIL_FROM_NAME` | Afsender ved send |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Tråd→ejendom + opfølgning | Uden Supabase: indbakke viser ikke ejendom-ID, opfølgning bliver tom |

**Hurtig check:** Kør appen, gå til Outreach. Hvis Gmail-boksen er grøn og viser en e-mail, er Gmail sat op. Hvis den er rød/amber, tjek de fire Gmail-variabler.

---

## 2. Supabase (til indbakke + opfølgning)

1. Opret projekt på [supabase.com](https://supabase.com) (eller brug eksisterende).
2. I **SQL Editor** kør scriptet fra `docs/supabase-mail-thread-property.sql`:

```sql
create table if not exists mail_thread_property (
  thread_id text primary key,
  property_id text not null,
  created_at timestamptz default now()
);
create index if not exists idx_mail_thread_property_property_id on mail_thread_property(property_id);
```

3. Sæt i `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL=https://<projekt>.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY=<service role key>` (Settings → API)

Uden denne tabel og env: indbakke virker stadig, men tråde får ikke kobling til ejendom, og "Opfølgning" bliver tom.

---

## 3. HubSpot (outreach_status)

- Ejendomme-objektet skal have den brugerdefinerede egenskab `outreach_status` med værdier som `FOERSTE_MAIL_SENDT`, `LUKKET_TABT`, `SVAR_MODTAGET`.
- Har I kørt **Setup → Opret properties** (eller tilsvarende) tidligere, er det ofte allerede oprettet. Ellers: kald `POST /api/setup/create-properties` (eller brug jeres eksisterende opsætning).

---

## 4. Testflow

1. **Start appen:** `npm run dev` (eller `pnpm dev`).
2. **Outreach-fanen:**  
   - Tjek at Gmail-boksen er grøn.  
   - "Opdater indbakke" – der skal komme tråde (hvis I har sendt mails fra appen før; ellers send én testmail fra "Klar til godkendelse").
3. **Indbakke:**  
   - Klik "Åbn og svar" på en tråd med ejendom.  
   - Klik "Generer svar-udkast (AI)" – herefter vises **Klassifikation** (Afvisning / Interesse / m.m.) og knapperne **Luk ejendom** / **Markér som interesseret**.
4. **Status-opdatering:**  
   - Klik fx "Luk ejendom" – ejendommens `outreach_status` i HubSpot skal blive `LUKKET_TABT`. Tjek i HubSpot eller ved at genindlæse Ejendomme.
5. **Opfølgning:**  
   - Blokken "Opfølgning" viser antal ejendomme, hvor første mail er sendt for 7+ dage siden og status stadig er FOERSTE_MAIL_SENDT.  
   - For at se tal > 0: enten vent 7 dage efter en sendt mail, eller kald API’et med færre dage, fx `GET /api/mail/follow-up-candidates?days=1` (så kræves det at der findes en tråd med `created_at` før i går – typisk ved at man har sendt mails tidligere og har rækker i `mail_thread_property`).
6. **Polling:**  
   - Lad Outreach-fanen stå åben i 5 min – indbakken opdateres automatisk uden at du klikker "Opdater indbakke".

---

## Fejlsøgning

- **Ingen tråde i indbakke:** Send mindst én mail fra appen (Klar til godkendelse → Send). Sørg for at modtageren (eller I selv) svarer, så tråden har modtager-svar. Opdater indbakke igen.
- **Tråde uden ejendom-ID:** Supabase-tabellen og env skal være sat; efter send gemmes `thread_id` + `property_id` i `mail_thread_property`. Hvis I ikke bruger Supabase, kan tråde stadig åbnes, men reply-panelet har brug for `propertyId` (sendes med i request) – det kommer fra listen, så uden kobling i DB kan det kun virke hvis fronten sender propertyId på anden vis (fx fra kontekst).
- **"Kunne ikke opdatere status":** Tjek at `outreach_status` i HubSpot har værdierne `LUKKET_TABT` og `SVAR_MODTAGET`. Opret dem via Setup → create-properties hvis de mangler.
- **Opfølgning viser 0:** Enten ingen ejendomme med status FOERSTE_MAIL_SENDT, eller ingen rækker i `mail_thread_property` med `created_at` ældre end 7 dage. Prøv `?days=1` for test med nyere data.
