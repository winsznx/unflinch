import "server-only";

import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { Ladder, LadderSource } from "@/lib/ladder/schema";
import type { LintIssue } from "@/lib/ladder/lint";
import type { Receipt, SessionMode } from "@/lib/orbis/receipts";

import { supabaseAdmin } from "./supabase";

export type SessionRow = {
  id: string;
  code: string;
  code_expires_at: string;
  paired_at: string | null;
  phone_key: string;
  remote_key: string;
  mode: SessionMode;
  fear: string;
  feared_outcome: string | null;
  expectancy_pre: number | null;
  ladder_id: string | null;
  seed: number;
  consent_record: boolean;
  status: string;
  created_at: string;
  ended_at: string | null;
};

export type LadderRow = {
  id: string;
  fear_hash: string;
  fear: string;
  source: LadderSource;
  plan: Ladder;
  lint: LintIssue[] | null;
  created_at: string;
};

export type TrialRow = {
  id: string;
  session_id: string;
  idx: number;
  context: string | null;
  start_level: number | null;
  max_level: number | null;
  receipt: Receipt | null;
  recording_path: string | null;
  recording_sha256: string | null;
  created_at: string;
};

export type EventRow = {
  session_id: string;
  trial_idx: number | null;
  t_ms: number;
  kind: string;
  payload: unknown;
};

export type NewSession = Pick<
  SessionRow,
  "code" | "phone_key" | "remote_key" | "mode" | "fear" | "feared_outcome" | "expectancy_pre" | "seed" | "consent_record"
>;

export interface Store {
  readonly kind: "supabase" | "local";
  createSession(input: NewSession): Promise<SessionRow>;
  getSession(id: string): Promise<SessionRow | null>;
  updateSession(id: string, patch: Partial<SessionRow>): Promise<void>;
  /** Single use: succeeds only for an unpaired, unexpired code. */
  pairByCode(code: string): Promise<SessionRow | null>;
  getLadderByHash(hash: string): Promise<LadderRow | null>;
  getLadder(id: string): Promise<LadderRow | null>;
  saveLadder(row: Omit<LadderRow, "id" | "created_at">): Promise<LadderRow>;
  upsertTrial(row: Omit<TrialRow, "id" | "created_at">): Promise<TrialRow>;
  getTrial(id: string): Promise<TrialRow | null>;
  listTrials(sessionId: string): Promise<TrialRow[]>;
  listRecentTrials(limit: number): Promise<TrialRow[]>;
  insertEvents(rows: EventRow[]): Promise<void>;
  acquireSlot(holder: string, leaseS: number): Promise<boolean>;
  releaseSlot(holder: string): Promise<void>;
  slotHolder(): Promise<{ holder: string | null; leaseUntil: string | null }>;
  bumpQuota(ipHash: string, max: number): Promise<boolean>;
}

const now = () => new Date().toISOString();

class SupabaseStore implements Store {
  readonly kind = "supabase" as const;
  private db = supabaseAdmin()!;

  private async one<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T | null> {
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data as T | null) ?? null;
  }

  createSession(input: NewSession) {
    return this.one<SessionRow>(this.db.from("sessions").insert(input).select().single()) as Promise<SessionRow>;
  }
  getSession(id: string) {
    return this.one<SessionRow>(this.db.from("sessions").select().eq("id", id).maybeSingle());
  }
  async updateSession(id: string, patch: Partial<SessionRow>) {
    const { error } = await this.db.from("sessions").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  }
  pairByCode(code: string) {
    return this.one<SessionRow>(
      this.db
        .from("sessions")
        .update({ paired_at: now() })
        .eq("code", code)
        .is("paired_at", null)
        .gt("code_expires_at", now())
        .select()
        .maybeSingle(),
    );
  }
  getLadderByHash(hash: string) {
    return this.one<LadderRow>(this.db.from("ladders").select().eq("fear_hash", hash).maybeSingle());
  }
  getLadder(id: string) {
    return this.one<LadderRow>(this.db.from("ladders").select().eq("id", id).maybeSingle());
  }
  saveLadder(row: Omit<LadderRow, "id" | "created_at">) {
    return this.one<LadderRow>(
      this.db.from("ladders").upsert(row, { onConflict: "fear_hash" }).select().single(),
    ) as Promise<LadderRow>;
  }
  async upsertTrial(row: Omit<TrialRow, "id" | "created_at">) {
    const existing = await this.one<TrialRow>(
      this.db.from("trials").select().eq("session_id", row.session_id).eq("idx", row.idx).maybeSingle(),
    );
    if (existing) {
      return this.one<TrialRow>(this.db.from("trials").update(row).eq("id", existing.id).select().single()) as Promise<TrialRow>;
    }
    return this.one<TrialRow>(this.db.from("trials").insert(row).select().single()) as Promise<TrialRow>;
  }
  getTrial(id: string) {
    return this.one<TrialRow>(this.db.from("trials").select().eq("id", id).maybeSingle());
  }
  async listTrials(sessionId: string) {
    return (await this.one<TrialRow[]>(this.db.from("trials").select().eq("session_id", sessionId).order("idx"))) ?? [];
  }
  async listRecentTrials(limit: number) {
    return (
      (await this.one<TrialRow[]>(
        this.db.from("trials").select().not("receipt", "is", null).order("created_at", { ascending: false }).limit(limit),
      )) ?? []
    );
  }
  async insertEvents(rows: EventRow[]) {
    if (!rows.length) return;
    const { error } = await this.db.from("events").insert(rows);
    if (error) throw new Error(error.message);
  }
  async acquireSlot(holder: string, leaseS: number) {
    return Boolean(await this.one<boolean>(this.db.rpc("acquire_slot", { p_holder: holder, p_lease_s: leaseS })));
  }
  async releaseSlot(holder: string) {
    const { error } = await this.db.rpc("release_slot", { p_holder: holder });
    if (error) throw new Error(error.message);
  }
  async slotHolder() {
    const row = await this.one<{ holder: string | null; lease_until: string | null }>(
      this.db.from("orbis_slot").select("holder, lease_until").eq("id", 1).maybeSingle(),
    );
    const live = row?.lease_until && new Date(row.lease_until) > new Date();
    return { holder: live ? row!.holder : null, leaseUntil: live ? row!.lease_until : null };
  }
  async bumpQuota(ipHash: string, max: number) {
    return Boolean(await this.one<boolean>(this.db.rpc("bump_quota", { p_ip_hash: ipHash, p_max: max })));
  }
}

