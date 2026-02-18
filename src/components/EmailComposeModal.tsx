"use client";

import { useState, useRef, useEffect } from "react";

export interface EmailDraft {
  to: string;
  subject: string;
  body: string;
  attachmentFile?: { filename: string; content: string };
}

export interface EmailComposeModalProps {
  isOpen: boolean;
  propertyId: string;
  initialDraft: EmailDraft;
  contactName?: string;
  onClose: () => void;
  onSend: (draft: EmailDraft) => Promise<void>;
  onFileError?: (message: string) => void;
  sending?: boolean;
}

const MAX_PDF_MB = 10;

export function EmailComposeModal({
  isOpen,
  propertyId,
  initialDraft,
  contactName,
  onClose,
  onSend,
  onFileError,
  sending = false,
}: EmailComposeModalProps) {
  const [to, setTo] = useState(initialDraft.to);
  const [subject, setSubject] = useState(initialDraft.subject);
  const [body, setBody] = useState(initialDraft.body);
  const [attachmentFile, setAttachmentFile] = useState<{ filename: string; content: string } | undefined>(initialDraft.attachmentFile);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync from initialDraft when modal opens
  useEffect(() => {
    if (isOpen) {
      setTo(initialDraft.to);
      setSubject(initialDraft.subject);
      setBody(initialDraft.body);
      setAttachmentFile(initialDraft.attachmentFile);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [isOpen, initialDraft.to, initialDraft.subject, initialDraft.body, initialDraft.attachmentFile]);

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      if (file.type !== "application/pdf") {
        reject(new Error("Kun PDF-filer"));
        return;
      }
      if (file.size > MAX_PDF_MB * 1024 * 1024) {
        reject(new Error(`Max ${MAX_PDF_MB} MB`));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const b64 = typeof dataUrl === "string" && dataUrl.includes(",") ? dataUrl.split(",")[1] : "";
        resolve(b64);
      };
      reader.onerror = () => reject(new Error("Kunne ikke læse fil"));
      reader.readAsDataURL(file);
    });

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const content = await readFileAsBase64(file);
      setAttachmentFile({ filename: file.name, content });
    } catch (e) {
      onFileError?.(e instanceof Error ? e.message : "Kunne ikke tilføje fil");
    }
  };

  const handleSubmit = async () => {
    const toTrim = to.trim();
    if (!toTrim) return;
    await onSend({ to: toTrim, subject, body, attachmentFile });
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col select-text"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-bold text-slate-900">Rediger og send email</h2>
            <p className="text-xs text-slate-500 mt-0.5">Til, emne og indhold – evt. med PDF-bilag</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-50"
            aria-label="Luk"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Til (mailadresse)</label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="email@eksempel.dk"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 outline-none"
            />
            {contactName && <p className="text-xs text-slate-400 mt-1">Kontakt: {contactName}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Fra</label>
            <div className="text-sm text-slate-600 bg-slate-50 px-3 py-2 rounded-lg">mads.ejendomme@hydemedia.dk</div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Emne</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Indhold</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 outline-none resize-y"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">PDF-bilag (valgfrit)</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
            {!attachmentFile ? (
              <div
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                  isDragging ? "border-violet-500 bg-violet-50" : "border-slate-200 hover:border-violet-300 hover:bg-slate-50/50"
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFile(f).catch(() => {});
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <svg className="w-10 h-10 text-slate-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <p className="text-sm font-medium text-slate-600">Træk en PDF hertil eller klik for at vælge</p>
                <p className="text-xs text-slate-400 mt-0.5">Kun PDF, max {MAX_PDF_MB} MB</p>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 px-4 py-3 bg-violet-50 border border-violet-200 rounded-xl">
                <div className="flex items-center gap-2 min-w-0">
                  <svg className="w-5 h-5 text-violet-600 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <span className="text-sm font-medium text-violet-800 truncate">{attachmentFile.filename}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAttachmentFile(undefined)}
                  disabled={sending}
                  className="text-xs font-semibold text-violet-600 hover:text-violet-800 disabled:opacity-50"
                >
                  Fjern
                </button>
              </div>
            )}
          </div>
        </div>

        <footer className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
          <button type="button" onClick={onClose} disabled={sending} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg disabled:opacity-50">
            Annuller
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={sending || !to.trim()}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors inline-flex items-center gap-2"
          >
            {sending ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                Sender…
              </>
            ) : attachmentFile ? (
              "Send med PDF"
            ) : (
              "Godkend og send"
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}
