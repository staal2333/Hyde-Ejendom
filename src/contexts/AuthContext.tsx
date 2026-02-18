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

const STORAGE_KEY = "ejendom_ai_session";
const PIN = "1130";
const INACTIVITY_MS = 6 * 60 * 60 * 1000; // 6 timer
const ACTIVITY_THROTTLE_MS = 30 * 1000; // opdater max hver 30 sek

interface Session {
  lastActivity: number;
}

function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (!s || typeof s.lastActivity !== "number") return null;
    return s;
  } catch {
    return null;
  }
}

let lastWrite = 0;
function setSession() {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastWrite < ACTIVITY_THROTTLE_MS) return;
  lastWrite = now;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ lastActivity: now }));
  } catch {}
}

function clearSession() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

function isSessionValid(s: Session | null): boolean {
  if (!s) return false;
  return Date.now() - s.lastActivity < INACTIVITY_MS;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  login: (pin: string) => boolean;
  logout: () => void;
  refreshActivity: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState<boolean>(() => {
    const s = getSession();
    return isSessionValid(s);
  });
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshActivity = useCallback(() => {
    if (!getSession()) return;
    setSession();
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setAuthenticated(false);
  }, []);

  const login = useCallback((pin: string): boolean => {
    if (pin.trim() === PIN) {
      setSession();
      setAuthenticated(true);
      return true;
    }
    return false;
  }, []);

  // Check validity on mount and on interval (e.g. every minute)
  useEffect(() => {
    const check = () => {
      const s = getSession();
      if (!s || !isSessionValid(s)) {
        clearSession();
        setAuthenticated(false);
      }
    };
    check();
    checkIntervalRef.current = setInterval(check, 60 * 1000);
    return () => {
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
    };
  }, []);

  // On visibility change (tab focus), re-check so we log out when coming back after 6h
  useEffect(() => {
    const onVisibility = () => {
      const s = getSession();
      if (!s || !isSessionValid(s)) {
        clearSession();
        setAuthenticated(false);
      } else {
        setSession(); // refresh activity when user comes back to tab
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const value: AuthContextValue = {
    isAuthenticated: authenticated,
    login,
    logout,
    refreshActivity,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
