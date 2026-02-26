"use client";

import { useState, useEffect, useCallback } from "react";

export type EmailTemplateType = "cold" | "followup" | "customer";

export interface EmailComposerLead {
  id?: string;
  name: string;
  industry?: string | null;
  oohReason?: string | null;
  platforms?: string[];
  adCount?: number;
  egenkapital?: number | null;
  omsaetning?: number | null;
  address?: string | null;
  contactEmail?: string | null;
  contactName?: string | null;
  contactRole?: string | null;
}

interface EmailComposerProps {
  lead: EmailComposerLead;
  onClose: () => void;
  onSent?: () => void;
}

type ViewMode = "compose" | "preview";

export function EmailComposer({ lead, onClose, onSent }: EmailComposerProps) {
  const [type, setType] = useState<EmailTemplateType>("cold");
  const [to, setTo] = useState(lead.contactEmail || "");
  const [toName, setToName] = useState(lead.contactName || "");
  const [subject, setSubject] = useState("");
  const [htmlBody, setHtmlBody] = useState("");
  const [customContext, setCustomContext] = useState("");
  const [view, setView] = useState<ViewMode>("compose");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentSuccess, setSentSuccess] = useState(false);
  const [smtpOk, setSmtpOk] = useState<boolean | null>(null);

  // Check SMTP config on mount
  useEffect(() => {
    fetch("/api/email/send")
      .then(r => r.json())
      .then(d => setSmtpOk(d.configured === true))
      .catch(() => setSmtpOk(false));
  }, []);

  const generateEmail = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/email/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          companyName: lead.name,
          industry: lead.industry,
          oohReason: lead.oohReason,
          platforms: lead.platforms || [],
          adCount: lead.adCount,
          egenkapital: lead.egenkapital,
          omsaetning: lead.omsaetning,
          address: lead.address,
          recipientName: toName || lead.contactName,
          recipientRole: lead.contactRole,
          customContext: customContext.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generering fejlede");
      setSubject(data.subject || "");
      setHtmlBody(data.html || "");
      setView("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fejl");
    } finally {
      setGenerating(false);
    }
  }, [type, lead, toName, customContext]);

  const sendEmail = useCallback(async () => {
    if (!to.includes("@")) { setError("Ugyldig email-adresse"); return; }
    if (!subject.trim()) { setError("Emnelinje mangler"); return; }
    if (!htmlBody.trim()) { setError("Email-indhold mangler — generér først"); return; }

    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          toName: toName || undefined,
          subject,
          html: htmlBody,
          leadId: lead.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sending fejlede");
      setSentSuccess(true);
      setTimeout(() => { onSent?.(); onClose(); }, 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fejl ved sending");
    } finally {
      setSending(false);
    }
  }, [to, toName, subject, htmlBody, lead.id, onSent, onClose]);

  const TYPES: { key: EmailTemplateType; label: string; desc: string }[] = [
    { key: "cold",     label: "Kold",       desc: "Første henvendelse" },
    { key: "followup", label: "Follow-up",  desc: "Opfølgning" },
    { key: "customer", label: "Kunde",      desc: "Eksisterende kunde" },
  ];

  if (sentSuccess) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl p-10 flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <p className="text-lg font-bold text-slate-800">Email sendt!</p>
          <p className="text-sm text-slate-500">Lead markeret som kontaktet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-screen sm:max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-800">Send email til {lead.name}</h2>
            {smtpOk === false && (
              <p className="text-xs text-amber-600 font-medium mt-0.5">⚠ Gmail ikke konfigureret — gå til Indstillinger</p>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 transition text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab bar: Compose / Preview */}
        <div className="flex border-b border-slate-100 px-6">
          {(["compose", "preview"] as ViewMode[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              disabled={v === "preview" && !htmlBody}
              className={`py-2.5 px-4 text-sm font-semibold border-b-2 transition ${
                view === v
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-700 disabled:opacity-40"
              }`}
            >
              {v === "compose" ? "Opsætning" : "Forhåndsvisning"}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {view === "compose" ? (
            <div className="p-6 space-y-5">
              {/* Template type */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Email-type</label>
                <div className="grid grid-cols-3 gap-2">
                  {TYPES.map(t => (
                    <button
                      key={t.key}
                      onClick={() => setType(t.key)}
                      className={`py-2.5 px-3 rounded-xl text-sm font-semibold border-2 text-left transition ${
                        type === t.key
                          ? "border-blue-600 bg-blue-50 text-blue-800"
                          : "border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      <div className="font-bold">{t.label}</div>
                      <div className="text-[11px] font-normal opacity-70">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Recipient */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Email *</label>
                  <input
                    type="email"
                    value={to}
                    onChange={e => setTo(e.target.value)}
                    placeholder="navn@firma.dk"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Modtagers navn</label>
                  <input
                    type="text"
                    value={toName}
                    onChange={e => setToName(e.target.value)}
                    placeholder="Lars Hansen"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Subject */}
              {subject && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Emnelinje</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {/* Lead info summary */}
              <div className="bg-slate-50 rounded-xl p-4 space-y-1.5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">AI bruger denne info</p>
                {lead.industry && <p className="text-xs text-slate-600">🏢 Branche: {lead.industry}</p>}
                {(lead.platforms?.length || 0) > 0 && <p className="text-xs text-slate-600">📱 Annoncerer på: {lead.platforms!.join(", ")}</p>}
                {lead.oohReason && <p className="text-xs text-slate-600">🎯 OOH potentiale: {lead.oohReason}</p>}
                {lead.egenkapital && <p className="text-xs text-slate-600">💰 Egenkapital: {(lead.egenkapital / 1_000_000).toFixed(1)}M kr.</p>}
                {!lead.industry && !lead.oohReason && <p className="text-xs text-slate-400 italic">Begrænset info — kør berigelse for bedre emails</p>}
              </div>

              {/* Custom context */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  Tilføj kontekst (valgfri)
                </label>
                <textarea
                  value={customContext}
                  onChange={e => setCustomContext(e.target.value)}
                  rows={2}
                  placeholder="fx: Mødte dem til et event, de har netop åbnet ny butik, de kender vores logo..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
              )}

              {/* Generate button */}
              <button
                onClick={generateEmail}
                disabled={generating || !to.includes("@")}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 text-white text-sm font-bold rounded-xl shadow hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {generating
                  ? <><span className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" /> Genererer…</>
                  : <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>Generer email med AI</>
                }
              </button>
            </div>
          ) : (
            /* Preview tab */
            <div className="flex flex-col h-full">
              {/* Preview header */}
              <div className="px-6 py-4 border-b border-slate-100 space-y-2 bg-slate-50">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-500 w-16 shrink-0">Til:</span>
                  <span className="font-medium text-slate-800">{toName ? `${toName} <${to}>` : to}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-500 w-16 shrink-0">Emne:</span>
                  <input
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Email preview */}
              <div className="flex-1 overflow-y-auto bg-slate-100 p-4">
                <iframe
                  srcDoc={htmlBody}
                  className="w-full bg-white rounded-xl shadow-sm border border-slate-200"
                  style={{ height: "500px" }}
                  title="Email preview"
                  sandbox="allow-same-origin"
                />
              </div>

              {/* Actions */}
              <div className="px-6 py-4 border-t border-slate-100 flex items-center gap-3">
                <button
                  onClick={() => setView("compose")}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
                >
                  ← Rediger
                </button>
                <button
                  onClick={generateEmail}
                  disabled={generating}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-50 transition"
                >
                  {generating ? "Genererer…" : "↺ Regenerér"}
                </button>
                <button
                  onClick={sendEmail}
                  disabled={sending || smtpOk === false}
                  className="ml-auto inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-xl shadow hover:bg-emerald-700 disabled:opacity-50 transition"
                >
                  {sending
                    ? <><span className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" /> Sender…</>
                    : <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>Send email</>
                  }
                </button>
              </div>

              {error && (
                <div className="px-6 pb-4">
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
