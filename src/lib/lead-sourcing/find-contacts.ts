// ============================================================
// Lead Sourcing – find contacts (target roles) at a company
// Target: Marketingschef, Medieindkøber, Brand Manager, Direktør
// ============================================================

export const TARGET_ROLES = [
  "marketingschef", "marketing chef", "marketing manager", "cmo", "marketingsdirektør",
  "medieindkøber", "media buyer", "medieansvarlig",
  "brand manager", "brandansvarlig",
  "direktør", "ceo", "administrerende direktør", "vd",
] as const;

export interface LeadContact {
  name: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  roleMatched: string;
}

/**
 * Check if a job title matches our target roles.
 */
export function titleMatchesTargetRole(title: string | null | undefined): string | null {
  if (!title || !title.trim()) return null;
  const t = title.toLowerCase().trim();
  for (const role of TARGET_ROLES) {
    if (t.includes(role)) return role;
  }
  return null;
}
