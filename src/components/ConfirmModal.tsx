"use client";

import { useEffect, useRef } from "react";

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  /** Optional extra detail shown below the message */
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "info";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const VARIANT_STYLES = {
  danger: {
    icon: "M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0",
    iconBg: "bg-red-100",
    iconColor: "text-red-600",
    btnBg: "bg-red-600 hover:bg-red-700",
  },
  warning: {
    icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z",
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    btnBg: "bg-amber-600 hover:bg-amber-700",
  },
  info: {
    icon: "M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5",
    iconBg: "bg-violet-100",
    iconColor: "text-violet-600",
    btnBg: "bg-violet-600 hover:bg-violet-700",
  },
};

export default function ConfirmModal({
  open,
  title,
  message,
  detail,
  confirmLabel = "Bekræft",
  cancelLabel = "Annuller",
  variant = "danger",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const btnRef = useRef<HTMLButtonElement>(null);

  // Focus confirm button on open
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => btnRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const s = VARIANT_STYLES[variant];

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          {/* Icon */}
          <div className={`w-11 h-11 rounded-xl ${s.iconBg} flex items-center justify-center mb-4`}>
            <svg className={`w-5 h-5 ${s.iconColor}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d={s.icon} />
            </svg>
          </div>

          <h3 className="text-base font-bold text-slate-900 mb-1">{title}</h3>
          <p className="text-sm text-slate-500 leading-relaxed">{message}</p>
          {detail && (
            <p className="text-xs text-slate-400 mt-2 bg-slate-50 rounded-lg px-3 py-2">{detail}</p>
          )}
        </div>

        <div className="px-6 pb-5 flex gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={btnRef}
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 px-4 py-2.5 text-sm font-semibold text-white ${s.btnBg} rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2`}
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white/30 border-t-white" />
                <span>Vent...</span>
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
