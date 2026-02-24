"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const INACTIVITY_MS = 6 * 60 * 60 * 1000; // 6 hours
const ACTIVITY_THROTTLE_MS = 30 * 1000;
const STORAGE_KEY = "ejendom_ai_activity";

interface AuthContextValue {
  isAuthenticated: boolean;
  login: (pin: string) => Promise<boolean>;
  logout: () => void;
  refreshActivity: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

let lastActivityWrite = 0;

function recordActivity() {
  const now = Date.now();
  if (now - lastActivityWrite < ACTIVITY_THROTTLE_MS) return;
  lastActivityWrite = now;
  try {
    localStorage.setItem(STORAGE_KEY, String(now));
  } catch {}
}

function isLocallyActive(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    return Date.now() - parseInt(raw, 10) < INACTIVITY_MS;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [ready, setReady] = useState(false);
  const checkRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!isLocallyActive()) {
        setAuthenticated(false);
        setReady(true);
        return;
      }
      try {
        const res = await fetch("/api/auth/check");
        const data = await res.json();
        if (!cancelled) setAuthenticated(!!data.authenticated);
      } catch {
        if (!cancelled) setAuthenticated(false);
      }
      if (!cancelled) setReady(true);
    }
    check();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const tick = () => {
      if (!isLocallyActive()) {
        setAuthenticated(false);
      }
    };
    checkRef.current = setInterval(tick, 60_000);
    return () => { if (checkRef.current) clearInterval(checkRef.current); };
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        if (!isLocallyActive()) setAuthenticated(false);
        else recordActivity();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const login = useCallback(async (pin: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/auth/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pin.trim() }),
      });
      if (res.ok) {
        recordActivity();
        setAuthenticated(true);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    setAuthenticated(false);
  }, []);

  const refreshActivity = useCallback(() => {
    if (authenticated) recordActivity();
  }, [authenticated]);

  if (!ready) return null;

  return (
    <AuthContext.Provider value={{ isAuthenticated: authenticated, login, logout, refreshActivity }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
