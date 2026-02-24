// ============================================================
// Environment configuration – all secrets loaded from env vars
// ============================================================

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export const config = {
  // HubSpot
  hubspot: {
    accessToken: () => requireEnv("HUBSPOT_ACCESS_TOKEN"),
  },

  // OpenAI
  openai: {
    apiKey: () => requireEnv("OPENAI_API_KEY"),
    model: optionalEnv("OPENAI_MODEL", "gpt-4o-mini"),
  },

  // CVR API (Danish business registry)
  cvr: {
    apiUrl: optionalEnv("CVR_API_URL", "https://cvrapi.dk/api"),
    userAgent: optionalEnv("CVR_USER_AGENT", "EjendomAI/1.0"),
  },

  // BBR / DAWA (Danish address/building data)
  // Uses dawa.aws.dk as primary (more reliable DNS resolution)
  dawa: {
    apiUrl: optionalEnv("DAWA_API_URL", "https://dawa.aws.dk"),
  },

  // Internal cron secret (protect the /api/run-research endpoint)
  cronSecret: () => {
    const val = optionalEnv("CRON_SECRET", "");
    if (!val && process.env.NODE_ENV === "production") {
      throw new Error("CRON_SECRET must be set in production");
    }
    return val;
  },

  // Tone of voice for email generation
  toneOfVoice: optionalEnv(
    "TONE_OF_VOICE",
    `Professionel men personlig. Vi henvender os som en dansk virksomhed der hjælper med 
udendørs områder / outdoor spaces. Vi er uformelle men respektfulde. 
Korte sætninger, konkret værdi, ingen buzzwords.`
  ),

  // Research safe mode: when true, research runs but does NOT update HubSpot.
  researchSafeMode: optionalEnv("RESEARCH_SAFE_MODE", "false") === "true",

  // Gmail API (OAuth2) – for sending outreach emails
  gmail: {
    clientId: () => optionalEnv("GMAIL_CLIENT_ID", ""),
    clientSecret: () => optionalEnv("GMAIL_CLIENT_SECRET", ""),
    refreshToken: () => optionalEnv("GMAIL_REFRESH_TOKEN", ""),
    fromEmail: optionalEnv("GMAIL_FROM_EMAIL", "mads.ejendomme@hydemedia.dk"),
    fromName: optionalEnv("GMAIL_FROM_NAME", "Mads – Hyde Media"),
  },

  // Email rate limiting
  emailRateLimitPerHour: (() => {
    const val = parseInt(optionalEnv("EMAIL_RATE_LIMIT_PER_HOUR", "200"), 10);
    if (Number.isNaN(val) || val <= 0) return 200;
    return val;
  })(),

  // Scaffold cron settings
  scaffoldCron: {
    cities: optionalEnv("CRON_SCAFFOLD_CITIES", "København,Aarhus").split(",").map(s => s.trim()),
    minScore: (() => {
      const v = parseInt(optionalEnv("CRON_SCAFFOLD_MIN_SCORE", "7"), 10);
      return Number.isNaN(v) ? 7 : v;
    })(),
    autoResearch: optionalEnv("CRON_SCAFFOLD_AUTO_RESEARCH", "true") === "true",
  },

  // Meta Ad Library (for AI lead discovery – optional)
  metaAdLibrary: {
    accessToken: () => optionalEnv("META_AD_LIBRARY_ACCESS_TOKEN", ""),
    apiVersion: optionalEnv("META_GRAPH_API_VERSION", "v22.0"),
  },

  // Example emails for few-shot prompting
  exampleEmails: optionalEnv(
    "EXAMPLE_EMAILS",
    `Eksempel 1:
Emne: Udendørsarealerne på [adresse] – et uudnyttet potentiale?

Hej [navn],

Jeg skriver fordi jeg har kigget på [adresse] og kan se at de udendørs arealer 
har et spændende potentiale som I måske ikke udnytter fuldt ud i dag.

Vi har hjulpet lignende ejendomme med at skabe attraktive uderum der øger 
lejertilfredsheden og ejendommens værdi.

Ville det give mening med en kort snak om mulighederne?

Venlig hilsen,
[afsender]`
  ),
} as const;
