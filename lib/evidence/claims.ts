import manifest from "@/evidence/manifest.json";

export type ClaimStatus = "pending" | "pass" | "fail" | "withdrawn";

export type Claim = {
  id: string;
  label: string;
  metric: string;
  threshold: string;
  status: ClaimStatus;
  value: number | string | null;
  n: number;
  artifact: string;
};

export const CLAIMS = manifest.claims as Claim[];

export function claimById(id: string): Claim | undefined {
  return CLAIMS.find((claim) => claim.id === id);
}

export function formatClaimValue(claim: Claim): string {
  if (claim.status === "pending" || claim.value === null) return "Pending";
  return String(claim.value);
}
