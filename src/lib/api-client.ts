// ============================================================
// Central API Client Layer
// Provides: timeouts, exponential backoff, rate limiting,
//           in-memory caching, structured error tracking
// All external API calls should go through this module.
// ============================================================

// ── Types ────────────────────────────────────────────────────

export interface ApiClientOptions {
  /** Timeout in milliseconds (default: 15000) */
  timeout?: number;
  /** Max retry attempts on failure (default: 2) */
  maxRetries?: number;
  /** Base backoff delay in ms (doubles each retry, default: 1000) */
  backoffMs?: number;
  /** Cache TTL in ms (0 = no cache, default: 0) */
  cacheTtlMs?: number;
  /** Rate limit: max requests per window (0 = unlimited) */
  rateLimit?: number;
  /** Rate limit window in ms (default: 60000 = 1 minute) */
  rateLimitWindowMs?: number;
  /** Custom headers */
  headers?: Record<string, string>;
  /** Service name for logging */
  service?: string;
}

export interface ApiCallResult<T> {
  data: T | null;
  ok: boolean;
  status?: number;
  error?: string;
  cached: boolean;
  attempts: number;
  durationMs: number;
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

interface RateLimitBucket {
  timestamps: number[];
}

interface ApiMetrics {
  totalCalls: number;
  cacheHits: number;
  cacheMisses: number;
  failures: number;
  retries: number;
  avgDurationMs: number;
  lastError?: string;
  lastErrorAt?: string;
  lastSuccessAt?: string;
}

// ── In-memory cache ──────────────────────────────────────────

const globalCache = new Map<string, CacheEntry<unknown>>();
const CACHE_MAX_SIZE = 2000;

function getCached<T>(key: string): T | undefined {
  const entry = globalCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    globalCache.delete(key);
    return undefined;
  }
  return entry.data;
}

function setCache<T>(key: string, data: T, ttlMs: number): void {
  // Evict oldest entries if cache is full
  if (globalCache.size >= CACHE_MAX_SIZE) {
    const oldest = globalCache.keys().next().value;
    if (oldest) globalCache.delete(oldest);
  }
  globalCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

/** Clear all cached entries (useful for testing or manual refresh) */
export function clearApiCache(): void {
  globalCache.clear();
}

/** Get cache stats */
export function getCacheStats(): { size: number; maxSize: number } {
  return { size: globalCache.size, maxSize: CACHE_MAX_SIZE };
}

// ── Rate limiting ────────────────────────────────────────────

const rateBuckets = new Map<string, RateLimitBucket>();

function checkRateLimit(
  service: string,
  limit: number,
  windowMs: number
): boolean {
  if (limit <= 0) return true; // unlimited

  const now = Date.now();
  let bucket = rateBuckets.get(service);
  if (!bucket) {
    bucket = { timestamps: [] };
    rateBuckets.set(service, bucket);
  }

  // Remove timestamps outside the window
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);

  if (bucket.timestamps.length >= limit) {
    return false; // Rate limit exceeded
  }

  bucket.timestamps.push(now);
  return true;
}

