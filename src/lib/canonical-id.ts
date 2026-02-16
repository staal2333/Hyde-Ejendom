// ============================================================
// Canonical Property Identity
// Defines a unique, stable identity for a property across all
// pipelines: address + BFE + HubSpot custom object ID
// Ensures cross-pipeline deduplication
// ============================================================

export interface CanonicalProperty {
  /** Normalized address string (lowercased, trimmed, standardized) */
  canonicalAddress: string;
  /** BFE number from DAWA/BBR (if known) */
  bfeNumber?: string;
  /** HubSpot custom object ID (if created) */
  hubspotId?: string;
  /** Source that first discovered this property */
  source: "street_discovery" | "scaffolding" | "manual" | "unknown";
}

/**
 * Normalize a Danish address for comparison.
 * Strips whitespace, lowercases, standardizes abbreviations.
 */
export function normalizeAddress(raw: string): string {
  let addr = raw.trim().toLowerCase();

  // Remove "denmark" / "danmark" suffix
  addr = addr.replace(/,?\s*(denmark|danmark)\s*$/i, "");

  // Standardize common abbreviations
  addr = addr
    .replace(/\bvej\b/g, "vej")
    .replace(/\bgade\b/g, "gade")
    .replace(/\balle\b/g, "allé")
    .replace(/\bplads\b/g, "plads")
    .replace(/\bstr\./g, "stræde")
    .replace(/\bkbh\./g, "københavn")
    .replace(/\bkbh\b/g, "københavn");

  // Collapse multiple spaces
  addr = addr.replace(/\s+/g, " ").trim();

  // Remove trailing comma
  addr = addr.replace(/,\s*$/, "");

  return addr;
}

/**
 * Generate a canonical key for deduplication.
 * Priority: BFE number > normalized address
 */
export function canonicalKey(address: string, bfeNumber?: string): string {
  if (bfeNumber) return `bfe:${bfeNumber}`;
  return `addr:${normalizeAddress(address)}`;
}

/**
 * Check if two properties are the same location.
 */
export function isSameProperty(
  a: { address: string; bfeNumber?: string },
  b: { address: string; bfeNumber?: string }
): boolean {
  // If both have BFE numbers, compare those (most reliable)
  if (a.bfeNumber && b.bfeNumber) {
    return a.bfeNumber === b.bfeNumber;
  }

  // Otherwise compare normalized addresses
  return normalizeAddress(a.address) === normalizeAddress(b.address);
}

/**
 * Deduplicate an array of items by their canonical property key.
 * Returns only unique items. When duplicates exist, keeps the first one.
 */
export function deduplicateByAddress<T extends { address: string; bfeNumber?: string }>(
  items: T[]
): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = canonicalKey(item.address, item.bfeNumber);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
