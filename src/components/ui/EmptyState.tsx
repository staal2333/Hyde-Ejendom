"use client";

import Ic from "./Icon";

interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick?: () => void;
    /** If provided, renders a file upload instead of a button */
    accept?: string;
    onFile?: (file: File) => void;
  };
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="bg-gradient-to-br from-slate-50 to-violet-50/30 rounded-2xl border-2 border-dashed border-slate-300 p-12 text-center transition-colors hover:border-violet-400 hover:from-violet-50/50">
      <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center mx-auto mb-4">
        <Ic d={icon} className="w-7 h-7 text-violet-500" />
      </div>
      <p className="text-sm font-bold text-slate-800 mb-1">{title}</p>
      <p className="text-xs text-slate-400 mb-4 max-w-xs mx-auto">{description}</p>
      {action && (
        action.accept && action.onFile ? (
          <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-xl cursor-pointer shadow-md shadow-violet-500/20 transition-all hover:shadow-lg">
            <Ic d="M12 4.5v15m7.5-7.5h-15" className="w-3.5 h-3.5" />
            {action.label}
            <input type="file" accept={action.accept} className="hidden" onChange={e => e.target.files?.[0] && action.onFile!(e.target.files[0])} />
          </label>
        ) : action.onClick ? (
          <button onClick={action.onClick}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-xl shadow-md shadow-violet-500/20 transition-all hover:shadow-lg">
            <Ic d="M12 4.5v15m7.5-7.5h-15" className="w-3.5 h-3.5" />
            {action.label}
          </button>
        ) : null
      )}
    </div>
  );
}
