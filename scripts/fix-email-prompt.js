const fs = require('fs');
const file = 'src/lib/llm.ts';
let content = fs.readFileSync(file, 'utf8');

// Find the function start
const funcStart = content.indexOf('function buildEmailPrompt(');

// Find what follows the function (the OOH pitch generator comment)
const afterFunc = content.indexOf('// ─── OOH Pitch Generator');

// Replace everything between funcStart and afterFunc with the fixed version
const newFunc = [
  'function buildEmailPrompt(',
  '  property: Property,',
  '  contact: Contact,',
  '  analysis: ResearchAnalysis',
  '): string {',
  '  const lines = [',
  '    "## Kontekst",',
  '    "Vi vil gerne kontakte en person angaende muligheder for outdoor reklame paa en ejendom.",',
  '    "",',
  '    "## Ejendom",',
  '    `- Adresse: ${property.address}, ${property.postalCode} ${property.city}`,',
  '    `- Konkret pitch-vinkel (INSPIRER mailen – naevn IKKE direkte): ${analysis.oohPitchArgument || ""}`,',
  '    `- Noegleindsigter: ${analysis.keyInsights}`,',
  '    "",',
  '    "## Kontaktperson",',
  '    `- Navn: ${contact.fullName || "Ukendt"}`,',
  '    `- Rolle: ${contact.role || "Ukendt"}`,',
  '    `- Virksomhed: ${analysis.ownerCompanyName}`,',
  '    "",',
  '    "## Opgave",',
  '    "Skriv en kort, personlig outreach-mail i vores tone of voice.",',
  '    "Start med noget SPECIFIKT og KONKRET om ejendommen (facade, beliggenhed, trafik, synlighed).",',
  '    "",',
  '    "DU MAA ALDRIG NAEVNE:",',
  '    "- outdoor score, score, OOH score, potentiale-score eller nogen intern vurdering",',
  '    "- Tal som 8/10 eller scorede hojt – det er interne metrikker der IKKE maer relevante for modtageren",',
  '    "",',
  '    "Svar i JSON:",',
  '    "{",',
  '    \'  "subject": "Konkret emnelinje – ingen buzzwords",\',',
  '    \'  "body_text": "Brodtekst med \\\\n for linjeskift. Max 150 ord.",\',',
  '    \'  "short_internal_note": "Kort intern note"\',',
  '    "}"',
  '  ];',
  '  return lines.join("\\n");',
  '}',
  '',
  '',
].join('\n');

const newContent = content.substring(0, funcStart) + newFunc + content.substring(afterFunc);
fs.writeFileSync(file, newContent, 'utf8');
console.log('Done. Verifying...');

// Verify no syntax issues in the function
const verify = newContent.substring(funcStart, funcStart + newFunc.length);
const backtickCount = (verify.match(/`/g) || []).length;
console.log('Backtick count in function:', backtickCount, '(should be even)');
