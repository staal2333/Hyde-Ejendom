// ============================================================
// Live stillads-statistik – gemmes ved scan, serveres til dashboard
// Vises for dagen før; opdateres hvert 10. min via cron.
// ============================================================

export interface ScaffoldStatsPermitItem {
  address: string;
  durationText: string;
}

export interface ScaffoldStats {
  /** Antal oprettet i går (dagen før) */
  previousDay: number;
  /** Tilladelser fra dagen før med adresse + varighed */
  previousDayPermits: ScaffoldStatsPermitItem[];
  daily: number;
  weekly: number;
  monthly: number;
  at: string; // ISO timestamp for seneste opdatering
}

let store: ScaffoldStats | null = null;

type PermitInput = {
  createdDate?: string | null;
  address?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  durationWeeks?: number | null;
};

function formatDuration(p: PermitInput): string {
  if (p.durationWeeks != null && p.durationWeeks > 0) {
    return p.durationWeeks === 1 ? "1 uge" : `${p.durationWeeks} uger`;
  }
  if (p.endDate) {
    try {
      const d = new Date(p.endDate);
      if (!Number.isNaN(d.getTime())) {
        const day = d.getDate();
        const month = d.getMonth() + 1;
        return `til ${day}/${month}`;
      }
    } catch {
      // ignore
    }
  }
  return "—";
}

/** Beregn statistik inkl. dagen før og liste med adresse + varighed. */
export function computeScaffoldStatsFromPermits(permits: PermitInput[]): ScaffoldStats {
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const todayStart = dayStart.getTime();
  const yesterdayStart = todayStart - oneDayMs;
  const weekStart = now - 7 * oneDayMs;
  const monthStart = now - 30 * oneDayMs;

  let previousDay = 0;
  const previousDayPermits: ScaffoldStatsPermitItem[] = [];
  let daily = 0;
  let weekly = 0;
  let monthly = 0;

  for (const p of permits) {
    const raw = p.createdDate;
    if (!raw) continue;
    const t = new Date(raw).getTime();
    if (Number.isNaN(t)) continue;
    if (t >= yesterdayStart && t < todayStart) {
      previousDay++;
      const addr = (p.address || "").trim();
      if (addr) {
        previousDayPermits.push({
          address: addr,
          durationText: formatDuration(p),
        });
      }
    }
    if (t >= todayStart) daily++;
    if (t >= weekStart) weekly++;
    if (t >= monthStart) monthly++;
  }

  return {
    previousDay,
    previousDayPermits,
    daily,
    weekly,
    monthly,
    at: new Date().toISOString(),
  };
}

/** Gem statistik (kaldes fra discover-scaffolding når scan er færdig). */
export function setScaffoldStats(stats: ScaffoldStats): void {
  store = stats;
}

/** Hent seneste statistik til dashboard. */
export function getScaffoldStats(): ScaffoldStats | null {
  return store;
}
