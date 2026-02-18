# Plan: AI Lead Discovery – automatisk sourcing fra ad libraries m.m.

Formål: En **AI-agent** der selv finder nye leads ved at webscrape/query **Meta Ad Library** og andre kilder – uden at du manuelt skal uploade CVR-lister.

---

## 1. Vision

- Du vælger **kilde** (fx Meta Ad Library) og evt. **søgeord** / land.
- Systemet henter annoncører (virksomheder/sider der kører annoncer).
- AI/resolver matcher til **CVR** (virksomhedsnavn → CVR), beriger med **Proff** (egenkapital/resultat) og **deduper** mod HubSpot Contacts.
- Du får en liste over **nye leads** klar til at tilføje til HubSpot eller finde kontakter i.

---

## 2. Kilder (implementeret / planlagt)

| Kilde | Beskrivelse | Status |
|-------|-------------|--------|
| **Meta Ad Library** | Graph API `ads_archive` – søg annoncer efter søgeord + land (fx DK). Returnerer `page_name` / `page_id` som annoncør. Kræver Meta access token (App med Ad Library API godkendt). | Implementeret |
| **Web-søgning** | DuckDuckGo / søgemaskine efter fx "virksomheder der annoncerer Danmark" eller branche – udtræk virksomhedsnavne fra snippets. | Kan tilføjes som ekstra kilde |
| **Google Ads Transparency** | Søg annoncører efter nøgleord. Officiel API begrænset; tredjepart (SearchAPI, SerpApi) tilbyder betalt API. | Planlagt (valgfri) |
| **TikTok Ad Library** | Lignende koncept; API/scrape afhænger af tilgængelighed. | Planlagt (valgfri) |

---

## 3. Flow (AI Lead Discovery)

1. **Brugervalg:** Kilde = Meta (eller Web), søgeord = fx "reklame" / "marketing" / branche, land = DK.
2. **Hent rå data:** Meta: kald `ads_archive` med `search_terms`, `ad_reached_countries=['DK']`, `ad_type=ALL`; paginer og saml unikke `page_id` + `page_name`.
3. **Normaliser:** Drop sider der ligner privatpersoner (evt. filter på page_name længde/format). Output: liste af **virksomhedsnavne** (page_name).
4. **Resolve til CVR:** For hvert navn: CVR-lookup (by name). Behold kun træf med tilpas høj score.
5. **Berig:** Proff (egenkapital, resultat) og blocklist (HubSpot Contacts). Markér "Allerede i CRM".
6. **Præsentation:** Samme tabel som i Lead Sourcing – med mulighed for "Tilføj til HubSpot" og "Find kontakter".

---

## 4. Teknisk

- **Meta:** `GET https://graph.facebook.com/<version>/ads_archive?search_terms=...&ad_reached_countries=['DK']&ad_type=ALL&access_token=...&fields=id,page_id,page_name`
- **Token:** Opsæt Meta App → Ad Library API → access token. Gem som `META_AD_LIBRARY_ACCESS_TOKEN` i .env.
- **Rate limits:** Meta begrænser antal kald; paginer med `after`-cursor; begræns antal sider (fx 5–10) i første version.

---

## 5. Udvidelser senere

- Flere kilder (Google Ads Transparency, TikTok) ved tilføjelse af moduler under `lib/lead-sourcing/sources/`.
- Planlagt kørsel (cron: "Kør discovery hver uge med disse søgeord").
- AI-vurdering af relevans (fx "er denne annoncør relevant for vores salg?").
