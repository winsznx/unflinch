/**
 * Writes evidence/hashes.json: SHA-256 and size of every committed evidence file, so /proof and
 * anyone with a clone can check that the published evidence is what's in the repo.
 * pnpm build:evidence
 */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const EVIDENCE = "evidence";
const OUT = `${EVIDENCE}/hashes.json`;
const EXCLUDED_DIRS = [`${EVIDENCE}/controller/ts`];

type Rule = { negate: boolean; dirOnly: boolean; pattern: RegExp };

function globToRegExp(glob: string, anchored: boolean): RegExp {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i]!;
    if (char === "*" && glob[i + 1] === "*") {
      source += ".*";
      i++;
      if (glob[i + 1] === "/") i++;
    } else if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`${anchored ? "^" : "(^|/)"}${source}$`);
}

/** The subset of .gitignore syntax this repo uses: comments, negation, anchors, dir-only, * and **. */
async function loadIgnoreRules(): Promise<Rule[]> {
  let text: string;
  try {
    text = await fs.readFile(path.join(ROOT, ".gitignore"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const negate = line.startsWith("!");
      let body = negate ? line.slice(1) : line;
      const dirOnly = body.endsWith("/");
      if (dirOnly) body = body.slice(0, -1);
      const anchored = body.includes("/");
      return { negate, dirOnly, pattern: globToRegExp(body.replace(/^\//, ""), anchored) };
    });
}

function ignored(rules: Rule[], rel: string, isDir: boolean): boolean {
  let result = false;
  for (const rule of rules) {
    if (rule.dirOnly && !isDir) continue;
    if (rule.pattern.test(rel)) result = !rule.negate;
  }
  return result;
}

async function walk(rules: Rule[], dir: string, out: string[]): Promise<void> {
  const entries = await fs.readdir(path.join(ROOT, dir), { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.includes(rel) || ignored(rules, rel, true)) continue;
      await walk(rules, rel, out);
    } else if (entry.isFile() && rel !== OUT && !ignored(rules, rel, false)) {
      out.push(rel);
    }
  }
}

async function main(): Promise<void> {
  const rules = await loadIgnoreRules();
  const files: string[] = [];
  await walk(rules, EVIDENCE, files);

  const hashes: Record<string, { sha256: string; bytes: number }> = {};
  for (const file of files) {
    const data = await fs.readFile(path.join(ROOT, file));
    hashes[file] = { sha256: createHash("sha256").update(data).digest("hex"), bytes: data.length };
  }

  const body = { schema: "unflinch.evidence_hashes.v1", files: hashes };
  await fs.writeFile(path.join(ROOT, OUT), `${JSON.stringify(body, null, 2)}\n`);
  console.log(`${OUT}: ${files.length} files`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
