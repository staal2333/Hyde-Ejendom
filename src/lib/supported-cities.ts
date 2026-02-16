// ============================================================
// Supported Cities – The 5 largest Danish cities
// All research and discovery is restricted to these.
// ============================================================

export interface SupportedCity {
  name: string;             // Display name (e.g. "København")
  kommunekoder: string[];   // DAWA kommunekoder that belong to this city area
  kommunenavne: string[];   // All kommune names that map to this city
  postalCodeRanges: [number, number][]; // Postal code ranges for this city
  aliases: string[];        // Search aliases (lowercase, normalized)
}

/**
 * The 5 largest Danish cities and their surrounding areas.
 * Properties outside these will be rejected from research.
 */
export const SUPPORTED_CITIES: SupportedCity[] = [
  {
    name: "København",
    kommunekoder: [
      "0101", // København
      "0147", // Frederiksberg
      "0153", // Brøndby
      "0155", // Dragør
      "0157", // Gentofte
      "0159", // Gladsaxe
      "0161", // Glostrup
      "0163", // Herlev
      "0165", // Albertslund
      "0167", // Hvidovre
      "0169", // Høje-Taastrup
      "0173", // Lyngby-Taarbæk
      "0175", // Rødovre
      "0183", // Ishøj
      "0185", // Tårnby
      "0187", // Vallensbæk
      "0190", // Furesø
      "0240", // Egedal
      "0250", // Frederikssund
      "0270", // Gribskov
      "0210", // Fredensborg
      "0217", // Helsingør
      "0219", // Hillerød
      "0223", // Hørsholm
      "0230", // Rudersdal
    ],
    kommunenavne: [
      "københavn", "frederiksberg", "gentofte", "gladsaxe", "lyngby-taarbæk",
      "hvidovre", "rødovre", "brøndby", "tårnby", "dragør", "herlev",
      "glostrup", "albertslund", "høje-taastrup", "ishøj", "vallensbæk",
      "furesø", "ballerup", "rudersdal", "hørsholm",
    ],
    postalCodeRanges: [[1000, 2990]],
    aliases: [
      "københavn", "kobenhavn", "copenhagen", "kbh", "cph",
      "frederiksberg", "valby", "vanløse", "amager", "nørrebro",
      "østerbro", "vesterbro", "hellerup", "charlottenlund",
      "gentofte", "gladsaxe", "lyngby", "hvidovre", "rødovre",
      "brøndby", "taastrup", "ballerup", "søborg",
    ],
  },
  {
    name: "Aarhus",
    kommunekoder: ["0751"],
    kommunenavne: ["aarhus"],
    postalCodeRanges: [[8000, 8299]],
    aliases: ["aarhus", "århus", "aarhus c", "aarhus n", "aarhus v"],
  },
  {
    name: "Odense",
    kommunekoder: ["0461"],
    kommunenavne: ["odense"],
    postalCodeRanges: [[5000, 5270]],
    aliases: ["odense", "odense c", "odense s", "odense m", "odense nv"],
  },
  {
    name: "Aalborg",
    kommunekoder: ["0851"],
    kommunenavne: ["aalborg"],
    postalCodeRanges: [[9000, 9260]],
    aliases: ["aalborg", "ålborg", "aalborg sv", "aalborg sø", "nørresundby"],
  },
  {
    name: "Esbjerg",
    kommunekoder: ["0561"],
    kommunenavne: ["esbjerg"],
    postalCodeRanges: [[6700, 6731]],
    aliases: ["esbjerg", "esbjerg n", "esbjerg ø"],
  },
];

/**
 * Check if a city/kommune is within the supported cities.
 * Returns the matching SupportedCity or null.
 */
export function findSupportedCity(
  cityOrKommune: string | undefined | null,
  postalCode?: string | null
): SupportedCity | null {
  if (!cityOrKommune && !postalCode) return null;

  // 1. Check by city alias (use NFD normalization to handle encoding issues)
  if (cityOrKommune) {
    const normalized = cityOrKommune.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // strip diacritics
      .replace(/\u00f8/g, "o").replace(/\u00e6/g, "ae").replace(/\u00e5/g, "a")  // handle remaining Danish chars
      .replace(/[^a-z]/g, "");
    for (const city of SUPPORTED_CITIES) {
      for (const alias of city.aliases) {
        const normalizedAlias = alias.toLowerCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/\u00f8/g, "o").replace(/\u00e6/g, "ae").replace(/\u00e5/g, "a")
          .replace(/[^a-z]/g, "");
        if (normalizedAlias === normalized) return city;
        if (normalized.startsWith(normalizedAlias)) return city;
      }
    }
  }

  // 2. Check by kommunekode (OIS returns "0101 København" or just "0101")
  if (cityOrKommune) {
    const kodeMatch = cityOrKommune.match(/^(\d{4})/);
    if (kodeMatch) {
      const kode = kodeMatch[1];
      for (const city of SUPPORTED_CITIES) {
        if (city.kommunekoder.includes(kode)) return city;
      }
    }
  }

  // 3. Check by kommune name (OIS returns "0101 København" → extract "København")
  if (cityOrKommune) {
    const lower = cityOrKommune.toLowerCase();
    for (const city of SUPPORTED_CITIES) {
      if (city.kommunenavne.some(k => lower.includes(k))) return city;
    }
  }

  // 4. Check by postal code
  if (postalCode) {
    const pc = parseInt(postalCode, 10);
    if (!isNaN(pc)) {
      for (const city of SUPPORTED_CITIES) {
        for (const [min, max] of city.postalCodeRanges) {
          if (pc >= min && pc <= max) return city;
        }
      }
    }
  }

  return null;
}

/**
 * Resolve kommune code/name from OIS to a clean city name.
 * OIS `kommunenavn_kode` can be:
 *   - "0101 København"
 *   - "0101"
 *   - "København"
 */
export function resolveKommuneName(kommunenavnKode?: string | null): string | null {
  if (!kommunenavnKode) return null;

  // Try to find a matching city
  const city = findSupportedCity(kommunenavnKode);
  if (city) return city.name;

  // If it looks like "0101 København", extract the name part
  const parts = kommunenavnKode.trim().split(/\s+/);
  if (parts.length > 1 && /^\d{4}$/.test(parts[0])) {
    return parts.slice(1).join(" ");
  }

  // Return as-is if we can't resolve
  return kommunenavnKode;
}

/**
 * Check if a property's city/postalCode is in a supported city.
 * Returns the city name if supported, or null if not.
 */
export function isSupportedLocation(
  city?: string | null,
  postalCode?: string | null,
  kommune?: string | null
): { supported: true; cityName: string } | { supported: false; reason: string } {
  // Try all available location data
  const match = findSupportedCity(city, postalCode) ||
                findSupportedCity(kommune, postalCode);

  if (match) {
    return { supported: true, cityName: match.name };
  }

  return {
    supported: false,
    reason: `"${city || "ukendt by"}" (postnr: ${postalCode || "?"}, kommune: ${kommune || "?"}) er ikke i de 5 støttede byer: ${SUPPORTED_CITIES.map(c => c.name).join(", ")}`,
  };
}
