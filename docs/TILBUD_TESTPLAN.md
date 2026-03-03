# Tilbud Testplan (v1)

Denne plan dækker beregninger, API-flow og manuel PDF-verifikation.

## 1) Beregninger (funktionel test)

Kør disse cases via UI eller API og verificér totals:

1. **En linje uden rabat**
   - `weeks=2`, `quantity=1`, `listPrice=10000`, tillæg=0
   - Forventning: linjetotal = 20000

2. **En linje med rabat**
   - `weeks=4`, `quantity=1`, `listPrice=5000`, `discountPct=10`
   - Forventning: media = 20000, rabat = 2000, net = 18000

3. **Tillægsposter**
   - `production=1000`, `mounting=500`, `lights=250`, `quantity=2`
   - Forventning: tillæg = (1000+500+250)*2 = 3500

4. **Totals inkl. procentsatser**
   - Kontrollér:
     - subtotal = sum(linjetotaler)
     - informationsgodtgørelse = subtotal * pct
     - sikkerhedsstillelse = subtotal * pct
     - moms = (subtotal + tillægspct) * momsPct

## 2) API-test (smoke)

1. `POST /api/tilbud`
   - Opret tilbud med minimumsfelter (`clientName`, `offerDate`, `lines`)
   - Forventning: `success: true` og returneret `tilbud.id`

2. `GET /api/tilbud`
   - Forventning: oprettet tilbud findes i listen

3. `GET /api/tilbud/[id]`
   - Forventning: korrekt payload for valgt tilbud

4. `PATCH /api/tilbud/[id]`
   - Opdatér fx `status=final` eller `campaignName`
   - Forventning: ændringer persisted

5. `POST /api/tilbud/generate-pdf`
   - Input: `{ id: "<tilbud-id>" }`
   - Forventning: HTTP 200, `Content-Type: application/pdf`

## 3) Manuel PDF layout-verifikation

Verificér mindst disse scenarier:

1. **Standardtilbud (1-3 linjer)**
   - Header, metadata, linjetabel og totals vises korrekt.

2. **Mange linjer (>= 30)**
   - Sidebrud fungerer uden overlap af footer/totals.

3. **Lange tekster**
   - Langt kundenavn/linjenavn bryder ikke layout.

4. **Korrekt filnavn**
   - Downloadet fil følger mønster `Tilbud-{kunde}-{tilbudNr}.pdf`.