async function waitForRateLimit(
  service: string,
  limit: number,
  windowMs: number
): Promise<void> {
  if (limit <= 0) return;

  const bucket = rateBuckets.get(service);
  if (!bucket || bucket.timestamps.length < limit) return;

  // Wait until the oldest timestamp expires from the window
  const oldest = bucket.timestamps[0];
  const waitMs = oldest + windowMs - Date.now() + 50; // +50ms buffer
  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

// ── Metrics tracking ─────────────────────────────────────────

const metricsStore = new Map<string, ApiMetrics>();

function getOrCreateMetrics(service: string): ApiMetrics {
  let m = metricsStore.get(service);
  if (!m) {
    m = {
      totalCalls: 0,
      cacheHits: 0,
      cacheMisses: 0,
      failures: 0,
      retries: 0,
      avgDurationMs: 0,
    };
    metricsStore.set(service, m);
  }
  return m;
}

function recordSuccess(service: string, durationMs: number): void {
  const m = getOrCreateMetrics(service);
  m.totalCalls++;
  const prevTotal = m.totalCalls - 1;
  m.avgDurationMs =
    prevTotal > 0
      ? (m.avgDurationMs * prevTotal + durationMs) / m.totalCalls
      : durationMs;
  m.lastSuccessAt = new Date().toISOString();
}

function recordFailure(service: string, error: string): void {
  const m = getOrCreateMetrics(service);
  m.totalCalls++;
  m.failures++;
  m.lastError = error;
  m.lastErrorAt = new Date().toISOString();
}

function recordCacheHit(service: string): void {
  const m = getOrCreateMetrics(service);
  m.cacheHits++;
}

function recordRetry(service: string): void {
  const m = getOrCreateMetrics(service);
  m.retries++;
}

/** Get metrics for all services */
export function getAllMetrics(): Record<string, ApiMetrics> {
  const result: Record<string, ApiMetrics> = {};
  for (const [service, metrics] of metricsStore) {
    result[service] = { ...metrics };
  }
  return result;
}

/** Get metrics for a specific service */
export function getServiceMetrics(service: string): ApiMetrics | null {
  return metricsStore.get(service) || null;
}

// ── Pre-configured service clients ──────────────────────────

/** Default options per service */
const SERVICE_DEFAULTS: Record<string, Partial<ApiClientOptions>> = {
  dawa: {
    timeout: 15_000,
    maxRetries: 2,
    backoffMs: 1_000,
    cacheTtlMs: 3_600_000, // 1 hour – addresses don't change often
    rateLimit: 50,
    rateLimitWindowMs: 10_000, // 50 req / 10s
    headers: { "User-Agent": "Mozilla/5.0 (compatible; EjendomAI/1.0)" },
    service: "dawa",
  },
  bbr: {
    timeout: 15_000,
    maxRetries: 2,
    backoffMs: 1_000,
    cacheTtlMs: 86_400_000, // 24 hours – building data rarely changes
    rateLimit: 30,
    rateLimitWindowMs: 10_000,
    headers: { "User-Agent": "Mozilla/5.0 (compatible; EjendomAI/1.0)" },
    service: "bbr",
  },
  ois: {
    timeout: 20_000,
    maxRetries: 2,
    backoffMs: 2_000,
    cacheTtlMs: 3_600_000, // 1 hour – ownership can change but rarely
    rateLimit: 20,
    rateLimitWindowMs: 10_000,
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; EjendomAI/1.0)",
    },
    service: "ois",
  },
  cvr: {
    timeout: 15_000,
    maxRetries: 2,
    backoffMs: 1_500,
    cacheTtlMs: 86_400_000, // 24 hours – CVR data is stable
    rateLimit: 15,
    rateLimitWindowMs: 10_000,
    headers: { "User-Agent": "EjendomAI/1.0" },
    service: "cvr",
  },
  proff: {
    timeout: 15_000,
    maxRetries: 1,
    backoffMs: 2_000,
    cacheTtlMs: 86_400_000, // 24 hours
    rateLimit: 5,
    rateLimitWindowMs: 10_000, // Gentle with scraping
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
    service: "proff",
  },
  wfs: {
    timeout: 25_000,
    maxRetries: 2,
    backoffMs: 3_000,
    cacheTtlMs: 300_000, // 5 min – permit data is fresher
    rateLimit: 10,
    rateLimitWindowMs: 60_000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      Accept:
        "application/json,text/html,application/xhtml+xml,*/*;q=0.8",
      "Accept-Language": "da-DK,da;q=0.9,en;q=0.8",
    },
    service: "wfs",
  },
  hubspot: {
    timeout: 30_000,
    maxRetries: 3,
    backoffMs: 2_000,
    cacheTtlMs: 0, // No cache – always fresh CRM data
    rateLimit: 80,
    rateLimitWindowMs: 10_000, // HubSpot: 100/10s limit
    service: "hubspot",
  },
  web: {
    timeout: 12_000,
    maxRetries: 1,
    backoffMs: 2_000,
    cacheTtlMs: 600_000, // 10 min
    rateLimit: 10,
    rateLimitWindowMs: 10_000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "da-DK,da;q=0.9,en;q=0.8",
    },
    service: "web",
  },
};

