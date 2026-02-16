# Research Workflow – Precision Architecture (v2)

## Core Philosophy

> **"Unknown" is always better than "wrong"**

Every data point in the pipeline must have a traceable source. The LLM's role is to **analyze and rank existing data**, not to invent new contacts or emails. Hard validation gates prevent bad data from reaching HubSpot.

---

## Overview: The Complete Flow

```
Address Input
     │
     ▼
┌─────────────────────────────────┐
│  Step 0: OIS.dk Lookup          │ ← THE source of truth
│  → BFE number via DAWA          │
│  → Official owner names         │
│  → Official administrator names │
│  → Ejerforholdstekst/kode       │
│  → Kommune                      │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│  CLASSIFY OWNERSHIP TYPE        │ ← NEW: drives entire strategy
│  privatperson / selskab /       │
│  andelsbolig / ejerforening /   │
│  almennyttig / offentlig        │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│  Step 1: CVR Lookup (scored)    │ ← NEW: hard score threshold
│  → Strategy chosen by type      │
│  → Score ≥ 35 to accept match   │
│  → Kommune + address validation │
│  → Privatperson → SKIP CVR     │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│  Step 2: BBR Lookup             │
│  → Building data, area, floors  │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│  Step 3: Web Search + Scraping  │
│  → Type-specific queries        │
│  → Relevance filtering          │
│  → Email extraction             │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│  Step 4: SPLIT LLM Analysis     │ ← NEW: two separate prompts
│  Phase 1: Owner + quality       │   (temp 0.1, structured data only)
│  Phase 2: Contact ranking       │   (index-based, no hallucination)
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│  Step 5: POST-LLM VALIDATOR     │ ← NEW: the critical guard
│  → Emails MUST be in allowed    │
│  → Names checked against sources│
│  → Owner verified vs OIS/CVR    │
│  → Generic emails capped @ 0.3  │
│  → dataQuality enforced         │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│  Step 6: Email Hunt (if needed) │
│  → Only with verified domains   │
│  → MX record validation         │
│  → Pattern generation (æøå)     │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│  Step 7: QUALITY GATES          │ ← NEW: blocks bad data
│  → high + confidence ≥ 0.7      │
│    → KLAR_TIL_UDSENDELSE       │
│  → Otherwise                    │
│    → RESEARCH_DONE_CONTACT_     │
│      PENDING (manual review)    │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│  Step 8: HubSpot Update         │
│  → Safe mode: log only          │
│  → Normal: update + contacts    │
│  → Raw data stored for debug    │
└─────────────────────────────────┘
```

---

## Step-by-Step Detailed Breakdown

### Step 0: OIS.dk Lookup (`src/lib/research/ois.ts`)

The **primary and most authoritative** data source for Danish property ownership.

**Process:**
1. Parse address into `vejnavn` + `husnr`
2. DAWA API chain: `adresser` → `adgangsadresser/{id}` → `jordstykker/{ejerlav}/{matrikel}` → `bfenummer`
3. Fallback: web search for `site:ois.dk "{address}"`
4. OIS API: `GET /api/ejer/get?bfe={bfe}` → owners + administrators
5. OIS API: `GET /api/property/GetGeneralInfoFromBFE?bfe={bfe}` → ejerforholdstekst, ejerforholdskode, kommune

**Output:**
```typescript
interface OisResult {
  bfe: number;
  owners: { name: string; isPrimary: boolean }[];
  administrators: { name: string; isPrimary: boolean }[];
  ejerforholdstekst?: string;   // e.g. "Privatpersoner", "Aktieselskab"
  ejerforholdskode?: string;    // e.g. "10", "20", "41"
  kommune?: string;
}
```

---

### NEW: Ownership Classification (`src/lib/research/validator.ts`)

After OIS lookup, we **classify the ownership type** which determines the entire research strategy:

| Kode | Type | CVR Strategy | Description |
|------|------|-------------|-------------|
| 10 | `privatperson` | **SKIP CVR** | Don't match private persons to random companies |
| 20 | `selskab` | Search CVR with company name | A/S, ApS etc. |
| 30 | `selskab` | Search CVR with company name | Other company types |
| 40 | `ejerforening` | Search CVR, require address match | Forening/legat |
| 41 | `andelsbolig` | Search CVR, require address match | A/B-forening |
| 50 | `almennyttig` | Search CVR | Social housing company |
| 60-80 | `offentlig` | **SKIP CVR** | Government/municipality |

