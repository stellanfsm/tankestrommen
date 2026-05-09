import type { RegressionPortalBundle } from "@/lib/tankestrom-regression-fixture-runner";
import type { DayKey, TankestromExpected, TimePrecision } from "@/evals/tankestrom-expected";

export type ScorerResult = {
  score: number;
  failures: string[];
};

function normalizeNorwegianLetters(input: string): string {
  return input
    .toLowerCase()
    .replace(/å/g, "a")
    .replace(/ø/g, "o")
    .replace(/æ/g, "e");
}

function childByDay(bundle: RegressionPortalBundle, day: DayKey) {
  return bundle.children.find((c) => c.day === day);
}

export function scoreParentCountCorrect(
  bundle: RegressionPortalBundle,
  expected: TankestromExpected,
): ScorerResult {
  const ok = expected.parentCount === 1 && bundle.parentTitle.length > 0;
  return {
    score: ok ? 1 : 0,
    failures: ok ? [] : [`Forventet parentCount=${expected.parentCount} med ikke-tom tittel, fikk parentTitle="${bundle.parentTitle}"`],
  };
}

export function scoreChildCountCorrect(
  bundle: RegressionPortalBundle,
  expected: TankestromExpected,
): ScorerResult {
  const n = bundle.children.length;
  const ok = n === expected.childCount;
  return {
    score: ok ? 1 : 0,
    failures: ok ? [] : [`Forventet childCount=${expected.childCount}, fikk ${n}`],
  };
}

export function scoreCleanTitles(bundle: RegressionPortalBundle, expected: TankestromExpected): ScorerResult {
  const failures: string[] = [];
  const actual = bundle.children.map((c) => c.title);
  if (actual.length !== expected.childTitles.length) {
    failures.push(`Antall titler stemmer ikke: forventet ${expected.childTitles.length}, fikk ${actual.length}`);
  }
  for (let i = 0; i < Math.max(actual.length, expected.childTitles.length); i++) {
    if (actual[i] !== expected.childTitles[i]) {
      failures.push(`childTitles[${i}]: forventet "${expected.childTitles[i]}", fikk "${actual[i] ?? ""}"`);
    }
  }
  for (const c of bundle.children) {
    if (/\b\d{1,2}[./]\d{1,2}\b/.test(c.title)) failures.push(`Tittel inneholder datotoken: "${c.title}"`);
    if (/\b\d{4}-\d{2}-\d{2}\b/.test(c.title)) failures.push(`Tittel inneholder ISO-dato: "${c.title}"`);
  }
  return { score: failures.length === 0 ? 1 : 0, failures };
}

export function scoreHighlightsCorrect(bundle: RegressionPortalBundle, expected: TankestromExpected): ScorerResult {
  const failures: string[] = [];
  let pass = 0;
  let total = 0;

  for (const [day, required] of Object.entries(expected.highlightsByDay) as [DayKey, string[]][]) {
    if (!required?.length) continue;
    const child = childByDay(bundle, day);
    if (!child) {
      for (const _ of required) {
        total++;
        failures.push(`Mangler dag ${day} for påkrevde highlights`);
      }
      continue;
    }
    for (const h of required) {
      total++;
      if (child.highlights.includes(h)) {
        pass++;
      } else {
        failures.push(`[${day}] Mangler highlight: "${h}" (har: ${JSON.stringify(child.highlights)})`);
      }
    }
  }

  for (const rule of expected.forbiddenHighlights) {
    total++;
    let violated = false;
    const targets = rule.day ? bundle.children.filter((c) => c.day === rule.day) : bundle.children;
    for (const c of targets) {
      for (const h of c.highlights) {
        if (h.includes(rule.includes)) {
          violated = true;
          failures.push(`[${c.day}] Forbudt highlight-innhold "${rule.includes}" funnet i "${h}"`);
        }
      }
    }
    if (!violated) pass++;
  }

  if (total === 0) return { score: 1, failures: [] };
  return { score: pass / total, failures };
}

