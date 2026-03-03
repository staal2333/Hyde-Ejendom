"use client";

import Ic from "./Icon";

interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick?: () => void;
    accept?: string;
    onFile?: (file: File) => void;
  };
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="bg-gradient-to-br from-slate-50/80 to-violet-50/30 rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center transition-all duration-300 hover:border-violet-300 hover:from-violet-50/40 backdrop-blur-sm">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-100 to-violet-50 flex items-center justify-center mx-auto mb-4 animate-float shadow-sm"
        style={{ animationDuration: "4s" }}
      >
        <Ic d={icon} className="w-7 h-7 text-violet-500" />
      </div>
      <p className="text-sm font-bold text-slate-800 mb-1">{title}</p>
      <p className="text-xs text-slate-400 mb-5 max-w-xs mx-auto leading-relaxed">{description}</p>
      {action && (
        action.accept && action.onFile ? (
          <label className="btn-primary btn-md cursor-pointer" style={{ background: "linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%)" }}>
            <Ic d="M12 4.5v15m7.5-7.5h-15" className="w-3.5 h-3.5" />
            {action.label}
            <input type="file" accept={action.accept} className="hidden" onChange={e => e.target.files?.[0] && action.onFile!(e.target.files[0])} />
          </label>
        ) : action.onClick ? (
          <button onClick={action.onClick} className="btn-primary btn-md" style={{ background: "linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%)" }}>
            <Ic d="M12 4.5v15m7.5-7.5h-15" className="w-3.5 h-3.5" />
            {action.label}
          </button>
        ) : null
      )}
    </div>
  );
}
