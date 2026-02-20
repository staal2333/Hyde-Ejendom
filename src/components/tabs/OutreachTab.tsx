"use client";

import { useState, useEffect } from "react";
import type { PropertyItem } from "@/contexts/DashboardContext";
import { EmailComposeModal, type EmailDraft } from "@/components/EmailComposeModal";

export type ReplyCategory = "positive_interest" | "rejection" | "question" | "meeting_request" | "unclear";

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
  sendSingleEmail: (propertyId: string, opts?: { attachmentUrl?: string; attachmentFile?: { filename: string; content: string }; subject?: string; body?: string; to?: string }) => Promise<boolean>;
  sendBatchEmails: () => void;
  ResultStat: React.ComponentType<{ label: string; value: number; icon: string; color?: string }>;
  addToast: (message: string, type: "success" | "error" | "info") => void;
}

export function OutreachTab({
  outreachData,
  outreachLoading,
  fetchOutreachData,
  readyToSend,
  selectedForSend,
  setSelectedForSend,
  sendSingleEmail,
  sendBatchEmails,
  ResultStat,
  addToast,
}: OutreachTabProps) {
  const [inboxThreads, setInboxThreads] = useState<{ id: string; subject?: string; snippet?: string; propertyId: string | null }[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [replyPanel, setReplyPanel] = useState<{
    threadId: string;
    propertyId: string;
    to: string;
    contactName?: string;
    messages: { from: string; date: string; bodyPlain: string; snippet: string }[];
    subject: string;
  } | null>(null);
  const [replyDraft, setReplyDraft] = useState<{ subject: string; body: string; category?: ReplyCategory } | null>(null);
  const [replyDraftLoading, setReplyDraftLoading] = useState(false);
  const [replySending, setReplySending] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [followUpCandidates, setFollowUpCandidates] = useState<{ propertyId: string; sentAt: string }[]>([]);
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpPreparing, setFollowUpPreparing] = useState(false);

  // Compose modal: state lives here; modal owns form fields
  const [compose, setCompose] = useState<{
    propertyId: string;
    to: string;
    subject: string;
    body: string;
    contactName?: string;
  } | null>(null);
  const [composeSending, setComposeSending] = useState(false);

  const fetchInbox = async () => {
    setInboxLoading(true);
    try {
      const res = await fetch("/api/mail/inbox");
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.threads) {
        setInboxThreads(data.threads);
      }
    } finally {
      setInboxLoading(false);
    }
  };

  // Auto-refresh inbox every 5 min when Outreach tab is mounted
  useEffect(() => {
    const t = setInterval(fetchInbox, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const fetchFollowUpCandidates = async () => {
    setFollowUpLoading(true);
    try {
      const res = await fetch("/api/mail/follow-up-candidates?days=7");
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.candidates) setFollowUpCandidates(data.candidates);
    } finally {
      setFollowUpLoading(false);
    }
  };

  const prepareFollowUpDrafts = async () => {
    if (followUpCandidates.length === 0) {
      addToast("Ingen kandidater til opfølgning", "info");
      return;
    }
    setFollowUpPreparing(true);
    try {
      const res = await fetch("/api/mail/prepare-follow-ups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 7, limit: 20 }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        addToast(
          data.prepared > 0
            ? `${data.prepared} opfølgning-udkast genereret og gemt på ejendomme. Gå til Ejendomme (filter: Første mail sendt) for at sende.`
            : "Ingen nye udkast (evt. allerede genereret).",
          data.prepared > 0 ? "success" : "info"
        );
        fetchFollowUpCandidates();
      } else {
        addToast(data.error || "Kunne ikke generere udkast", "error");
      }
    } catch {
      addToast("Fejl ved generering af opfølgning-udkast", "error");
    } finally {
      setFollowUpPreparing(false);
    }
  };

  useEffect(() => {
    fetchFollowUpCandidates();
  }, []);

  const openThread = async (threadId: string, propertyId: string | null) => {
    if (!propertyId) return;
    try {
      const res = await fetch(`/api/mail/threads/${threadId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.thread) {
        addToast("Kunne ikke hente tråd", "error");
        return;
      }
      const thread = data.thread as { id: string; subject: string; messages: { from: string; date: string; bodyPlain: string; snippet: string }[] };
      const lastMsg = thread.messages[thread.messages.length - 1];
      const to = lastMsg?.from?.match(/<([^>]+)>/)?.[1] || lastMsg?.from || "";
      setReplyPanel({
        threadId,
        propertyId,
        to,
        messages: thread.messages,
        subject: thread.subject || "",
      });
      setReplyDraft(null);
    } catch {
      addToast("Fejl ved indlæsning af tråd", "error");
    }
  };

  const generateReplyDraft = async () => {
    if (!replyPanel) return;
    setReplyDraftLoading(true);
    try {
      const res = await fetch("/api/mail/reply-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: replyPanel.threadId, propertyId: replyPanel.propertyId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.subject != null) {
        setReplyDraft({ subject: data.subject, body: data.body || "", category: data.category });
      } else {
        addToast(data.error || "Kunne ikke generere udkast", "error");
      }
    } catch {
      addToast("Fejl ved generering af svar", "error");
    } finally {
      setReplyDraftLoading(false);
    }
  };

  const updatePropertyStatus = async (propertyId: string, outreachStatus: string) => {
    setStatusUpdating(true);
    try {
      const res = await fetch(`/api/properties/${propertyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outreach_status: outreachStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        addToast("Status opdateret", "success");
        fetchOutreachData();
        fetchFollowUpCandidates();
      } else {
        addToast(data.error || "Kunne ikke opdatere status", "error");
      }
    } catch {
      addToast("Fejl ved opdatering", "error");
    } finally {
      setStatusUpdating(false);
    }
  };

  const sendReply = async () => {
    if (!replyPanel || !replyDraft) return;
    setReplySending(true);
    try {
      const res = await fetch("/api/mail/send-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: replyPanel.threadId,
          to: replyPanel.to,
          subject: replyDraft.subject,
          body: replyDraft.body,
          propertyId: replyPanel.propertyId,
          contactName: replyPanel.contactName,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        addToast("Svar sendt", "success");
        setReplyPanel(null);
        setReplyDraft(null);
        fetchOutreachData();
      } else {
        addToast(data.error || "Kunne ikke sende svar", "error");
      }
    } catch {
      addToast("Fejl ved afsendelse", "error");
    } finally {
      setReplySending(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center justify-between">
        <p className="text-xs text-slate-500">Godkend og send emails.</p>
        <button onClick={fetchOutreachData} disabled={outreachLoading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              <svg className={`w-4 h-4 ${outreachLoading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
              </svg>
              Opdater
            </button>
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
                  <button
                    onClick={() =>
                      setCompose({
                        propertyId: prop.id,
                        to: prop.primaryContact?.email ?? prop.contactEmail ?? "",
                        subject: prop.emailDraftSubject ?? "",
                        body: prop.emailDraftBody ?? "",
                        contactName: prop.primaryContact?.name ?? prop.contactPerson ?? undefined,
                      })
                    }
                    className="text-xs font-medium text-brand-600 hover:text-brand-700 px-3 py-1.5 rounded-lg hover:bg-brand-50"
                  >
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

      <EmailComposeModal
        isOpen={!!compose}
        propertyId={compose?.propertyId ?? ""}
        initialDraft={{
          to: compose?.to ?? "",
          subject: compose?.subject ?? "",
          body: compose?.body ?? "",
        }}
        contactName={compose?.contactName}
        onClose={() => setCompose(null)}
        sending={composeSending}
        onFileError={(msg) => addToast(msg, "error")}
        onSend={async (draft: EmailDraft) => {
          if (!compose) return;
          setComposeSending(true);
          try {
            if (draft.to.trim() !== compose.to.trim()) {
              const res = await fetch(`/api/properties/${compose.propertyId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mailadresse: draft.to.trim() }),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                addToast(data.error || "Kunne ikke opdatere mailadresse", "error");
                return;
              }
              addToast("Mailadresse opdateret i HubSpot", "success");
            }
            const ok = await sendSingleEmail(compose.propertyId, {
              to: draft.to.trim(),
              subject: draft.subject,
              body: draft.body,
              attachmentFile: draft.attachmentFile,
            });
            if (ok) setCompose(null);
          } finally {
            setComposeSending(false);
          }
        }}
      />

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

      {/* Opfølgning – ejendomme uden svar 7+ dage */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] overflow-hidden mt-6">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <span className="font-bold text-sm text-slate-900">Opfølgning</span>
              <span className="text-xs text-slate-400 ml-2">Første mail sendt for 7+ dage siden – ingen svar endnu</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchFollowUpCandidates} disabled={followUpLoading}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-amber-600 bg-amber-50 rounded-lg hover:bg-amber-100 disabled:opacity-50">
              {followUpLoading ? <span className="animate-spin">↻</span> : "Opdater"}
            </button>
            {followUpCandidates.length > 0 && (
              <button onClick={prepareFollowUpDrafts} disabled={followUpPreparing}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50">
                {followUpPreparing ? "Genererer…" : "Generer opfølgning-udkast"}
              </button>
            )}
          </div>
        </div>
        <div className="p-4">
          {followUpCandidates.length === 0 && !followUpLoading && (
            <p className="text-sm text-slate-500">Ingen ejendomme der er klar til opfølgning lige nu.</p>
          )}
          {followUpCandidates.length > 0 && (
            <p className="text-sm text-slate-700">
              <strong>{followUpCandidates.length}</strong> ejendomme kan få opfølgning. Klik <strong>Generer opfølgning-udkast</strong> for at lade AI lave udkast på hver (gemmes i HubSpot). Derefter kan du under <strong>Ejendomme</strong> (filter: Første mail sendt) godkende og sende.
            </p>
          )}
        </div>
      </div>

      {/* Indbakke – svar på tilbagesvar */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] overflow-hidden mt-6">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
              <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <div>
              <span className="font-bold text-sm text-slate-900">Indbakke – svar på tilbagesvar</span>
              <span className="text-xs text-slate-400 ml-2">Tråde koblet til ejendomme</span>
            </div>
          </div>
          <button onClick={fetchInbox} disabled={inboxLoading}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 disabled:opacity-50">
            {inboxLoading ? <span className="animate-spin">↻</span> : "Opdater indbakke"}
          </button>
        </div>
        <div className="p-4 max-h-[280px] overflow-y-auto">
          {inboxThreads.length === 0 && !inboxLoading && (
            <p className="text-sm text-slate-500 text-center py-6">Klik &quot;Opdater indbakke&quot; for at hente tråde. Kun tråde med tilhørende ejendom vises.</p>
          )}
          {inboxThreads.filter((t) => t.propertyId).length === 0 && inboxThreads.length > 0 && !inboxLoading && (
            <p className="text-sm text-slate-500 text-center py-6">Ingen tråde med koblet ejendom. Send mails fra Ejendomme/Outreach for at opbygge kobling.</p>
          )}
          <ul className="space-y-2">
            {inboxThreads.filter((t) => t.propertyId).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2 px-3 rounded-xl hover:bg-slate-50 border border-slate-100">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-800 truncate">{t.snippet || t.subject || t.id}</p>
                  <p className="text-[10px] text-slate-400">Ejendom-ID: {t.propertyId}</p>
                </div>
                <button onClick={() => openThread(t.id, t.propertyId!)}
                  className="shrink-0 px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100">
                  Åbn og svar
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Reply panel modal */}
      {replyPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) setReplyPanel(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Svar på tilbagesvar</h3>
              <button onClick={() => { setReplyPanel(null); setReplyDraft(null); }} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 max-h-[200px] overflow-y-auto space-y-3">
                <p className="text-[10px] font-semibold text-slate-400 uppercase">Tråd</p>
                {replyPanel.messages.map((m, i) => (
                  <div key={i} className="text-sm">
                    <p className="text-xs text-slate-500 mb-0.5">{m.from} · {m.date}</p>
                    <p className="text-slate-700 whitespace-pre-wrap">{m.bodyPlain || m.snippet}</p>
                  </div>
                ))}
              </div>
              {!replyDraft ? (
                <button onClick={generateReplyDraft} disabled={replyDraftLoading}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-semibold rounded-xl transition-colors">
                  {replyDraftLoading ? "Genererer AI-udkast…" : "Generer svar-udkast (AI)"}
                </button>
              ) : (
                <>
                  {replyDraft.category && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500">Klassifikation:</span>
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                        replyDraft.category === "rejection" ? "bg-red-100 text-red-800" :
                        replyDraft.category === "positive_interest" || replyDraft.category === "meeting_request" ? "bg-emerald-100 text-emerald-800" :
                        replyDraft.category === "question" ? "bg-amber-100 text-amber-800" :
                        "bg-slate-100 text-slate-700"
                      }`}>
                        {replyDraft.category === "rejection" ? "Afvisning" :
                         replyDraft.category === "positive_interest" ? "Interesse" :
                         replyDraft.category === "meeting_request" ? "Mødeønsker" :
                         replyDraft.category === "question" ? "Spørgsmål" : "Uklar"}
                      </span>
                      {(replyDraft.category === "rejection" || replyDraft.category === "positive_interest" || replyDraft.category === "meeting_request") && (
                        <div className="flex gap-2 ml-2">
                          {replyDraft.category === "rejection" && (
                            <button onClick={() => replyPanel && updatePropertyStatus(replyPanel.propertyId, "LUKKET_TABT")}
                              disabled={statusUpdating}
                              className="px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50">
                              Luk ejendom
                            </button>
                          )}
                          {(replyDraft.category === "positive_interest" || replyDraft.category === "meeting_request") && (
                            <button onClick={() => replyPanel && updatePropertyStatus(replyPanel.propertyId, "SVAR_MODTAGET")}
                              disabled={statusUpdating}
                              className="px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 disabled:opacity-50">
                              Markér som interesseret
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Emne</label>
                    <input type="text" value={replyDraft.subject} onChange={(e) => setReplyDraft((p) => p ? { ...p, subject: e.target.value } : p)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-indigo-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Svar (rediger efter behov)</label>
                    <textarea value={replyDraft.body} onChange={(e) => setReplyDraft((p) => p ? { ...p, body: e.target.value } : p)}
                      rows={8} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-indigo-300 resize-y" />
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={generateReplyDraft} disabled={replyDraftLoading}
                      className="px-3 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                      Genér udkast igen
                    </button>
                    <button onClick={sendReply} disabled={replySending}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-sm font-semibold rounded-xl transition-colors">
                      {replySending ? "Sender…" : "Godkend og send svar"}
                    </button>
                  </div>
                </>
              )}
            </div>
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
