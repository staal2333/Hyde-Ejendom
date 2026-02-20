# Meta Ad Library API – opsætning

Meta Ad Library bruges i **Lead Sourcing** til at finde annoncører (virksomheder) der kører annoncer – fx efter søgeord eller land. I bruger det til at hente `page_name` og matche mod CVR.

---

## Trin 1: Opret en Meta-app

1. Gå til **[developers.facebook.com](https://developers.facebook.com)** og log ind med din Facebook-konto.
2. Klik **My Apps** → **Create App**.
3. Vælg **Other** (eller **Business** hvis du bruger Business Manager).
4. Vælg **Business** som type og giv appen et navn (fx "Ejendom AI Lead Discovery").
5. Vælg en **App contact email** og opret appen.

---

## Trin 2: Tilføj Ad Library API

1. I din app: gå til **App Dashboard** → **Add Products** (eller **Use cases**).
2. Find **Marketing API** eller **Ad Library API** og klik **Set up**.
3. Hvis du ser **Ad Library API** som separat produkt, tilføj det. Ellers er det ofte under **Marketing API** med tilladelsen **ads_read** / **ads_archive**.

Meta’s dokumentation:  
[https://developers.facebook.com/docs/graph-api/reference/ads_archive](https://developers.facebook.com/docs/graph-api/reference/ads_archive)

---

## Trin 3: Få en access token

**Vigtigt:** Ad Library (`ads_archive`) kræver ofte en **User Access Token**. Hvis du får "An unknown error" (kode 1) med App token, brug User token nedenfor.

**Mulighed A – User token (anbefalet til Ad Library)**  
1. Gå til **[Graph API Explorer](https://developers.facebook.com/tools/explorer)**.
2. Vælg **din app** i dropdown øverst til højre.
3. Klik **Generate Access Token**.
4. Tilføj permission **ads_read** (søg i listen, sæt flueben). Godkend.
5. Kopiér den viste **Access Token** (lang streng).
6. I `.env.local`: `META_AD_LIBRARY_ACCESS_TOKEN=den_kopierede_token` (kun token, ingen `|`).
7. User tokens udløber (1–2 timer eller op til ~60 dage). Ved fejl 190 generer en ny i Explorer.

**Mulighed B – App token**  
1. I appen: **Settings** → **Basic**. Token = `APP_ID|APP_SECRET`.
2. Hvis du får kode 1 / "unknown error", brug User token (Mulighed A) i stedet.

---

## Trin 4: Sæt variabler i .env

Åbn `.env.local` (eller din `.env`) og tilføj:

```env
# Meta Ad Library (Lead Sourcing – "Kør lead discovery")
META_AD_LIBRARY_ACCESS_TOKEN=din_token_her
# Valgfrit – standard er v21.0
# META_GRAPH_API_VERSION=v21.0
```

- Hvis du bruger **App token**: indsæt `APP_ID|APP_SECRET` som `META_AD_LIBRARY_ACCESS_TOKEN`.
- Hvis du bruger **User token**: indsæt den genererede token. Den udløber; til produktion er App token bedre.

Gem filen og genstart dev-serveren (`npm run dev`).

---

## Trin 5: Tjek at det virker

1. Åbn appen → **Lead Sourcing**.
2. Skriv et søgeord (fx et branchenavn eller emne).
3. Klik **Kør lead discovery** med kilde **Meta**.
4. Hvis token og app er korrekte, får du en liste over annoncører (page names). Hvis ikke, tjek at:
   - `META_AD_LIBRARY_ACCESS_TOKEN` er sat i `.env.local`.
   - Appen har Ad Library / Marketing API med relevante permissions.
   - Du bruger en gyldig token (App token udløber ikke; User token gør).

---

## Fejlsøgning

| Fejl | Løsning |
|------|--------|
| "META_AD_LIBRARY_ACCESS_TOKEN is not set" | Variablen mangler i `.env.local` – tilføj og genstart server. |
| **190 / Session has expired / OAuthException** | **User-tokenet er udløbet.** Gå til [Graph API Explorer](https://developers.facebook.com/tools/explorer), vælg din app, klik **Generate Access Token**, tilføj permission **ads_read**, godkend, og kopiér den nye token. Opdater `META_AD_LIBRARY_ACCESS_TOKEN` i `.env.local` og genstart. (User tokens holder 1–2 timer eller op til ~60 dage; App token `APP_ID\|APP_SECRET` udløber ikke.) |
| 190 / Invalid OAuth / Malformed | Token skal være `APP_ID\|APP_SECRET` på én linje. Brug App ID og App Secret fra Settings → Basic. |
| 190 / Invalid application ID | Tjek at du bruger **App ID** fra Basic (ikke Page ID eller andet). |
| **500 / Code 1 – "An unknown error has occurred"** | Generel Meta-fejl. Tjek: 1) Under **Brugssituationer** at du har tilføjet **Marketing API** (Create & manage ads). 2) Nogle gange kræver **Ad Library** særskilt godkendelse – søg under "Add products" efter "Ad Library" eller "Ads transparency". 3) Prøv igen senere (kan være midlertidig hos Meta). 4) I Development mode er adgang til ads_archive nogle gange begrænset. |
| 403 / Permission | Appen har ikke Ad Library/Marketing API eller mangler permissions – tjek produkter og tilladelser. |
| 4 / Rate limit | Færre kald eller vent lidt før næste kørsel. |

---

## Produktion og app review

- I **Development mode** kan du bruge API’en med din egen bruger og med begrænsninger.
- For at andre brugere eller produktion skal kunne bruge det fuldt ud, skal appen ofte gennem **App Review** hos Meta. Tjek Meta for Developers for aktuelle krav til Ad Library / Marketing API.

Når Meta er sat op, kan du bruge de andre API’er (fx HubSpot, Gmail) på samme måde – vi kan tage dem én ad gangen i andre guides.
