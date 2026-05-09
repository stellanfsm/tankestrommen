import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type DayKey = "fredag" | "lørdag" | "søndag";
export type TimePrecision = "exact" | "start_only" | "date_only" | "time_window";

export type ForbiddenHighlightRule = {
  day?: DayKey;
  includes: string;
};

export type RequiredTaskSpec = {
  titleIncludes: string;
  date: string | null;
  dueTime: string | null;
};

export type TankestromExpected = {
  schemaVersion: number;
  category?: string;
  parentCount: number;
  childCount: number;
  childTitles: string[];
  highlightsByDay: Partial<Record<DayKey, string[]>>;
  requiredBringItems: string[];
  forbiddenInNotes: string[];
  forbiddenHighlights: ForbiddenHighlightRule[];
  tentativeDays: Partial<Record<DayKey, boolean>>;
  timePrecisionByDay: Partial<Record<DayKey, TimePrecision>>;
  requiredTasks: RequiredTaskSpec[];
};

export function loadTankestromExpected(absolutePath: string): TankestromExpected {
  const raw = readFileSync(absolutePath, "utf8");
  return JSON.parse(raw) as TankestromExpected;
}

export function resolveExpectedPath(repoRoot: string, fixtureId: string): string {
  return resolve(repoRoot, `fixtures/tankestrom/expected/${fixtureId}.expected.json`);
}
