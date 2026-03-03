"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

export default function PinGate() {
  const { login } = useAuth();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [shaking, setShaking] = useState(false);

  const submit = useCallback(async () => {
    setError("");
    if (pin.length !== 4) {
      setError("Indtast 4 cifre");
      return;
    }
    setLoading(true);
    const ok = await login(pin);
    setLoading(false);
    if (ok) {
      setPin("");
    } else {
      setError("Forkert kode");
      setShaking(true);
      setTimeout(() => setShaking(false), 600);
      setPin("");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [pin, login]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (pin.length === 4) submit();
  }, [pin, submit]);

  const onDigit = (d: string) => {
    if (pin.length >= 4) return;
    setPin((p) => p + d);
    setError("");
  };

  const onBackspace = () => {
    setPin((p) => p.slice(0, -1));
    setError("");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Animated mesh gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#070b1a] via-[#0f1629] to-[#0a0e1f]" />
      <div
        className="absolute inset-0 gradient-mesh-animated opacity-80"
        style={{ filter: "blur(60px)" }}
      />
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full bg-indigo-500/10 blur-3xl animate-float" />
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 rounded-full bg-violet-500/8 blur-3xl animate-float" style={{ animationDelay: "-3s" }} />
        <div className="absolute top-1/2 left-1/2 w-48 h-48 rounded-full bg-cyan-500/5 blur-3xl animate-float" style={{ animationDelay: "-1.5s" }} />
      </div>

      {/* Card */}
      <div
        className={`relative z-10 w-full max-w-[300px] rounded-2xl p-7 glass-frost animate-scale-in ${shaking ? "animate-shake" : ""}`}
        style={{
          boxShadow: error
            ? "0 0 40px rgba(239,68,68,0.15), 0 20px 60px -12px rgba(0,0,0,0.5)"
            : "0 20px 60px -12px rgba(0,0,0,0.5), 0 0 40px rgba(99,102,241,0.08)",
        }}
      >
        <div className="text-center mb-7">
          {/* Logo icon */}
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl gradient-brand-vivid flex items-center justify-center animate-float-in"
            style={{ boxShadow: "0 4px 20px rgba(99,102,241,0.4), 0 0 0 1px rgba(255,255,255,0.1)" }}
          >
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-white tracking-tight">Ejendom AI</h1>
          <p className="text-xs text-white/40 mt-1 font-light">Indtast kode for at logge ind</p>
        </div>

        {/* PIN digit boxes */}
        <div className="flex justify-center gap-2.5 mb-5">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-12 h-13 rounded-xl flex items-center justify-center text-lg font-bold tabular-nums transition-all duration-200 ${
                pin[i]
                  ? "bg-white/15 border-2 border-indigo-400/50 text-white shadow-[0_0_12px_rgba(99,102,241,0.2)]"
                  : "bg-white/5 border-2 border-white/10 text-white/20"
              }`}
              style={{
                animationDelay: `${i * 50}ms`,
                paddingTop: "0.875rem",
                paddingBottom: "0.875rem",
              }}
            >
              {pin[i] ? "●" : "·"}
            </div>
          ))}
        </div>

        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          onKeyDown={(e) => {
            if (e.key === "Backspace") onBackspace();
            if (e.key >= "0" && e.key <= "9") onDigit(e.key);
          }}
          className="sr-only"
          aria-label="PIN-kode"
          autoComplete="off"
        />

        {error && (
          <p className="text-center text-xs text-red-400 font-medium mb-4 animate-fade-in">{error}</p>
        )}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((key) =>
            key === "" ? (
              <div key="empty" />
            ) : key === "⌫" ? (
              <button
                key="back"
                type="button"
                onClick={onBackspace}
                className="h-12 rounded-xl bg-white/5 text-white/50 font-semibold text-sm hover:bg-white/10 active:scale-95 border border-white/5 hover:border-white/10 transition-all duration-150"
              >
                ⌫
              </button>
            ) : (
              <button
                key={key}
                type="button"
                onClick={() => onDigit(key)}
                className="h-12 rounded-xl bg-white/8 text-white font-semibold text-lg hover:bg-white/14 active:scale-[0.93] border border-white/8 hover:border-white/15 transition-all duration-150 hover:shadow-[0_0_12px_rgba(99,102,241,0.12)]"
              >
                {key}
              </button>
            )
          )}
        </div>

        {loading && (
          <div className="flex justify-center mt-4">
            <div className="w-5 h-5 border-2 border-white/20 border-t-indigo-400 rounded-full animate-spin" />
          </div>
        )}

        <p className="text-2xs text-white/25 text-center mt-5 font-light">
          Log ud efter 6 timers inaktivitet
        </p>
      </div>
    </div>
  );
}