// ── Core fetch function ──────────────────────────────────────

/**
 * Centralized fetch with timeout, retry, backoff, rate limiting, and caching.
 *
 * @example
 * // JSON API call with caching
 * const result = await apiFetch<MyType>("https://api.example.com/data", { service: "myapi" });
 * if (result.ok) console.log(result.data);
 *
 * @example
 * // Using pre-configured service defaults
 * const result = await apiFetch<MyType>(url, SERVICE_DEFAULTS.dawa);
 */
export async function apiFetch<T = unknown>(
  url: string,
  opts: ApiClientOptions = {}
): Promise<ApiCallResult<T>> {
  const timeout = opts.timeout ?? 15_000;
  const maxRetries = opts.maxRetries ?? 2;
  const backoffMs = opts.backoffMs ?? 1_000;
  const cacheTtlMs = opts.cacheTtlMs ?? 0;
  const rateLimit = opts.rateLimit ?? 0;
  const rateLimitWindowMs = opts.rateLimitWindowMs ?? 60_000;
  const headers = opts.headers ?? {};
  const service = opts.service ?? "unknown";

  const startTime = Date.now();

  // ── Check cache ──
  if (cacheTtlMs > 0) {
    const cached = getCached<T>(url);
    if (cached !== undefined) {
      recordCacheHit(service);
      return {
        data: cached,
        ok: true,
        cached: true,
        attempts: 0,
        durationMs: Date.now() - startTime,
      };
    }
  }

  // ── Retry loop ──
  let lastError = "";
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Backoff on retry
    if (attempt > 0) {
      const delay = backoffMs * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
      recordRetry(service);
    }

    // Rate limit check
    if (rateLimit > 0) {
      if (!checkRateLimit(service, rateLimit, rateLimitWindowMs)) {
        await waitForRateLimit(service, rateLimit, rateLimitWindowMs);
      }
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const res = await fetch(url, {
        headers,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        lastError = `HTTP ${res.status}: ${res.statusText}`;
        // Don't retry on 4xx (client errors, except 429)
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          recordFailure(service, lastError);
          return {
            data: null,
            ok: false,
            status: res.status,
            error: lastError,
            cached: false,
            attempts: attempt + 1,
            durationMs: Date.now() - startTime,
          };
        }
        // 429 = rate limited, 5xx = server error → retry
        continue;
      }

      const contentType = res.headers.get("content-type") || "";
      let data: T;

      if (contentType.includes("application/json")) {
        data = (await res.json()) as T;
      } else {
        data = (await res.text()) as unknown as T;
      }

      // Cache the successful result
      if (cacheTtlMs > 0) {
        setCache(url, data, cacheTtlMs);
      }

      const durationMs = Date.now() - startTime;
      recordSuccess(service, durationMs);

      return {
        data,
        ok: true,
        status: res.status,
        cached: false,
        attempts: attempt + 1,
        durationMs,
      };
    } catch (err) {
      lastError =
        err instanceof Error ? err.message : "Unknown fetch error";
      if (lastError.includes("abort")) {
        lastError = `Timeout after ${timeout}ms`;
      }
    }
  }

  // All retries exhausted
  recordFailure(service, lastError);
  return {
    data: null,
    ok: false,
    error: lastError,
    cached: false,
    attempts: maxRetries + 1,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Convenience: JSON fetch for a specific service with pre-configured defaults.
 */
export function apiJson<T = unknown>(
  service: keyof typeof SERVICE_DEFAULTS,
  url: string,
  overrides?: Partial<ApiClientOptions>
): Promise<ApiCallResult<T>> {
  const defaults = SERVICE_DEFAULTS[service] || {};
  return apiFetch<T>(url, { ...defaults, ...overrides });
}

/**
 * Convenience: POST request through the central layer.
 * (For HubSpot and other APIs that need POST.)
 */
export async function apiPost<T = unknown>(
  url: string,
  body: unknown,
  opts: ApiClientOptions = {}
): Promise<ApiCallResult<T>> {
  const timeout = opts.timeout ?? 15_000;
  const maxRetries = opts.maxRetries ?? 2;
  const backoffMs = opts.backoffMs ?? 1_000;
  const headers = opts.headers ?? {};
  const service = opts.service ?? "unknown";
  const rateLimit = opts.rateLimit ?? 0;
  const rateLimitWindowMs = opts.rateLimitWindowMs ?? 60_000;

  const startTime = Date.now();
  let lastError = "";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = backoffMs * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
      recordRetry(service);
    }

    if (rateLimit > 0) {
      if (!checkRateLimit(service, rateLimit, rateLimitWindowMs)) {
        await waitForRateLimit(service, rateLimit, rateLimitWindowMs);
      }
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        lastError = `HTTP ${res.status}: ${res.statusText}`;
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          recordFailure(service, lastError);
          return {
            data: null,
            ok: false,
            status: res.status,
            error: lastError,
            cached: false,
            attempts: attempt + 1,
            durationMs: Date.now() - startTime,
          };
        }
        continue;
      }

      const data = (await res.json()) as T;
      const durationMs = Date.now() - startTime;
      recordSuccess(service, durationMs);

      return {
        data,
        ok: true,
        status: res.status,
        cached: false,
        attempts: attempt + 1,
        durationMs,
      };
    } catch (err) {
      lastError =
        err instanceof Error ? err.message : "Unknown fetch error";
      if (lastError.includes("abort")) {
        lastError = `Timeout after ${timeout}ms`;
      }
    }
  }

  recordFailure(service, lastError);
  return {
    data: null,
    ok: false,
    error: lastError,
    cached: false,
    attempts: maxRetries + 1,
    durationMs: Date.now() - startTime,
  };
}

