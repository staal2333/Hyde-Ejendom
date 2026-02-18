"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

export default function PinGate() {
  const { login } = useAuth();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = useCallback(() => {
    setError("");
    if (pin.length !== 4) {
      setError("Indtast 4 cifre");
      return;
    }
    if (login(pin)) {
      setPin("");
    } else {
      setError("Forkert kode");
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-4">
      <div className="w-full max-w-[280px] rounded-2xl bg-white/95 shadow-xl border border-slate-200/60 p-6">
        <div className="text-center mb-6">
          <h1 className="text-lg font-bold text-slate-800 tracking-tight">Ejendom AI</h1>
          <p className="text-xs text-slate-500 mt-1">Indtast kode for at logge ind</p>
        </div>

        <div className="flex justify-center gap-2 mb-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="w-11 h-12 rounded-lg border-2 border-slate-200 flex items-center justify-center text-lg font-bold tabular-nums text-slate-700 bg-slate-50"
            >
              {pin[i] ?? "·"}
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
          <p className="text-center text-sm text-red-600 font-medium mb-4">{error}</p>
        )}

        <div className="grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((key) =>
            key === "" ? (
              <div key="empty" />
            ) : key === "⌫" ? (
              <button
                key="back"
                type="button"
                onClick={onBackspace}
                className="h-12 rounded-xl bg-slate-100 text-slate-600 font-semibold text-sm hover:bg-slate-200 active:scale-95 transition"
              >
                ⌫
              </button>
            ) : (
              <button
                key={key}
                type="button"
                onClick={() => onDigit(key)}
                className="h-12 rounded-xl bg-slate-100 text-slate-800 font-bold text-lg hover:bg-slate-200 active:scale-95 transition"
              >
                {key}
              </button>
            )
          )}
        </div>

        <p className="text-[10px] text-slate-400 text-center mt-4">
          Log ud efter 6 timers inaktivitet – log ind igen for at fortsætte
        </p>
      </div>
    </div>
  );
}
