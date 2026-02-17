"use client";

import type { PropertyItem } from "@/contexts/DashboardContext";

export interface OutreachData {
  stats: { queued: number; sending: number; sent: number; failed: number; totalProcessed?: number; rateLimitPerHour?: number; isProcessing?: boolean; sentThisHour: number };
  items: { id: string; propertyId: string; to: string; subject: string; body: string; contactName?: string; status: string; queuedAt: string; sentAt?: string; error?: string }[];
  gmail: { configured: boolean; working: boolean; email?: string; error?: string };
}

export interface OutreachTabProps {
  outreachData: OutreachData | null;
  outreachLoading: boolean;
  fetchOutreachData: () => Promise<void>;
  readyToSend: PropertyItem[];
  selectedForSend: Set<string>;
  setSelectedForSend: React.Dispatch<React.SetStateAction<Set<string>>>;
  emailPreview: { propertyId: string; to: string; subject: string; body: string; contactName?: string; attachmentUrl?: string } | null;
  setEmailPreview: React.Dispatch<React.SetStateAction<{ propertyId: string; to: string; subject: string; body: string; contactName?: string; attachmentUrl?: string } | null>>;
  editingEmail: { subject: string; body: string; attachmentUrl?: string } | null;
  setEditingEmail: React.Dispatch<React.SetStateAction<{ subject: string; body: string; attachmentUrl?: string } | null>>;
  sendSingleEmail: (propertyId: string, attachmentUrl?: string) => void;
  sendBatchEmails: () => void;
  ResultStat: React.ComponentType<{ label: string; value: number; icon: string; color?: string }>;
}

