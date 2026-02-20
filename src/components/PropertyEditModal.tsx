"use client";

import type { PropertyItem } from "@/contexts/DashboardContext";

export interface PropertyEditModalProps {
  property: PropertyItem | null;
  onClose: () => void;
  onSaved: () => void;
  addToast: (message: string, type: "success" | "error" | "info") => void;
}

export function PropertyEditModal({
  property,
  onClose,
  onSaved,
  addToast,
}: PropertyEditModalProps) {
  if (!property) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!property) return;
    const form = e.currentTarget;
    const name = (form.querySelector('[name="name"]') as HTMLInputElement)?.value?.trim();
    const kontaktperson = (form.querySelector('[name="kontaktperson"]') as HTMLInputElement)?.value?.trim();
    const mailadresse = (form.querySelector('[name="mailadresse"]') as HTMLInputElement)?.value?.trim();
    const telefonnummer = (form.querySelector('[name="telefonnummer"]') as HTMLInputElement)?.value?.trim();

    try {
      const res = await fetch(`/api/properties/${property.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || undefined,
          kontaktperson: kontaktperson || undefined,
          mailadresse: mailadresse || undefined,
          telefonnummer: telefonnummer || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        addToast(data.error || "Kunne ikke gemme", "error");
        return;
      }
      addToast("Ejendom opdateret", "success");
      onSaved();
      onClose();
    } catch {
      addToast("Fejl ved opdatering", "error");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Rediger ejendom</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Luk"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Navn / Adresse</label>
            <input
              name="name"
              type="text"
              defaultValue={property.name || ""}
              placeholder="fx. Jagtvej 43"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Kontaktperson</label>
            <input
              name="kontaktperson"
              type="text"
              defaultValue={property.primaryContact?.name ?? property.contactPerson ?? ""}
              placeholder="Navn"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Email</label>
            <input
              name="mailadresse"
              type="email"
              defaultValue={property.primaryContact?.email ?? property.contactEmail ?? ""}
              placeholder="email@example.com"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Telefon</label>
            <input
              name="telefonnummer"
              type="tel"
              defaultValue=""
              placeholder="+45 ..."
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200"
            />
          </div>
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50"
            >
              Annuller
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700"
            >
              Gem
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