export function scoreNoDuplicateDays(bundle: RegressionPortalBundle): ScorerResult {
  const keys = bundle.children.map((c) => `${c.date ?? "none"}|${normalizeNorwegianLetters(c.day)}`);
  const ok = new Set(keys).size === keys.length;
  return {
    score: ok ? 1 : 0,
    failures: ok ? [] : [`Duplikat dag-nøkkel: ${keys.join(", ")}`],
  };
}

export function scoreNoEventTitleAsHighlight(bundle: RegressionPortalBundle): ScorerResult {
  const failures: string[] = [];
  for (const c of bundle.children) {
    for (const h of c.highlights) {
      const label = h.replace(/^\d{2}:\d{2}(?:[–-]\d{2}:\d{2})?\s+/, "").trim();
      if (normalizeNorwegianLetters(label) === normalizeNorwegianLetters(c.title)) {
        failures.push(`[${c.day}] Highlight-label er lik barnetittel: "${label}"`);
      }
      if (normalizeNorwegianLetters(label) === normalizeNorwegianLetters(bundle.parentTitle)) {
        failures.push(`[${c.day}] Highlight-label er lik foreldretittel: "${label}"`);
      }
    }
  }
  return { score: failures.length === 0 ? 1 : 0, failures };
}

export function scoreNoStructureFallbackInNotes(bundle: RegressionPortalBundle): ScorerResult {
  const failures: string[] = [];
  for (const c of bundle.children) {
    const note = c.notes ?? "";
    if (/Høydepunkter\s*:|Notater\s*:|Husk\s*:/i.test(note)) {
      failures.push(`[${c.day}] Struktur-fallback i notes: ${JSON.stringify(note.slice(0, 120))}`);
    }
  }
  return { score: failures.length === 0 ? 1 : 0, failures };
}

export function scoreCorrectTimePrecision(
  bundle: RegressionPortalBundle,
  expected: TankestromExpected,
): ScorerResult {
  const failures: string[] = [];
  const checks: boolean[] = [];
  for (const [day, prec] of Object.entries(expected.timePrecisionByDay) as [DayKey, TimePrecision][]) {
    if (prec === undefined) continue;
    const child = childByDay(bundle, day);
    if (!child) {
      failures.push(`timePrecision: mangler ${day}`);
      checks.push(false);
      continue;
    }
    const ok = child.timePrecision === prec;
    checks.push(ok);
    if (!ok) failures.push(`[${day}] timePrecision forventet "${prec}", fikk "${child.timePrecision}"`);
  }
  if (checks.length === 0) return { score: 1, failures: [] };
  return { score: checks.filter(Boolean).length / checks.length, failures };
}

export function scoreTentativeCorrect(bundle: RegressionPortalBundle, expected: TankestromExpected): ScorerResult {
  const failures: string[] = [];
  const checks: boolean[] = [];
  for (const [day, want] of Object.entries(expected.tentativeDays) as [DayKey, boolean][]) {
    if (want === undefined) continue;
    const child = childByDay(bundle, day);
    if (!child) {
      failures.push(`tentative: mangler ${day}`);
      checks.push(false);
      continue;
    }
    const ok = child.tentative === want;
    checks.push(ok);
    if (!ok) failures.push(`[${day}] tentative forventet ${want}, fikk ${child.tentative}`);
  }
  if (checks.length === 0) return { score: 1, failures: [] };
  return { score: checks.filter(Boolean).length / checks.length, failures };
}

export function scoreBringItemsCorrect(bundle: RegressionPortalBundle, expected: TankestromExpected): ScorerResult {
  if (expected.requiredBringItems.length === 0) return { score: 1, failures: [] };
  const flat = bundle.children.flatMap((c) => c.bringItems).join("\n");
  const n = normalizeNorwegianLetters(flat);
  const failures: string[] = [];
  for (const item of expected.requiredBringItems) {
    if (!n.includes(normalizeNorwegianLetters(item))) {
      failures.push(`Mangler bring-item (eller lik tekst): "${item}"`);
    }
  }
  return {
    score: failures.length === 0 ? 1 : 0,
    failures,
  };
}