**Key principle:** If the property is owned by a private person (`kode 10`), we do NOT try to match them to a CVR company. This prevents the common error where "Peter Jensen" is matched to "Jensen Invest ApS".

---

### Step 1: CVR Lookup – Strict Scoring (`src/lib/research/cvr.ts`)

**NEW: Score-based matching instead of boolean validation.**

Every CVR result is scored 0-100:

| Factor | Points | Rule |
|--------|--------|------|
| Exact name match | +40 | After normalization |
| Substring name match | +30 | Core name ≥ 70% of longer |
| Word overlap | +0-25 | Based on overlap ratio |
| Same postal code | +15 | CVR address contains property postal code |
| Same street | +20 | CVR address contains property street |
| Same kommune | +15 | CVR address in same kommune |
| Property-related type | +10 | Company name contains "ejendom", "bolig", etc. |
| Different region | **-20** | Postal code first digit differs |

**Threshold: Score must be ≥ 35 to accept.** Below = discarded.

**Stricter name matching:**
- Before: "Krogh Ejendomme" could match "Krogh Invest" (85% char match)
- Now: Core names (stripped of suffixes) must match with ≥ 90% character accuracy, and substring matches require the shorter to be ≥ 70% of the longer

---

### Step 2: BBR Lookup (`src/lib/research/bbr.ts`)

Standard building data lookup via DAWA. No changes from v1.

---

### Step 3: Web Search + Scraping (`src/lib/research/index.ts`)

**Ownership-type-specific queries:**
- `andelsbolig` / `ejerforening` → searches for A/B, E/F, bestyrelse
- `selskab` → searches for company director, CVR, proff.dk
- `privatperson` → limited to address + owner name only
- `offentlig` → minimal search

---

### Step 4: Split LLM Analysis (`src/lib/llm.ts`)

