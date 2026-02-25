/**
 * Consistent address formatting across the app.
 * Danish format: "Vejnavn 1, 1050 København" (address, postalCode city).
 */

function trim(s: string | undefined | null): string {
  return (s ?? "").trim();
}

/**
 * One line: "Vejnavn 1, 1050 København".
 * If only postalCode + city: "1050 København".
 */
export function formatAddressLine(
  address?: string | null,
  postalCode?: string | null,
  city?: string | null
): string {
  const a = trim(address);
  const pc = trim(postalCode);
  const c = trim(city);
  const loc = [pc, c].filter(Boolean).join(" ");
  if (!a && !loc) return "—";
  if (!a) return loc;
  if (!loc) return a;
  return `${a}, ${loc}`;
}

/**
 * Short location only: "1050 København".
 */
export function formatLocation(postalCode?: string | null, city?: string | null): string {
  const pc = trim(postalCode);
  const c = trim(city);
  if (!pc && !c) return "—";
  return [pc, c].filter(Boolean).join(" ");
}

/**
 * Display title for a property: prefer address, fallback to name.
 * Address is more useful than hs_name which often contains contact names.
 */
export function formatPropertyTitle(
  name?: string | null,
  address?: string | null,
  postalCode?: string | null,
  city?: string | null
): string {
  const addr = formatAddressLine(address, postalCode, city);
  if (addr && addr !== "—") return addr;
  const n = trim(name);
  if (n) return n;
  return "Unavngivet ejendom";
}
