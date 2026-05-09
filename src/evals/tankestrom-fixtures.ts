import { resolve } from "node:path";

export type TankestromFixtureDef = { id: string; rel: string };

/** Alle støttede Tankestrømmen-eval fixtures (tekstfiler). */
export const TANKESTROM_FIXTURE_DEFS: TankestromFixtureDef[] = [
  { id: "vaacup_original", rel: "fixtures/tankestrom/vaacup_original.txt" },
  { id: "hostcup_handball", rel: "fixtures/tankestrom/hostcup_handball.txt" },
  { id: "speiderhelg", rel: "fixtures/tankestrom/speiderhelg.txt" },
  { id: "turnstevne", rel: "fixtures/tankestrom/turnstevne.txt" },
];

/** Standard live-eval (lav kostnad): cup-tekster. */
export const TANKESTROM_LIVE_DEFAULT_FIXTURE_IDS = ["vaacup_original", "hostcup_handball"] as const;

export function resolveFixturePath(repoRoot: string, rel: string): string {
  return resolve(repoRoot, rel);
}

/**
 * --fixtures=all | --fixtures=id1,id2
 */
export function parseFixturesArg(
  argv: string[],
  defaultIds: readonly string[],
): { mode: "all" | "list"; ids: string[] } {
  const raw = argv.find((a) => a.startsWith("--fixtures="));
  if (!raw) return { mode: "list", ids: [...defaultIds] };
  const v = raw.slice("--fixtures=".length).trim();
  if (v === "all") return { mode: "all", ids: TANKESTROM_FIXTURE_DEFS.map((f) => f.id) };
  const ids = v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return { mode: "list", ids: ids.length ? ids : [...defaultIds] };
}

export function resolveFixtureDefs(ids: string[]): TankestromFixtureDef[] {
  const byId = new Map(TANKESTROM_FIXTURE_DEFS.map((f) => [f.id, f]));
  const out: TankestromFixtureDef[] = [];
  for (const id of ids) {
    const def = byId.get(id);
    if (!def) throw new Error(`Ukjent fixtureId: "${id}". Gyldige: ${[...byId.keys()].join(", ")}`);
    out.push(def);
  }
  return out;
}
