"use client";

/**
 * Shared icon component using Heroicons SVG paths.
 * Replaces the duplicated `Ic` helpers across OOHPanel, OOHOutreach, and TemplateEditor.
 */
export default function Ic({ d, className = "w-4 h-4" }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}
