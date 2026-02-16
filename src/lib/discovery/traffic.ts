// ============================================================
// Traffic Data – Estimate daily traffic for Danish streets
// Sources: Vejdirektoratet open data, curated municipal data
// ============================================================

/**
 * Curated dataset of major Danish streets with known daily traffic counts (ADT).
 * Source: Vejdirektoratet trafiktællinger, Københavns Kommune trafiktal.
 * Format: { "city:streetname": estimatedADT }
 */
const KNOWN_TRAFFIC: Record<string, number> = {
  // ─── København – Højtrafikerede veje ───
  "københavn:h.c. andersens boulevard": 60000,
  "københavn:langebro": 55000,
  "københavn:bredgade": 15000,
  "københavn:vesterbrogade": 35000,
  "københavn:nørrebrogade": 30000,
  "københavn:amagerbrogade": 28000,
  "københavn:østerbrogade": 22000,
  "københavn:jagtvej": 25000,
  "københavn:tagensvej": 22000,
  "københavn:lyngbyvej": 45000,
  "københavn:frederikssundsvej": 28000,
  "københavn:roskildevej": 32000,
  "københavn:gammel kongevej": 20000,
  "københavn:kongens nytorv": 25000,
  "københavn:gothersgade": 18000,
  "københavn:nørre voldgade": 15000,
  "københavn:vester voldgade": 18000,
  "københavn:torvegade": 20000,
  "københavn:istedgade": 12000,
  "københavn:enghavevej": 15000,
  "københavn:vigerslev allé": 20000,
  "københavn:valby langgade": 18000,
  "københavn:carl jacobsens vej": 15000,
  "københavn:øresundsvej": 18000,
  "københavn:amager strandvej": 12000,
  "københavn:englandsvej": 15000,
  "københavn:sundholmsvej": 10000,
  "københavn:folehaven": 25000,
  "københavn:sjælør boulevard": 12000,
  "københavn:kalvebod brygge": 35000,
  "københavn:sydhavnsgade": 18000,
  "københavn:center boulevard": 22000,
  "københavn:åboulevard": 20000,
  "københavn:fredensgade": 12000,
  "københavn:blegdamsvej": 18000,
  "københavn:nørre allé": 14000,
  "københavn:falkoner allé": 16000,
  "københavn:godthåbsvej": 14000,
  "københavn:borups allé": 18000,
  "københavn:bispeengbuen": 35000,
  "københavn:tuborgvej": 20000,
  "københavn:strandvejen": 25000,
  "københavn:helsingørmotorvejen": 55000,
  "københavn:lyngbyvejen": 45000,
  "københavn:hillerødmotorvejen": 50000,
  "københavn:holbækmotorvejen": 60000,
  "københavn:køge bugt motorvejen": 65000,
  "københavn:amagermotorvejen": 50000,

  // ─── Frederiksberg ───
  "frederiksberg:falkoner allé": 16000,
  "frederiksberg:smallegade": 12000,
  "frederiksberg:godthåbsvej": 14000,
  "frederiksberg:pile allé": 12000,
  "frederiksberg:gl. kongevej": 18000,
  "frederiksberg:frederiksberg allé": 15000,
  "frederiksberg:roskildevej": 30000,

  // ─── Aarhus ───
  "aarhus:randersvej": 35000,
  "aarhus:silkeborgvej": 30000,
  "aarhus:ringvej": 40000,
  "aarhus:viborgvej": 28000,
  "aarhus:skanderborgvej": 25000,
  "aarhus:oddervej": 18000,
  "aarhus:frederiks allé": 15000,
  "aarhus:nørrebrogade": 12000,
  "aarhus:søndergade": 25000,
  "aarhus:banegårdsgade": 12000,
  "aarhus:jægergårdsgade": 14000,
  "aarhus:park allé": 15000,
  "aarhus:europaplads": 20000,
  "aarhus:åboulevarden": 15000,
  "aarhus:nørreport": 18000,
  "aarhus:skt. clemens torv": 14000,
  "aarhus:marselis boulevard": 20000,
  "aarhus:strandvejen": 18000,
  "aarhus:grenåvej": 22000,
  "aarhus:herredsvej": 15000,

  // ─── Odense ───
  "odense:albanigade": 20000,
  "odense:middelfartvej": 22000,
  "odense:nørregade": 15000,
  "odense:vesterbro": 18000,
  "odense:østre stationsvej": 16000,
  "odense:niels bohrs allé": 25000,

  // ─── Aalborg ───
  "aalborg:vesterbro": 22000,
  "aalborg:nørresundby": 18000,
  "aalborg:hobrovej": 25000,
  "aalborg:borgmester jørgensens vej": 20000,
  "aalborg:kong christians allé": 16000,
};