type LocalData = {
  sessions: SessionRow[];
  ladders: LadderRow[];
  trials: TrialRow[];
  events: EventRow[];
  slot: { holder: string | null; lease_until: string | null };
  quota: Record<string, number>;
};

/** Dev fallback when Supabase isn't configured (PRD §1.9 dependencies). Single process only. */
class LocalStore implements Store {
  readonly kind = "local" as const;
  private file = path.join(process.cwd(), ".data", "store.json");
  private cache: LocalData | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  private async load(): Promise<LocalData> {
    if (this.cache) return this.cache;
    try {
      this.cache = JSON.parse(await fs.readFile(this.file, "utf8")) as LocalData;
    } catch {
      this.cache = { sessions: [], ladders: [], trials: [], events: [], slot: { holder: null, lease_until: null }, quota: {} };
    }
    return this.cache;
  }

  private mutate<T>(fn: (data: LocalData) => T): Promise<T> {
    const op = this.queue.then(async () => {
      const data = await this.load();
      const result = fn(data);
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      await fs.writeFile(this.file, JSON.stringify(data));
      return result;
    });
    this.queue = op.catch(() => undefined);
    return op;
  }

  createSession(input: NewSession) {
    return this.mutate((d) => {
      const row: SessionRow = {
        ...input,
        id: randomUUID(),
        code_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
        paired_at: null,
        ladder_id: null,
        status: "created",
        created_at: now(),
        ended_at: null,
      };
      d.sessions.push(row);
      return row;
    });
  }
  async getSession(id: string) {
    return (await this.load()).sessions.find((s) => s.id === id) ?? null;
  }
  updateSession(id: string, patch: Partial<SessionRow>) {
    return this.mutate((d) => {
      const row = d.sessions.find((s) => s.id === id);
      if (row) Object.assign(row, patch);
    });
  }
  pairByCode(code: string) {
    return this.mutate((d) => {
      const row = d.sessions.find(
        (s) => s.code === code && !s.paired_at && new Date(s.code_expires_at) > new Date(),
      );
      if (!row) return null;
      row.paired_at = now();
      return row;
    });
  }
  async getLadderByHash(hash: string) {
    return (await this.load()).ladders.find((l) => l.fear_hash === hash) ?? null;
  }
  async getLadder(id: string) {
    return (await this.load()).ladders.find((l) => l.id === id) ?? null;
  }
  saveLadder(row: Omit<LadderRow, "id" | "created_at">) {
    return this.mutate((d) => {
      const existing = d.ladders.find((l) => l.fear_hash === row.fear_hash);
      if (existing) return Object.assign(existing, row);
      const created: LadderRow = { ...row, id: randomUUID(), created_at: now() };
      d.ladders.push(created);
      return created;
    });
  }
  upsertTrial(row: Omit<TrialRow, "id" | "created_at">) {
    return this.mutate((d) => {
      const existing = d.trials.find((t) => t.session_id === row.session_id && t.idx === row.idx);
      if (existing) return Object.assign(existing, row);
      const created: TrialRow = { ...row, id: randomUUID(), created_at: now() };
      d.trials.push(created);
      return created;
    });
  }
  async getTrial(id: string) {
    return (await this.load()).trials.find((t) => t.id === id) ?? null;
  }
  async listTrials(sessionId: string) {
    return (await this.load()).trials.filter((t) => t.session_id === sessionId).sort((a, b) => a.idx - b.idx);
  }
  async listRecentTrials(limit: number) {
    return (await this.load()).trials
      .filter((t) => t.receipt)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }
  insertEvents(rows: EventRow[]) {
    return this.mutate((d) => {
      d.events.push(...rows);
      if (d.events.length > 20_000) d.events.splice(0, d.events.length - 20_000);
    });
  }
  acquireSlot(holder: string, leaseS: number) {
    return this.mutate((d) => {
      const free = !d.slot.holder || !d.slot.lease_until || new Date(d.slot.lease_until) < new Date();
      if (!free && d.slot.holder !== holder) return false;
      d.slot = { holder, lease_until: new Date(Date.now() + leaseS * 1000).toISOString() };
      return true;
    });
  }
  releaseSlot(holder: string) {
    return this.mutate((d) => {
      if (d.slot.holder === holder) d.slot = { holder: null, lease_until: null };
    });
  }
  async slotHolder() {
    const { slot } = await this.load();
    const live = slot.lease_until && new Date(slot.lease_until) > new Date();
    return { holder: live ? slot.holder : null, leaseUntil: live ? slot.lease_until : null };
  }
  bumpQuota(ipHash: string, max: number) {
    return this.mutate((d) => {
      const key = `${ipHash}:${new Date().toISOString().slice(0, 10)}`;
      d.quota[key] = (d.quota[key] ?? 0) + 1;
      return d.quota[key]! <= max;
    });
  }
}

let instance: Store | null = null;

export function store(): Store {
  instance ??= supabaseAdmin() ? new SupabaseStore() : new LocalStore();
  return instance;
}
