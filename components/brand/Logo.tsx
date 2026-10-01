export const MARK_INK = "#0b0b0c";
export const MARK_ACCENT = "#3b71f0";

type MarkProps = {
  size?: number;
  className?: string;
  /** Accessible name. Omit when the mark sits next to the word "Unflinch". */
  title?: string;
};

/**
 * A level trace that holds flat, then takes one step up: the ladder moving at the patient's pace.
 * Plain SVG with inline colors so it also renders inside `ImageResponse` (icon, OG cards).
 */
export function Mark({ size = 24, className, title }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path
        d="M2.5 16.5H10"
        stroke={MARK_INK}
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 16.5V7.5H21.5"
        stroke={MARK_ACCENT}
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <span className="brand-logo">
      <Mark size={size} />
      <span className="brand-logo-word">Unflinch</span>
    </span>
  );
}
