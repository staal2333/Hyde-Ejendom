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
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">OOH Proposals</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Generer mockups, Slides og PDF — send direkte til klienter
        </p>
      </div>
      <OOHPanel
        initialFrame={normalizedFrame}
        initialClient={initialClient}
        onToast={onToast}
      />
    </div>
  );
}