// ── Health check helpers ─────────────────────────────────────

export interface ServiceHealth {
  service: string;
  status: "healthy" | "degraded" | "down";
  latencyMs?: number;
  lastSuccess?: string;
  lastError?: string;
  errorRate: number;
  cacheHitRate: number;
}

/**
 * Check health of a specific service by looking at recent metrics.
 */
export function getServiceHealth(service: string): ServiceHealth {
  const m = metricsStore.get(service);
  if (!m || m.totalCalls === 0) {
    return {
      service,
      status: "healthy", // No data yet = assume healthy
      errorRate: 0,
      cacheHitRate: 0,
    };
  }

  const errorRate = m.failures / m.totalCalls;
  const cacheHitRate =
    m.cacheHits + m.cacheMisses > 0
      ? m.cacheHits / (m.cacheHits + m.cacheMisses)
      : 0;

  let status: "healthy" | "degraded" | "down" = "healthy";
  if (errorRate > 0.5) status = "down";
  else if (errorRate > 0.1) status = "degraded";

  return {
    service,
    status,
    latencyMs: Math.round(m.avgDurationMs),
    lastSuccess: m.lastSuccessAt,
    lastError: m.lastError,
    errorRate: Math.round(errorRate * 100) / 100,
    cacheHitRate: Math.round(cacheHitRate * 100) / 100,
  };
}

/**
 * Check health of all tracked services.
 */
export function getAllServiceHealth(): ServiceHealth[] {
  const services = [
    "dawa",
    "bbr",
    "ois",
    "cvr",
    "proff",
    "wfs",
    "hubspot",
    "web",
  ];
  return services.map(getServiceHealth);
}

/**
 * Quick ping test for a URL (used by /api/status).
 */
export async function pingService(
  name: string,
  url: string,
  timeoutMs = 8_000
): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "EjendomAI-HealthCheck/1.0" },
    });
    clearTimeout(timer);
    return { ok: res.ok, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
