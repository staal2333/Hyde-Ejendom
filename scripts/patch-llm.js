const fs = require('fs');
const file = 'src/lib/llm.ts';
let content = fs.readFileSync(file, 'utf8');

// Replace the body setup of generateEmailDraft - from "const client" to just before "const response"
const oldPattern = /const client = getClient\(\);\s+const prompt = buildEmailPrompt\(property, contact, analysis\);\s+const response/;

const newBlock = `const client = getClient();

  // Load live settings from DB (cached 60s) - falls back to config defaults
  const aiSettings = await getAISettings();
  const tone = aiSettings.toneOfVoice || config.toneOfVoice;
  const examples = aiSettings.exampleEmails || config.exampleEmails;
  const senderName = aiSettings.senderName || "Mads";

  const prompt = buildEmailPrompt(property, contact, analysis);

  const response`;

if (!oldPattern.test(content)) {
  console.error('Pattern not found!');
  process.exit(1);
}

content = content.replace(oldPattern, newBlock);

// Now replace the system prompt content - find it by searching for a unique substring
const sysStart = content.indexOf("content: `Du er en dansk copywriter der skriver outreach-mails til ejendomsejere og administratorer om outdoor reklame-muligheder.");
const sysEnd = content.indexOf("Du svarer ALTID i valid JSON med felterne: subject, body_text, short_internal_note.`", sysStart) + "Du svarer ALTID i valid JSON med felterne: subject, body_text, short_internal_note.`".length;

if (sysStart === -1 || sysEnd === -1) {
  console.error('System prompt not found!', sysStart, sysEnd);
  process.exit(1);
}

const newSystemContent = `content: \`Du er en dansk copywriter der skriver outreach-mails til ejendomsejere og administratorer om outdoor reklame-muligheder pa vegne af \${senderName} fra Hyde Media.

TONE OF VOICE:
\${tone}

EKSEMPLER PA GODE MAILS (imiter denne stil praecist):
\${examples}

REGLER:
- Max 150 ord i brodteksten
- Start ALDRIG med "Jeg haber denne mail finder dig vel" eller lignende
- Start med noget SPECIFIKT om ejendommen der viser vi har gjort research
- Naevn konkrete fordele (trafiktal, facade-storrelse, beliggenhed)
- Afslut med et lavt-forpligtende spoergsmaal som CTA
- Brug modtagerens navn og rolle naturligt
- Skriv som et menneske, ikke en robot
- Underskriv ALTID: Mvh\\n\${senderName}

Du svarer ALTID i valid JSON med felterne: subject, body_text, short_internal_note.\``;

content = content.substring(0, sysStart) + newSystemContent + content.substring(sysEnd);

fs.writeFileSync(file, content, 'utf8');
console.log('Done - llm.ts patched successfully');
