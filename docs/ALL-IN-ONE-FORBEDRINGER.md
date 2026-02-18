# Ejendom AI → All-in-One Løsning for Firmaet

Kort over **hvad I har** og **hvad der gør det til en virkelig all-in-one løsning** for jeres firma.

---

## Hvad I har i dag

| Område | Funktionalitet |
|--------|----------------|
| **Pipeline** | Discovery (vej-scan), Gade-Agent, Stilladser, Staging, Ejendomme, Research (AI-agent) |
| **Outreach** | OOH Proposals (mockups, PDF), Email Kø (Gmail, udkast, send) |
| **Data** | HubSpot (companies, contacts, status), CVR, BBR/DAWA, web-scraping |
| **Kontrol** | Research → "Push til pipeline" kun efter god info; Indstillinger (autonomi, auto-research regler, systemstatus) |

---

## Forbedringer til all-in-one

### 1. Sikkerhed & adgang (vigtigt for firma-brug)

- **Login / adgangskontrol**  
  I dag er der ingen auth – alle med link kan se alt. For firma-brug: tilføj login (f.eks. **Vercel Auth** eller **Clerk** med Google/email), så kun jeres team har adgang.

- **Roller**  
  Evt. "Admin" (kan ændre indstillinger, se alt), "Sælger" (kan research, outreach, ikke slette/ændre regler), "Læse" (kun overblik). Kan starte med én brugerrolle og udvide senere.

- **Audit log**  
  Log "hvem har sendt mail til X", "hvem har godkendt staging for Y", så I har sporbarhed.

---

### 2. Onboarding & dokumentation

- **Første gangs guide**  
  Kort wizard eller tooltip-række: "1. Opsæt HubSpot → 2. Kør Discovery → 3. Research → 4. Push til pipeline → 5. Send mail". Gør det nemt for nye kollegaer at komme i gang.

- **Indstillinger forklaret**  
  I Indstillinger: korte forklaringer ved Autonomi-niveau og Auto-Research regler (hvad sker der pr. niveau, hvornår kører cron).

- **README opdateret**  
  Opdater README med: Vercel deploy, alle faner (Discovery, Stilladser, Staging, Research, Push til pipeline, OOH, Email), og link til denne forbedringsliste.

---

### 3. Reporting & analytics (beslutninger på data)

- **Dashboard udvidet**  
  - Funnel: Discovery → Staging → Research → Klar → Sendt (med tal pr. trin).  
  - Graf over "Sendt pr. uge" / "Research færdig pr. uge".  
  - Top byer/veje (hvor kommer leads fra).

- **Export**  
  Export af "Klar til udsendelse" eller "Sendt" som CSV/Excel (adresse, ejer, kontakt, status, dato) til rapporter og planlægning.

- **OOH + Email i ét overblik**  
  Samlet statistik: emails sendt, åbnet, klikket, OOH-proposals sendt, møder – så ledelsen ser hele pipeline i ét dashboard.

---

### 4. Integrationer & data

- **HubSpot som single source of truth**  
  I er allerede tæt. Overvej: synk "Research færdig"-dato og "Push til pipeline"-dato til HubSpot (custom properties), så jeres sælgere også kan arbejde direkte i HubSpot med samme status.

- **Flere datakilder (valgfrit)**  
  README nævner OIS, Tingbogen. Kan prioriteres når I har behov for dybere ejer-/pant-data.

- **Backup / genoprettelse**  
  Simpel dokumentation: "Hvad gør vi hvis HubSpot eller appen er nede?" (f.eks. export af kritiske lister på forhånd).

---

### 5. Automatisering (skru gradvist op)

- **Autonomi-niveau funktionelt**  
  I dag er niveau 0–3 vist i UI, men virker muligvis ikke overalt. Gør det så:  
  - Niveau 0: Kun forslag (som nu).  
  - Niveau 1: Auto-research når regler matcher (cron).  
  - Niveau 2/3: Første mail / opfølgning automatisk, når I er klar til det.

- **Auto-research regler slået til**  
  Gør reglerne i Indstillinger klikbare (aktiv/inaktiv) og gem valg (localStorage eller simpel DB), så cron-jobbet faktisk respekterer dem.

- **Notifikationer**  
  Valgfrit: "10 nye ejendomme klar til review" eller "Research færdig for 5 ejendomme" (email eller Slack), så I ikke skal kigge konstant.

---

### 6. UX & stabilitet

- **Fejlhåndtering**  
  Tydelige fejlbeskeder ved API-fejl (HubSpot, OpenAI, CVR) med "Prøv igen" eller "Kontakt support", især på Research og Send mail.

- **Mobil/tablet**  
  Hvis I bruger tablets ude: sikre at vigtigste flows (Research status, Push til pipeline, Send mail) fungerer godt på mindre skærme.

- **Sprog og tone**  
  Én gennemgående tone (dansk, professionel) i alle labels og beskeder – allerede tæt på.

---

### 7. Lovgivning & compliance

- **Persondata (GDPR)**  
  Kontakter og emails er persondata. Overvej: kort note i app eller docs om at "Kontakter hentes til B2B outreach; gemmes i HubSpot; slet anmodninger håndteres via HubSpot".

- **Logning**  
  Undgå at logge personlige data i klartekst (f.eks. email-adresser i server-logs). Brug kun IDs eller hashes hvor muligt.

---

## Prioritering (forslag)

| Prioritet | Tema | Hvorfor |
|-----------|------|--------|
| **P0** | Login / adgangskontrol | Nødvendigt for at dele link sikkert i firmaet |
| **P1** | Dashboard funnel + "Sendt pr. uge" | Beslutninger på data |
| **P2** | Autonomi + auto-research faktisk aktiv | Mere automation uden at miste kontrol |
| **P2** | Export CSV for Klar/Sendt | Rapporter til ledelse og planlægning |
| **P3** | Onboarding-guide, notifikationer, roller | Bedre adoption og sporbarhed |

---

## Næste skridt

1. **Vælg 1–2 P0/P1-punkter** og implementer dem (f.eks. auth + funnel).
2. **Opdater README** med aktuel funktionalitet og link til denne fil.
3. **Gentag** med P2/P3 når I har behov.

Hvis I vil, kan vi tage ét konkret punkt (f.eks. "Login med Vercel Auth" eller "Funnel på Dashboard") og skitsere implementationen trin for trin.
