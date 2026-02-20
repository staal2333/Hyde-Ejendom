"use client";

import dynamic from "next/dynamic";

const OOHPanel = dynamic(() => import("../OOHPanel"), {
  ssr: false,
  loading: () => <div className="animate-pulse rounded-2xl bg-white/[0.03] h-96" />,
});

export interface OOHInitialFrame {
  address: string;
  city: string;
  traffic: number;
  imageUrl?: string;
  type?: "scaffolding" | "facade" | "gable" | "other";
}

export interface OOHInitialClient {
  company: string;
  contactName: string;
  email: string;
}

export interface OOHTabProps {
  initialFrame: OOHInitialFrame | undefined;
  initialClient: OOHInitialClient | undefined;
  onToast: (message: string, type: "success" | "error" | "info") => void;
}

export function OOHTab({ initialFrame, initialClient, onToast }: OOHTabProps) {
  const normalizedFrame = initialFrame
    ? { ...initialFrame, type: (initialFrame.type ?? "scaffolding") as "scaffolding" | "facade" | "gable" | "other" }
    : undefined;
  return (
    <div className="animate-fade-in">
      <p className="text-xs text-slate-500 mb-4">Mockups, slides og PDF til klienter.</p>
      <OOHPanel
        initialFrame={normalizedFrame}
        initialClient={initialClient}
        onToast={onToast}
      />
    </div>
  );
}
