const fs = require('fs');
const file = 'src/lib/llm.ts';
let content = fs.readFileSync(file, 'utf8');

const start = content.indexOf('function buildEmailPrompt(');
const funcEnd = content.indexOf('\n}', start + 500) + 2;

const oldFunc = content.substring(start, funcEnd);

const newFunc = `function buildEmailPrompt(
  property: Property,
  contact: Contact,
  analysis: ResearchAnalysis
): string {
  return \`## Kontekst
Vi vil gerne kontakte en person angaende muligheder for outdoor reklame paa en ejendom.

## Ejendom
- Adresse: \${property.address}, \${property.postalCode} \${property.city}
- OOH pitch-argument (intern note – bruges IKKE direkte i mailen, kun som inspiration): \${analysis.oohPitchArgument || ""}
- Noegleindsigter om ejendommen: \${analysis.keyInsights}

## Kontaktperson
- Navn: \${contact.fullName || "Ukendt"}
- Rolle: \${contact.role || "Ukendt"}
- Email: \${contact.email || "Ukendt"}
- Virksomhed: \${analysis.ownerCompanyName}

## Opgave
Skriv en kort, personlig outreach-mail. Brug vores tone of voice og eksempel-mails som reference.
Referer til noget SPECIFIKT og KONKRET om ejendommen (facade, beliggenhed, trafik, synlighed).

MAET DU ALDRIG NAEVNE:
- "outdoor score", "score", "OOH score", "potentiale-score" eller nogen form for intern vurdering
- Tal som "8/10" eller "scorede hojt" – det er interne metrikker
- "vi har vurderet" eller "vi har analyseret" – skriv direkte om ejendommen

Svar i JSON:
{
  "subject": "Konkret, nysgerrighedsvaeekkende emnelinje – ingen buzzwords",
  "body_text": "Brodtekst med \\n for linjeskift. Max 150 ord. Underskriv med Mvh og afsendernavn.",
  "short_internal_note": "Kort intern note om hvad tilgangen er baseret paa"
}\`;
}`;

const newContent = content.substring(0, start) + newFunc + content.substring(funcEnd);
fs.writeFileSync(file, newContent, 'utf8');
console.log('Done - buildEmailPrompt patched. Old length:', oldFunc.length, 'New length:', newFunc.length);
