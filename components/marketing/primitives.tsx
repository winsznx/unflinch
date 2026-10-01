import type { ReactNode } from "react";

type TileTone = "accent" | "strong" | "soft";

/** The 34px glyph tile from the closeout provider marks, recoloured by tone. */
export function Tile({
  tone = "soft",
  mono = false,
  children,
}: {
  tone?: TileTone;
  mono?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`m-provider m-provider-${tone}${mono ? " m-provider-mono" : ""}`}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

export function Badge({ keep = false, children }: { keep?: boolean; children: ReactNode }) {
  return <span className={`m-badge ${keep ? "m-keep" : "m-close"}`}>{children}</span>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="m-eyebrow">
      <span className="m-small-mark" aria-hidden="true">
        ✳
      </span>
      {children}
    </span>
  );
}

export function OrbisGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-20 12 12)" />
    </svg>
  );
}

export function PhoneGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </svg>
  );
}

export function ScaleGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="4" y="13" width="3.5" height="7" rx="1" />
      <rect x="10.25" y="9" width="3.5" height="11" rx="1" />
      <rect x="16.5" y="4" width="3.5" height="16" rx="1" />
    </svg>
  );
}

export function RemoteGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="3" />
      <path d="M3 19c0-2.8 2.2-5 5-5s5 2.2 5 5" />
      <path d="M15 6.5c1.6 1.4 1.6 3.6 0 5M18 4c3 2.8 3 7.2 0 10" />
    </svg>
  );
}
