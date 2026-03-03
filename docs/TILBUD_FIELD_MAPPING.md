# Tilbud Field Mapping (Excel -> Ejendom AI)

Dette dokument mapper felter fra `Tilbudksskabbbbb222.xlsx` til den nye Tilbud-side.

## Kildeark i Excel

- `Ny Østergade - Tilbud - DA`
- `Ordrebekræftelse - DK`
- `Ny Østergade - offer - EN`
- `Orderconfirmation - EN`

## Overordnet model

Excel-skabelonen indeholder de samme kernefelter på dansk/engelsk:

- Tilbudsmetadata (dato, gyldig til, referencer)
- Kunde- og kampagneoplysninger
- Linjeposter (medie, periode, antal, liste/netto)
- Tillæg/summeringer (informationsgodtgørelse, sikkerhedsstillelse)
- Kommentarer og standardbetingelser

## Feltmapping

| Excel label | Tilbud-model felt | Bemærkning |
|---|---|---|
| `Dato:` / `Date:` | `offerDate` | ISO-dato i app |
| `Gyldig indtil:` / `Valid to:` | `validUntil` | ISO-dato i app |
| `Vores reference:` / `Our reference:` | `ourReference` | Fritekst |
| `Jeres reference:` / `Your reference:` | `yourReference` | Fritekst |
| `Kunde:` / `Client:` | `clientName` | Fritekst |
| `Mediebureau:` / `Media agency:` | `mediaAgency` | Fritekst |
| `Kampagne:` / `Campaign:` | `campaignName` | Fritekst |
| `Kommentarer til tilbuddet:` / `Comments:` | `comments` | Fritekst |
| `Navn` / `Name` | `lines[].name` | Linjenavn/lokation |
| `Uger` / `Weeks` | `lines[].weeks` | Antal uger |
| `Fra` / `From` | `lines[].fromDate` | Startdato |
| `Til` / `To` | `lines[].toDate` | Slutdato |
| `Antal` | `lines[].quantity` | Antal enheder |
| `Listepris` / `List price` | `lines[].listPrice` | Pris før rabat |
| `Rabat` / `Discount` | `lines[].discountPct` | Procent |
| `Nettopris` / `Netprice` | `lines[].netPrice` | Beregnet eller override |
| `Produktion` / `Production` | `lines[].production` | Valgfri tillægspost |
| `Montering` / `Mounting` | `lines[].mounting` | Valgfri tillægspost |
| `Lys` / `Lights` | `lines[].lights` | Valgfri tillægspost |
| `Informationsgodtgørelse 1,5%` | `infoCompensationPct` | Default 1.5 |
| `Sikkerhedsstillelse 1%` | `securityPct` | Default 1.0 |
| `Nettopris TOTAL` / `TOTAL` | `totals.*` | Beregnes i app |

## V1-beslutninger

- Vi bygger et moderne web-layout (ikke pixel-1:1 Excel).
- Vi bevarer samme forretningsfelter og summeringslogik.
- Dansk labels bruges i UI (kan udvides med EN senere).
