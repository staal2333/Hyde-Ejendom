# Midlertidig dev-build på Vercel (kun til fejlsøgning)

**Hvad det er:** Et deploy hvor appen bygges i "development"-tilstand, så React viser fulde fejlbeskeder i stedet for "Minified React error #310". Bruges kun for at finde den præcise årsag til en crash – ikke til daglig brug (langsommere og mindre stabilt).

**Sådan sætter du det op (midlertidigt):**
1. Vercel → dit projekt → **Settings** → **Environment Variables**
2. Tilføj: `NODE_ENV` = `development` (Environment: Production)
3. **Redeploy** projektet
4. Reproducér fejlen og åbn browserkonsollen – der vises nu den fulde fejltekst
5. Når du er færdig med fejlsøgning: **slet** variablen eller sæt den til `production` og redeploy

**Bemærk:** I bruger kun appen med 3 personer og behøver at data bliver gemt. Det sker uanset deploy-type (Supabase/HubSpot gemmer data). Hvis Vercel fortsat crasher, kan I køre appen lokalt eller på en lille server med `npm run build` + `npm run start` – data gemmes stadig i jeres backend.
