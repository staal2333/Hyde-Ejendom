"use client";

import { formatAddressLine, formatPropertyTitle } from "@/lib/format-address";

export interface AddressDisplayProps {
  /** Primary line: name or full address */
  name?: string | null;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  /** If true, show only one line (title). If false, show title + address line when name exists. */
  singleLine?: boolean;
  className?: string;
  /** Subtitle class (location line) */
  subtitleClassName?: string;
}

/**
 * Consistent address display: title (name or address) and optional "postnr by" line.
 */
export function AddressDisplay({
  name,
  address,
  postalCode,
  city,
  singleLine = false,
  className = "",
  subtitleClassName = "text-slate-500 text-[11px]",
}: AddressDisplayProps) {
  const title = formatPropertyTitle(name, address, postalCode, city);
  const fullAddress = formatAddressLine(address, postalCode, city);
  const showSubtitle = !singleLine && name && fullAddress && title !== fullAddress;

  return (
    <div className={className}>
      <span className="font-medium text-slate-900 truncate block">{title}</span>
      {showSubtitle && (
        <span className={`${subtitleClassName} truncate block mt-0.5`}>
          {fullAddress}
        </span>
      )}
    </div>
  );
}

/** One-line address only (e.g. in tables). */
export function AddressLine({
  address,
  postalCode,
  city,
  className = "",
}: {
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  className?: string;
}) {
  return (
    <span className={className}>
      {formatAddressLine(address, postalCode, city)}
    </span>
  );
}