export function scoreDeadlineCorrect(bundle: RegressionPortalBundle, expected: TankestromExpected): ScorerResult {
  if (expected.requiredTasks.length === 0) return { score: 1, failures: [] };
  const failures: string[] = [];
  for (const req of expected.requiredTasks) {
    const hit = bundle.tasks.find(
      (t) =>
        normalizeNorwegianLetters(t.title).includes(normalizeNorwegianLetters(req.titleIncludes)) &&
        t.date === req.date &&
        t.dueTime === req.dueTime,
    );
    if (!hit) {
      failures.push(
        `Mangler oppgave: titleIncludes="${req.titleIncludes}" date=${req.date} dueTime=${req.dueTime} (har ${JSON.stringify(bundle.tasks)})`,
      );
    }
  }
  return { score: failures.length === 0 ? 1 : 0, failures };
}

export function scoreNoDeadlineInProgramHighlights(bundle: RegressionPortalBundle): ScorerResult {
  const failures: string[] = [];
  for (const c of bundle.children) {
    for (const h of c.highlights) {
      const n = normalizeNorwegianLetters(h);
      if (/\b(spond|svar|frist|senest|pamelding|påmelding|om\s+barnet\s+kan\s+delta)\b/.test(n)) {
        failures.push(`[${c.day}] Program-highlight ser ut som frist/deadline: "${h}"`);
      }
    }
  }
  return { score: failures.length === 0 ? 1 : 0, failures };
}

export function scoreForbiddenInNotes(bundle: RegressionPortalBundle, expected: TankestromExpected): ScorerResult {
  if (expected.forbiddenInNotes.length === 0) return { score: 1, failures: [] };
  const failures: string[] = [];
  for (const c of bundle.children) {
    const note = normalizeNorwegianLetters(c.notes ?? "");
    for (const frag of expected.forbiddenInNotes) {
      if (note.includes(normalizeNorwegianLetters(frag))) {
        failures.push(`[${c.day}] Notes inneholder forbudt fragment: "${frag}"`);
      }
    }
  }
  return { score: failures.length === 0 ? 1 : 0, failures };
}

/** Kjør alle innebygde scorers og returner map + samlet gjennomsnitt. */
export function runAllTankestromScorers(
  bundle: RegressionPortalBundle,
  expected: TankestromExpected,
): {
  scores: Record<string, number>;
  failures: string[];
  average: number;
} {
  const parts: [string, ScorerResult][] = [
    ["parentCountCorrect", scoreParentCountCorrect(bundle, expected)],
    ["childCountCorrect", scoreChildCountCorrect(bundle, expected)],
    ["cleanTitles", scoreCleanTitles(bundle, expected)],
    ["highlightsCorrect", scoreHighlightsCorrect(bundle, expected)],
    ["forbiddenInNotes", scoreForbiddenInNotes(bundle, expected)],
    ["noDuplicateDays", scoreNoDuplicateDays(bundle)],
    ["noEventTitleAsHighlight", scoreNoEventTitleAsHighlight(bundle)],
    ["noStructureFallbackInNotes", scoreNoStructureFallbackInNotes(bundle)],
    ["correctTimePrecision", scoreCorrectTimePrecision(bundle, expected)],
    ["tentativeCorrect", scoreTentativeCorrect(bundle, expected)],
    ["bringItemsCorrect", scoreBringItemsCorrect(bundle, expected)],
    ["deadlineCorrect", scoreDeadlineCorrect(bundle, expected)],
    ["noDeadlineInProgramHighlights", scoreNoDeadlineInProgramHighlights(bundle)],
  ];

  const baseScores: Record<string, number> = {};
  const failures: string[] = [];
  for (const [name, r] of parts) {
    baseScores[name] = r.score;
    for (const f of r.failures) failures.push(`[${name}] ${f}`);
  }
  const vals = Object.values(baseScores);
  const average = vals.reduce((a, b) => a + b, 0) / vals.length;
  return { scores: { ...baseScores, structureAverage: average }, failures, average };
}