/**
 * Street type traffic multipliers for estimation when no exact data exists.
 * Based on typical Danish urban traffic patterns.
 */
const STREET_TYPE_ESTIMATES: { pattern: RegExp; estimate: number }[] = [
  { pattern: /motorvej/i, estimate: 55000 },
  { pattern: /motortrafikvej/i, estimate: 35000 },
  { pattern: /ringvej|ring\s?\d/i, estimate: 35000 },
  { pattern: /boulevard/i, estimate: 20000 },
  { pattern: /allé/i, estimate: 15000 },
  { pattern: /brogade$/i, estimate: 22000 },
  { pattern: /landevej/i, estimate: 12000 },
  { pattern: /hovedgade/i, estimate: 15000 },
  { pattern: /torv|plads/i, estimate: 12000 },
  { pattern: /strandvej/i, estimate: 15000 },
  { pattern: /^vej$|vej\s/i, estimate: 10000 },
  { pattern: /gade$/i, estimate: 8000 },
  { pattern: /stræde$/i, estimate: 4000 },
  { pattern: /vænge|have|park/i, estimate: 3000 },
];

/**
 * City size multiplier – larger cities have more traffic.
 */
const CITY_MULTIPLIERS: Record<string, number> = {
  "københavn": 1.3,
  "frederiksberg": 1.2,
  "aarhus": 1.0,
  "odense": 0.85,
  "aalborg": 0.8,
  "esbjerg": 0.7,
  "randers": 0.65,
  "kolding": 0.65,
  "horsens": 0.6,
  "vejle": 0.65,
  "roskilde": 0.7,
  "herning": 0.6,
  "silkeborg": 0.55,
  "næstved": 0.55,
  "fredericia": 0.6,
  "viborg": 0.55,
  "køge": 0.6,
  "holstebro": 0.5,
  "slagelse": 0.55,
  "hillerød": 0.6,
  "helsingør": 0.6,
};

export interface TrafficEstimate {
  estimatedDailyTraffic: number;
  trafficSource: "vejdirektoratet" | "kommune" | "estimate";
  confidence: number; // 0.0-1.0
}

/**
 * Estimate daily traffic for a street.
 * 1. Check curated database (high confidence)
 * 2. Use street name pattern matching (medium confidence)
 * 3. Fall back to city-based default (low confidence)
 */
export function estimateStreetTraffic(
  streetName: string,
  city: string
): TrafficEstimate {
  const normalizedCity = city.toLowerCase().replace(/[^a-zæøå]/g, "");
  const normalizedStreet = streetName.toLowerCase().trim();

  // 1. Exact match in curated database
  const key = `${normalizedCity}:${normalizedStreet}`;
  if (KNOWN_TRAFFIC[key]) {
    return {
      estimatedDailyTraffic: KNOWN_TRAFFIC[key],
      trafficSource: "vejdirektoratet",
      confidence: 0.9,
    };
  }

  // 1b. Partial match (street name contained in a key)
  for (const [k, v] of Object.entries(KNOWN_TRAFFIC)) {
    if (k.startsWith(`${normalizedCity}:`) && k.includes(normalizedStreet)) {
      return {
        estimatedDailyTraffic: v,
        trafficSource: "vejdirektoratet",
        confidence: 0.75,
      };
    }
  }

  // 2. Street type pattern matching
  const cityMultiplier = CITY_MULTIPLIERS[normalizedCity] || 0.5;

  for (const { pattern, estimate } of STREET_TYPE_ESTIMATES) {
    if (pattern.test(normalizedStreet)) {
      return {
        estimatedDailyTraffic: Math.round(estimate * cityMultiplier),
        trafficSource: "estimate",
        confidence: 0.4,
      };
    }
  }

  // 3. Default fallback based on city size
  const defaultTraffic = Math.round(6000 * cityMultiplier);
  return {
    estimatedDailyTraffic: defaultTraffic,
    trafficSource: "estimate",
    confidence: 0.2,
  };
}

/**
 * Check if a street meets the minimum traffic threshold.
 */
export function meetsTrafficThreshold(
  streetName: string,
  city: string,
  minTraffic = 10000
): { meets: boolean; estimate: TrafficEstimate } {
  const estimate = estimateStreetTraffic(streetName, city);
  return {
    meets: estimate.estimatedDailyTraffic >= minTraffic,
    estimate,
  };
}

/**
 * Format traffic count for display.
 */
export function formatTraffic(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}K`;
  }
  return count.toString();
}