export function OutreachTab({
  outreachData,
  outreachLoading,
  fetchOutreachData,
  readyToSend,
  selectedForSend,
  setSelectedForSend,
  emailPreview,
  setEmailPreview,
  editingEmail,
  setEditingEmail,
  sendSingleEmail,
  sendBatchEmails,
  ResultStat,
}: OutreachTabProps) {
  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Outreach</h1>
            <p className="text-xs text-slate-500 mt-0.5">Godkend, rediger og send emails</p>
          </div>
          <div>
            <button onClick={fetchOutreachData} disabled={outreachLoading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              <svg className={`w-4 h-4 ${outreachLoading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
              </svg>
              Opdater
            </button>
          </div>
        </div>
      </div>

      {outreachData && (
        <div className={`mb-6 p-4 rounded-2xl border ${
          outreachData.gmail.working ? "bg-green-50 border-green-200/80" :
          outreachData.gmail.configured ? "bg-amber-50 border-amber-200/80" :
          "bg-red-50 border-red-200/80"
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${outreachData.gmail.working ? "bg-green-500" : outreachData.gmail.configured ? "bg-amber-500 animate-pulse" : "bg-red-500"}`} />
            <span className={`text-sm font-semibold ${outreachData.gmail.working ? "text-green-800" : outreachData.gmail.configured ? "text-amber-800" : "text-red-800"}`}>
              {outreachData.gmail.working ? `Gmail API tilsluttet: ${outreachData.gmail.email}` :
               outreachData.gmail.configured ? `Gmail konfigureret, men fejl: ${outreachData.gmail.error}` :
               "Gmail API ikke konfigureret"}
            </span>
            {outreachData.gmail.working && outreachData.stats && (
              <span className="ml-auto text-xs font-medium text-green-600 bg-green-100 px-2.5 py-1 rounded-full">
                {outreachData.stats.sentThisHour}/{outreachData.stats.rateLimitPerHour ?? 0} sendt denne time
              </span>
            )}
          </div>
        </div>
      )}

      {outreachData && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <ResultStat label="Klar til afsendelse" value={readyToSend.length} icon="M4.5 12.75l6 6 9-13.5" color="brand" />
          <ResultStat label="I koe" value={outreachData.stats.queued} icon="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75" />
          <ResultStat label="Sendt i dag" value={outreachData.stats.sent} icon="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" color="green" />
          <ResultStat label="Fejlet" value={outreachData.stats.failed} icon="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0z" color={outreachData.stats.failed > 0 ? "red" : undefined} />
          <ResultStat label="Sender nu" value={outreachData.stats.sending} icon="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" color={outreachData.stats.sending > 0 ? "brand" : undefined} />
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <span className="font-bold text-sm text-slate-900">Klar til godkendelse</span>
              <span className="text-xs text-slate-400 ml-2">{readyToSend.length} ejendomme</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {readyToSend.length > 0 && (
              <>
                <button onClick={() => {
                  if (selectedForSend.size === readyToSend.length) {
                    setSelectedForSend(new Set());
                  } else {
                    setSelectedForSend(new Set(readyToSend.map(p => p.id)));
                  }
                }}
                  className="text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-50">
                  {selectedForSend.size === readyToSend.length ? "Fravaalg alle" : "Vaalg alle"}
                </button>
                <button onClick={sendBatchEmails} disabled={selectedForSend.size === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                  Send {selectedForSend.size} valgte
                </button>
              </>
            )}
          </div>
        </div>

        {readyToSend.length === 0 ? (
          <div className="p-12 text-center">
            <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75" />
            </svg>
            <p className="text-sm text-slate-500">Ingen ejendomme klar til udsendelse endnu</p>
            <p className="text-xs text-slate-400 mt-1">Koer Gade-Agenten eller Research for at generere email-udkast</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {readyToSend.map((prop) => (
              <div key={prop.id} className="px-6 py-4 flex items-start gap-4 hover:bg-slate-50/50 transition-colors">
                <input type="checkbox" checked={selectedForSend.has(prop.id)}
                  onChange={(e) => {
                    setSelectedForSend(prev => {
                      const next = new Set(prev);
                      e.target.checked ? next.add(prop.id) : next.delete(prop.id);
                      return next;
                    });
                  }}
                  className="mt-1 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="font-semibold text-sm text-slate-900 truncate">{prop.address}</span>
                    {prop.ownerCompanyName && (
                      <span className="text-xs text-slate-500 truncate">{prop.ownerCompanyName}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span>Til: <span className="font-medium text-slate-700">{prop.primaryContact?.email ?? prop.contactEmail ?? "?"}</span></span>
                    <span>Kontakt: {prop.primaryContact?.name ?? prop.contactPerson ?? "?"}</span>
                    {prop.emailDraftSubject && (
                      <span className="truncate max-w-xs text-slate-400">Emne: {prop.emailDraftSubject}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => {
                    setEmailPreview({
                      propertyId: prop.id,
                      to: prop.primaryContact?.email ?? prop.contactEmail ?? "",
                      subject: prop.emailDraftSubject ?? "",
                      body: prop.emailDraftBody ?? "",
                      contactName: prop.primaryContact?.name ?? prop.contactPerson ?? undefined,
                    });
                    setEditingEmail({ subject: prop.emailDraftSubject ?? "", body: prop.emailDraftBody ?? "" });
                  }}
                    className="text-xs font-medium text-brand-600 hover:text-brand-700 px-3 py-1.5 rounded-lg hover:bg-brand-50">
                    Se / Rediger
                  </button>
                  <button onClick={() => sendSingleEmail(prop.id)}
                    className="text-xs font-medium text-emerald-600 hover:text-emerald-700 px-3 py-1.5 rounded-lg hover:bg-emerald-50">
                    Send
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {emailPreview && editingEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setEmailPreview(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Email-udkast</h3>
              <button onClick={() => setEmailPreview(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">TIL</label>
                <div className="text-sm text-slate-700 bg-slate-50 px-3 py-2 rounded-lg">{emailPreview.contactName ? `${emailPreview.contactName} <${emailPreview.to}>` : emailPreview.to}</div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">FRA</label>
                <div className="text-sm text-slate-700 bg-slate-50 px-3 py-2 rounded-lg">mads.ejendomme@hydemedia.dk</div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">EMNE</label>
                <input type="text" value={editingEmail.subject} onChange={(e) => setEditingEmail(prev => prev ? { ...prev, subject: e.target.value } : prev)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-indigo-300" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">INDHOLD</label>
                <textarea value={editingEmail.body} onChange={(e) => setEditingEmail(prev => prev ? { ...prev, body: e.target.value } : prev)}
                  rows={12}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-indigo-300 resize-y" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">BILAG (valgfrit)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    placeholder="/api/ooh/generate-pdf?proposalId=... eller tomt"
                    value={editingEmail.attachmentUrl || ""}
                    onChange={(e) => setEditingEmail(prev => prev ? { ...prev, attachmentUrl: e.target.value || undefined } : prev)}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-indigo-300"
                  />
                  {editingEmail.attachmentUrl && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-violet-50 text-violet-700 text-[10px] font-semibold rounded-lg border border-violet-200">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" /></svg>
                      PDF vedhæftet
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button onClick={() => setEmailPreview(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg">Annuller</button>
              <button onClick={() => {
                sendSingleEmail(emailPreview.propertyId, editingEmail.attachmentUrl);
                setEmailPreview(null);
              }}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors">
                {editingEmail.attachmentUrl ? "Send med PDF" : "Godkend & Send"}
              </button>
            </div>
          </div>
        </div>
      )}

      {outreachData && outreachData.items.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <span className="font-bold text-sm text-slate-900">Seneste aktivitet</span>
          </div>
          <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
            {outreachData.items.slice(0, 30).map((item) => (
              <div key={item.id} className="px-6 py-3 flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  item.status === "sent" ? "bg-green-500" :
                  item.status === "sending" ? "bg-amber-500 animate-pulse" :
                  item.status === "queued" ? "bg-blue-400" :
                  "bg-red-500"
                }`} />
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-slate-700 truncate block">{item.to}</span>
                  <span className="text-[10px] text-slate-400 truncate block">{item.subject}</span>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  item.status === "sent" ? "bg-green-100 text-green-700" :
                  item.status === "sending" ? "bg-amber-100 text-amber-700" :
                  item.status === "queued" ? "bg-blue-100 text-blue-700" :
                  "bg-red-100 text-red-700"
                }`}>
                  {item.status === "sent" ? "Sendt" : item.status === "sending" ? "Sender..." : item.status === "queued" ? "I koe" : "Fejlet"}
                </span>
                <span className="text-[10px] text-slate-400 shrink-0">{new Date(item.queuedAt).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!outreachData && (
        <div className="text-center py-12">
          <button onClick={fetchOutreachData}
            className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors">
            Hent outreach-data
          </button>
        </div>
      )}
    </div>
  );
}