**Phase 1: Owner + Quality Assessment**
- Input: ONLY OIS, CVR, BBR data (no web scraping, no emails)
- Temperature: **0.1** (deterministic)
- Output: `ownerCompanyName`, `dataQuality`, `outdoorPotentialScore`
- Cannot hallucinate contacts or emails (they're not in the prompt)

**Phase 2: Contact Ranking**
- Input: Indexed list of ALL known contacts from research
- Temperature: **0.1**
- LLM references contacts by **index number** only
- Cannot create new contacts, emails, or names
- Must justify each selection with `relevance_reason`

**System prompt (Phase 2):**
```
DU MÅ IKKE OPFINDE NYE EMAILS ELLER NAVNE.
DU MÅ KUN VÆLGE FRA DEN GIVNE LISTE VED INDEX-NUMMER.
Hvis ingen kontakt er god nok, returner en tom liste.
```

---

### Step 5: Post-LLM Validator (`src/lib/research/validator.ts`)

**The critical guard that prevents bad data from reaching HubSpot.**

Checks performed:

1. **Email validation**: Every email in the LLM output MUST exist in the `allowedEmails` set (collected from CVR, website scraping, search snippets). If not → **REMOVED** and confidence set to ≤ 0.15.

2. **Contact name validation**: Names are checked against `knownNames` (from OIS, CVR, website). Unknown names get confidence capped at 0.4.

3. **Owner verification**: `ownerCompanyName` must match either OIS or CVR data. Mismatch → set to "Ukendt", downgrade quality.

4. **Data quality enforcement**:
   - `"high"` requires: OIS ✓ + CVR ✓ + at least one verified email with confidence ≥ 0.6
   - No OIS data → automatic `"low"`

5. **Generic email cap**: `info@`, `kontakt@`, `mail@`, etc. → confidence max 0.3

6. **Empty contact removal**: Contacts without name AND email are removed.

---

### Step 6: Email Hunt (with MX validation)

**Only runs if no good email was found in the existing data.**

**NEW restrictions:**
- Only searches with **verified domains** (from CVR website or confirmed company site)
- Does NOT search with randomly discovered domains
- **MX record check**: Domain must have MX records to receive email. Without valid MX → confidence capped at 0.2
- Danish name patterns (æ→ae, ø→oe, å→aa) for pattern generation

---

### Step 7: Quality Gates

**These gates BLOCK properties from reaching KLAR_TIL_UDSENDELSE:**

| Condition | Result |
|-----------|--------|
| No contact with email | → RESEARCH_DONE_CONTACT_PENDING |
| dataQuality = "low" | → RESEARCH_DONE_CONTACT_PENDING |
| Best contact confidence < 70% AND quality ≠ "high" | → RESEARCH_DONE_CONTACT_PENDING |
| Contact is "indirect" AND confidence < 80% | → RESEARCH_DONE_CONTACT_PENDING |
| **All gates passed** | → **KLAR_TIL_UDSENDELSE** |

---

### Step 8: HubSpot Update

**Safe Mode (`RESEARCH_SAFE_MODE=true`):**
- Research runs the entire pipeline
- All results are logged and visible in UI
- NO HubSpot writes happen
- Raw research data is stored for inspection

**Normal Mode:**
- Ejendom updated with research results
- Valid contacts upserted to HubSpot
- Email draft generated and saved
- Follow-up task created

---

## Cross-Property Deduplication

**Per-batch tracking:** When processing multiple properties, if the same email appears in 3+ properties, it's automatically classified as `"indirect"` with max confidence 15%. This catches generic administrator emails.

---

## Raw Research Storage

Every research run stores the complete `ResearchData` in memory:
- All OIS, CVR, BBR responses
- All web search results and scraped content
- All validator corrections

Accessible via `GET /api/raw-research?propertyId={id}` for debugging.

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `RESEARCH_SAFE_MODE` | `false` | When `true`, research runs but doesn't write to HubSpot |
| `OPENAI_MODEL` | `gpt-4o-mini` | LLM model for analysis |
| `CVR_MATCH_THRESHOLD` | `35` | Minimum score to accept a CVR match (0-100) |

---

## Data Quality Rules Summary

| Condition | dataQuality | Can reach KLAR_TIL_UDSENDELSE? |
|-----------|-------------|-------------------------------|
| OIS ✓ + CVR ✓ + verified email (≥0.6) | `high` | Yes |
| OIS ✓ + CVR ✓ (no email) | `high` | No (needs contact) |
| OIS ✓ + no CVR | `medium` | Only if contact confidence ≥ 0.7 |
| No OIS | `low` | No – always manual review |
| LLM hallucinated email (not in sources) | Removed | N/A |
| Generic email (info@, kontakt@) | confidence max 0.3 | No |
| Email domain fails MX check | confidence max 0.2 | No |

---

## Files Modified

| File | Changes |
|------|---------|
| `src/lib/research/validator.ts` | **NEW** – Ownership classification, CVR scoring, post-LLM validation, MX check |
| `src/lib/research/cvr.ts` | Score-based matching, stricter `companyNamesMatch()`, `lookupCvrBestMatch()` |
| `src/lib/research/index.ts` | OIS strategy routing, type-specific queries, no more guessed CVR matches |
| `src/lib/llm.ts` | **Split into 2 prompts**: owner assessment (temp 0.1) + contact ranking (index-based, temp 0.1) |
| `src/lib/workflow/engine.ts` | Post-LLM validator, safe mode, quality gates, MX check, raw data storage |
| `src/lib/config.ts` | Added `RESEARCH_SAFE_MODE` env variable |
| `src/types/index.ts` | Added `names` field to `WebsiteContent` |
| `src/app/api/raw-research/route.ts` | **NEW** – Debug endpoint for raw research data |

---

## Known Remaining Gaps

1. **Virk.dk secondary check**: Not yet implemented. Could be added as secondary CVR validation source.
2. **SMTP probe**: Not implemented (would require connecting to mail servers). MX check is the current alternative.
3. **Feedback learning**: The feedback UI exists but doesn't yet feed back into prompts/heuristics.
4. **Persistent raw data store**: Currently in-memory only – lost on restart. Should move to file/DB.
5. **Hunter.io integration**: Not used. Could improve email verification confidence.
