// ============================================================
// Structured Logger
// Centralized logging with structured context per job/property/API call
// ============================================================

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service?: string;
  jobId?: string;
  propertyId?: string;
  propertyAddress?: string;
  apiCall?: {
    service: string;
    url?: string;
    method?: string;
    status?: number;
    durationMs?: number;
    attempt?: number;
  };
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
  metadata?: Record<string, unknown>;
}

// ── In-memory log store (recent entries for /api/status) ────

const MAX_LOG_ENTRIES = 500;
const logStore: LogEntry[] = [];

function storeLog(entry: LogEntry): void {
  logStore.push(entry);
  if (logStore.length > MAX_LOG_ENTRIES) {
    logStore.splice(0, logStore.length - MAX_LOG_ENTRIES);
  }
}

/** Get recent log entries, optionally filtered */
export function getRecentLogs(opts?: {
  level?: LogLevel;
  service?: string;
  jobId?: string;
  propertyId?: string;
  limit?: number;
}): LogEntry[] {
  let logs = [...logStore];
  if (opts?.level) logs = logs.filter(l => l.level === opts.level);
  if (opts?.service) logs = logs.filter(l => l.service === opts.service || l.apiCall?.service === opts.service);
  if (opts?.jobId) logs = logs.filter(l => l.jobId === opts.jobId);
  if (opts?.propertyId) logs = logs.filter(l => l.propertyId === opts.propertyId);
  return logs.slice(-(opts?.limit || 100));
}

/** Get error/warning counts */
export function getLogStats(): { total: number; errors: number; warnings: number; byService: Record<string, number> } {
  const stats = { total: logStore.length, errors: 0, warnings: 0, byService: {} as Record<string, number> };
  for (const entry of logStore) {
    if (entry.level === "error") stats.errors++;
    if (entry.level === "warn") stats.warnings++;
    const svc = entry.service || entry.apiCall?.service || "unknown";
    stats.byService[svc] = (stats.byService[svc] || 0) + 1;
  }
  return stats;
}

// ── Core logging function ────────────────────────────────────

function log(level: LogLevel, message: string, context?: Partial<Omit<LogEntry, "timestamp" | "level" | "message">>): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };

  storeLog(entry);

  // Also output to console with structured format
  const prefix = `[${entry.timestamp}] [${level.toUpperCase()}]`;
  const contextStr = [
    entry.service && `service=${entry.service}`,
    entry.jobId && `job=${entry.jobId}`,
    entry.propertyId && `property=${entry.propertyId}`,
    entry.apiCall?.service && `api=${entry.apiCall.service}`,
    entry.apiCall?.status && `status=${entry.apiCall.status}`,
    entry.apiCall?.durationMs != null && `duration=${entry.apiCall.durationMs}ms`,
  ].filter(Boolean).join(" ");

  const formatted = `${prefix} ${message}${contextStr ? ` (${contextStr})` : ""}`;

  switch (level) {
    case "error":
      console.error(formatted, entry.error?.stack || "");
      break;
    case "warn":
      console.warn(formatted);
      break;
    case "debug":
      if (process.env.NODE_ENV === "development") console.debug(formatted);
      break;
    default:
      console.log(formatted);
  }
}

// ── Public API ───────────────────────────────────────────────

export const logger = {
  debug: (msg: string, ctx?: Partial<Omit<LogEntry, "timestamp" | "level" | "message">>) => log("debug", msg, ctx),
  info: (msg: string, ctx?: Partial<Omit<LogEntry, "timestamp" | "level" | "message">>) => log("info", msg, ctx),
  warn: (msg: string, ctx?: Partial<Omit<LogEntry, "timestamp" | "level" | "message">>) => log("warn", msg, ctx),
  error: (msg: string, ctx?: Partial<Omit<LogEntry, "timestamp" | "level" | "message">>) => log("error", msg, ctx),

  /** Log an API call result */
  apiCall: (service: string, url: string, result: { ok: boolean; status?: number; durationMs: number; attempts: number; error?: string }) => {
    const level: LogLevel = result.ok ? "debug" : result.attempts > 1 ? "warn" : "error";
    log(level, result.ok ? `API call to ${service} succeeded` : `API call to ${service} failed: ${result.error}`, {
      apiCall: {
        service,
        url,
        status: result.status,
        durationMs: result.durationMs,
        attempt: result.attempts,
      },
    });
  },

  /** Log research job events */
  research: (propertyId: string, address: string, message: string, metadata?: Record<string, unknown>) => {
    log("info", message, { service: "research", propertyId, propertyAddress: address, metadata });
  },

  /** Log discovery events */
  discovery: (jobId: string, message: string, metadata?: Record<string, unknown>) => {
    log("info", message, { service: "discovery", jobId, metadata });
  },

  /** Log scaffold discovery events */
  scaffold: (message: string, metadata?: Record<string, unknown>) => {
    log("info", message, { service: "scaffolding", metadata });
  },
};
