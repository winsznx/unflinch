import { ImageResponse } from "next/og";
import type { ReactNode } from "react";

import { MARK_ACCENT, Mark } from "@/components/brand/Logo";
import { CLAIMS, type ClaimStatus } from "@/lib/evidence/claims";

const WIDTH = 1200;
const HEIGHT = 630;
const INK = "#0b0b0c";
const INK_SECONDARY = "#5b6270";
const INK_MUTED = "#8a909c";
const PANEL = "#f4f5f7";
const BORDER = "#e7e9ee";

const MAX_PARAM_LENGTH = 48;
const MAX_LEVEL_POINTS = 64;
const MAX_LEVEL = 10;

type OgKind = "home" | "try" | "start" | "run" | "proof" | "private";

const HEADLINES: Record<OgKind, string> = {
  home: "Face your fear at your pace",
  try: "Try Unflinch live",
  start: "Start a session",
  run: "Live run",
  proof: "Unflinch proof campaign",
  private: "Unflinch session",
};

const STATUS_STYLE: Record<ClaimStatus, { background: string; color: string }> = {
  pending: { background: "#ffffff", color: INK_MUTED },
  pass: { background: "#e6f7f0", color: "#17a673" },
  fail: { background: "#fdecec", color: "#d93b3b" },
  withdrawn: { background: "#ebedf1", color: INK_SECONDARY },
};

function isOgKind(raw: string | null): raw is OgKind {
  return raw !== null && Object.hasOwn(HEADLINES, raw);
}

function cleanParam(raw: string | null): string | null {
  const value = raw?.trim();
  return value ? value.slice(0, MAX_PARAM_LENGTH) : null;
}

function parseLevels(raw: string | null): number[] {
  if (!raw) return [];
  const levels = raw
    .split(",")
    .slice(0, MAX_LEVEL_POINTS)
    .map((part) => Number.parseInt(part, 10));
  if (levels.some((level) => !Number.isInteger(level) || level < 0 || level > MAX_LEVEL)) return [];
  return levels;
}

function LevelSparkline({ levels }: { levels: number[] }) {
  const width = 640;
  const height = 120;
  const top = Math.max(...levels, 1);
  const stepWidth = width / levels.length;
  const y = (level: number) => height - 6 - (level / top) * (height - 12);
  const points = levels.flatMap((level, index) => [
    `${index * stepWidth},${y(level)}`,
    `${(index + 1) * stepWidth},${y(level)}`,
  ]);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={MARK_ACCENT}
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RunDetails({ params }: { params: URLSearchParams }) {
  const facts = [
    ["fear", cleanParam(params.get("fear"))],
    ["cuts", cleanParam(params.get("cuts"))],
    ["resp", cleanParam(params.get("resp"))],
  ].filter((entry): entry is [string, string] => entry[1] !== null);
  const levels = parseLevels(params.get("levels"));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {facts.length > 0 ? (
        <div style={{ display: "flex", fontSize: 30, color: INK_SECONDARY, letterSpacing: "0.01em" }}>
          {facts.map(([key, value]) => `${key} ${value}`).join("  ·  ")}
        </div>
      ) : null}
      {levels.length > 1 ? <LevelSparkline levels={levels} /> : null}
    </div>
  );
}

function ProofGrid() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, width: 960 }}>
      {CLAIMS.slice(0, 9).map((claim) => {
        const style = STATUS_STYLE[claim.status];
        return (
          <div
            key={claim.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              width: 310,
              padding: "14px 22px",
              borderRadius: 999,
              border: `1px solid ${BORDER}`,
              background: style.background,
              fontSize: 22,
            }}
          >
            <span style={{ color: INK }}>{claim.id}</span>
            <span style={{ color: style.color }}>{claim.status}</span>
          </div>
        );
      })}
    </div>
  );
}

function Card({ headline, children }: { headline: string; children?: ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        padding: 40,
        background: "#ffffff",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "52px 60px",
          borderRadius: 32,
          background: PANEL,
          color: INK,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Mark size={48} />
          <span style={{ fontSize: 34, letterSpacing: "-0.02em" }}>Unflinch</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
          <div style={{ display: "flex", fontSize: 76, lineHeight: 1.04, letterSpacing: "-0.035em" }}>
            {headline}
          </div>
          {children}
        </div>
        <div style={{ display: "flex", fontSize: 22, color: INK_MUTED }}>
          Not a medical device · Visko Orbis via Reactor
        </div>
      </div>
    </div>
  );
}

export function GET(request: Request): ImageResponse {
  const params = new URL(request.url).searchParams;
  const rawKind = params.get("kind");
  const kind: OgKind = isOgKind(rawKind) ? rawKind : "home";

  const body =
    kind === "run" ? <RunDetails params={params} /> : kind === "proof" ? <ProofGrid /> : null;

  return new ImageResponse(<Card headline={HEADLINES[kind]}>{body}</Card>, {
    width: WIDTH,
    height: HEIGHT,
  });
}
