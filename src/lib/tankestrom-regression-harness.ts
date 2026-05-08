import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect } from "vitest";
import {
  buildCupStructuredDayContent,
  cupLineNormKey,
  enrichCupStructuredContentWithResolvedTiming,
  formatCupEventNotesFlat,
} from "@/lib/cup-day-content";
import {
  extractGlobalCupScheduleTimesByDay,
  isConditionalTournamentTextForDay,
} from "@/lib/cup-timing-context";

type DayKey = "fredag" | "lørdag" | "søndag";
type TimePrecision = "exact" | "start_only" | "date_only" | "time_window";

export type RegressionChild = {
  day: DayKey;
  title: string;
  date: string | null;
  start: string | null;
  timePrecision: TimePrecision;
  tentative: boolean;
  highlights: string[];
  bringItems: string[];
  notes: string | null;
};

export type RegressionPortalBundle = {
  parentTitle: string;
  children: RegressionChild[];
  tasks: Array<{
    title: string;
    date: string | null;
    dueTime: string | null;
  }>;
};

function normalizeSpace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function normalizeNorwegianLetters(input: string): string {
  return input
    .toLowerCase()
    .replace(/å/g, "a")
    .replace(/ø/g, "o")
    .replace(/æ/g, "e");
}

function splitSentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((s) => normalizeSpace(s))
    .filter(Boolean);
}

function hasDayMention(sentence: string, day: DayKey): boolean {
  const n = normalizeNorwegianLetters(sentence);
  if (day === "fredag") return /\bfredag|friday\b/.test(n);
  if (day === "lørdag") return /\blordag|l[øo]rdag|saturday\b/.test(n);
  return /\bsondag|s[øo]ndag|sunday\b/.test(n);
}

function parseDayDate(text: string, day: DayKey): string | null {
  const yearMatch = /\b(20\d{2})\b/.exec(text);
  const year = yearMatch ? Number(yearMatch[1]) : 2026;
  const monthMap: Record<string, string> = {
    januar: "01",
    februar: "02",
    mars: "03",
    april: "04",
    mai: "05",
    juni: "06",
    juli: "07",
    august: "08",
    september: "09",
    oktober: "10",
    november: "11",
    desember: "12",
  };
  const dayExpr =
    day === "fredag"
      ? "(fredag|friday)"
      : day === "lørdag"
        ? "(l[øo]rdag|saturday)"
        : "(s[øo]ndag|sunday)";
  const re = new RegExp(`\\b${dayExpr}\\b[^\\n.!?]{0,20}?(\\d{1,2})\\.\\s*([a-zæøå]+)`, "i");
  const m = re.exec(text);
  if (!m) return null;
  const d = Number(m[2]);
  const monthRaw = normalizeNorwegianLetters(m[3] ?? "");
  const month = monthMap[monthRaw];
  if (!month || !Number.isFinite(d) || d <= 0 || d > 31) return null;
  return `${year}-${month}-${String(d).padStart(2, "0")}`;
}

function parseExplicitAttendanceTime(text: string, day: DayKey): string | null {
  const dayExpr =
    day === "fredag"
      ? "(fredag|friday)"
      : day === "lørdag"
        ? "(l[øo]rdag|saturday)"
        : "(s[øo]ndag|sunday)";
  const reDayFirst = new RegExp(
    `${dayExpr}[^\\n.!?]{0,90}?oppm[oø]te[^\\n.!?]{0,40}?kl\\.?\\s*(\\d{1,2})[:.](\\d{2})`,
    "i",
  );
  const dayFirst = reDayFirst.exec(text);
  if (dayFirst) return `${String(Number(dayFirst[2])).padStart(2, "0")}:${dayFirst[3]}`;

  const reAttendanceFirst = new RegExp(
    `oppm[oø]te[^\\n.!?]{0,90}?${dayExpr}[^\\n.!?]{0,40}?kl\\.?\\s*(\\d{1,2})[:.](\\d{2})`,
    "i",
  );
  const attendanceFirst = reAttendanceFirst.exec(text);
  if (!attendanceFirst) return null;
  return `${String(Number(attendanceFirst[2])).padStart(2, "0")}:${attendanceFirst[3]}`;
}

function parsePerMatchOffset(text: string, day: DayKey): number | null {
  const dayExpr =
    day === "fredag"
      ? "(fredag|friday)"
      : day === "lørdag"
        ? "(l[øo]rdag|saturday)"
        : "(s[øo]ndag|sunday)";
  const re = new RegExp(
    `${dayExpr}[^\\n.!?]{0,110}?oppm[oø]te[^\\n.!?]{0,50}?(\\d{1,3})\\s*min(?:utter)?\\s*f[øo]r\\s*hver\\s+kamp`,
    "i",
  );
  const m = re.exec(text);
  if (!m) return null;
  const v = Number(m[2]);
  return Number.isFinite(v) && v > 0 && v <= 180 ? v : null;
}

function shiftHhmm(hhmm: string, deltaMinutes: number): string | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const total = Number(m[1]) * 60 + Number(m[2]) + deltaMinutes;
  const wrapped = ((total % 1440) + 1440) % 1440;
  const hh = Math.floor(wrapped / 60);
  const mm = wrapped % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function inferParentTitle(text: string): string {
  const first = normalizeSpace(text.split(/\n+/)[0] ?? "");
  if (/v[aå]rcupen/i.test(first)) return "Vårcupen";
  if (/h[øo]stcupen/i.test(first)) return "Høstcupen";
  return first || "Arrangement";
}

function parseMonthToken(raw: string): string | null {
  const monthMap: Record<string, string> = {
    januar: "01",
    februar: "02",
    mars: "03",
    april: "04",
    mai: "05",
    juni: "06",
    juli: "07",
    august: "08",
    september: "09",
    oktober: "10",
    november: "11",
    desember: "12",
  };
  return monthMap[normalizeNorwegianLetters(raw)] ?? null;
}

function parseSpondDeadlineTask(
  text: string,
  parentTitle: string,
): { title: string; date: string | null; dueTime: string | null } | null {
  const n = normalizeNorwegianLetters(text);
  if (!/\bspond\b/.test(n) || !/\b(svar|gi\s+beskjed|meld\s+fra)\b/.test(n)) return null;
  const deadlineBlobMatch =
    /\b(?:svar|gi\s+beskjed|meld\s+fra)\b[\s\S]{0,180}?\bspond\b[\s\S]{0,180}?\b(?:senest|frist)\b[\s\S]{0,180}/i.exec(
      text,
    ) ||
    /\bspond\b[\s\S]{0,180}?\b(?:senest|frist)\b[\s\S]{0,180}/i.exec(text);
  const blob = deadlineBlobMatch?.[0] ?? text;

  const dueM = /\bkl\.?\s*(\d{1,2})[.:](\d{2})\b/i.exec(blob);
  const dueTime = dueM ? `${String(Number(dueM[1])).padStart(2, "0")}:${dueM[2]}` : null;

  const year = Number((/\b(20\d{2})\b/.exec(text) ?? [])[1] ?? 2026);
  const dateM = /\b(?:mandag|tirsdag|onsdag|torsdag|fredag|l[øo]rdag|s[øo]ndag)\s+(\d{1,2})\.\s*([a-zæøå]+)/i.exec(
    blob,
  );
  let date: string | null = null;
  if (dateM) {
    const month = parseMonthToken(dateM[2] ?? "");
    const day = Number(dateM[1]);
    if (month && Number.isFinite(day) && day > 0 && day <= 31) {
      date = `${year}-${month}-${String(day).padStart(2, "0")}`;
    }
  }

  return {
    title: `Svar i Spond om deltakelse i ${parentTitle}`,
    date,
    dueTime,
  };
}

export function runTankestromFixture(fixturePath: string): RegressionPortalBundle {
  const fullPath = resolve(fixturePath);
  const text = readFileSync(fullPath, "utf8");
  const parentTitle = inferParentTitle(text);
  const global = extractGlobalCupScheduleTimesByDay(text);
  const sentences = splitSentences(text);
  const days: DayKey[] = ["fredag", "lørdag", "søndag"];
  const children: RegressionChild[] = [];

  for (const day of days) {
    const date = parseDayDate(text, day);
    const dayTimes =
      day === "fredag" ? global.fredag : day === "lørdag" ? global.lordag : global.sondag;
    const attendanceExplicit = parseExplicitAttendanceTime(text, day);
    const offset = parsePerMatchOffset(text, day);

    const daySentences = sentences.filter((s) => hasDayMention(s, day));
    const genericSentences = sentences.filter(
      (s) => !hasDayMention(s, "fredag") && !hasDayMention(s, "lørdag") && !hasDayMention(s, "søndag"),
    );
    const sourceBlob = [...daySentences, ...genericSentences].join("\n");
    const conditional = isConditionalTournamentTextForDay(sourceBlob, day);
    const timePrecision: TimePrecision =
      dayTimes.length > 0 ? "start_only" : conditional ? "date_only" : "date_only";

    const structured = buildCupStructuredDayContent({
      date: date ?? "1970-01-01",
      details: null,
      highlights: dayTimes.map((t) => `${t} Kamp`),
      notes: daySentences,
      rememberItems: [],
      deadlines: [],
      parentTitle,
      childTitle: `${parentTitle} – ${day}`,
    });
    const enriched = enrichCupStructuredContentWithResolvedTiming(structured, {
      date: date ?? "1970-01-01",
      parentTitleNorm: cupLineNormKey(parentTitle),
      childTitleNorm: cupLineNormKey(`${parentTitle} – ${day}`),
      sourceBlob,
      attendanceTime: attendanceExplicit,
      orderedMatchTimes: dayTimes,
      daySegmentStart: attendanceExplicit ?? dayTimes[0] ?? null,
      daySegmentEnd: null,
      timeWindow: null,
      timePrecision,
      tentative: conditional,
    });

    let highlights = [...enriched.highlights];
    if (offset != null && dayTimes.length > 0) {
      for (const t of dayTimes) {
        const att = shiftHhmm(t, -offset);
        if (att && !highlights.some((h) => h.startsWith(`${att} `))) {
          highlights.push(`${att} Oppmøte`);
        }
      }
      highlights = highlights.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    }

    if (date || daySentences.length > 0 || dayTimes.length > 0) {
      children.push({
        day,
        title: `${parentTitle} – ${day}`,
        date,
        start: attendanceExplicit ?? dayTimes[0] ?? null,
        timePrecision,
        tentative: conditional,
        highlights,
        bringItems: enriched.bringItems,
        notes: formatCupEventNotesFlat(enriched),
      });
    }
  }

  const tasks: RegressionPortalBundle["tasks"] = [];
  const spondTask = parseSpondDeadlineTask(text, parentTitle);
  if (spondTask) tasks.push(spondTask);

  return { parentTitle, children, tasks };
}

export function createRegressionAsserts(bundle: RegressionPortalBundle) {
  return {
    expectParentCount(n: number) {
      expect(n).toBe(1);
      expect(bundle.parentTitle.length).toBeGreaterThan(0);
    },
    expectChildCount(n: number) {
      expect(bundle.children).toHaveLength(n);
    },
    expectChildTitles(titles: string[]) {
      expect(bundle.children.map((c) => c.title)).toEqual(titles);
    },
    expectDayHighlights(day: DayKey, highlights: string[]) {
      const child = bundle.children.find((c) => c.day === day);
      expect(child).toBeTruthy();
      for (const h of highlights) expect(child!.highlights).toContain(h);
    },
    expectNoDuplicateDays() {
      const keys = bundle.children.map((c) => `${c.date ?? "none"}|${normalizeNorwegianLetters(c.day)}`);
      expect(new Set(keys).size).toBe(keys.length);
    },
    expectNoDateTokensInChildTitles() {
      for (const c of bundle.children) {
        expect(/\b\d{1,2}[./]\d{1,2}\b/.test(c.title)).toBe(false);
        expect(/\b\d{4}-\d{2}-\d{2}\b/.test(c.title)).toBe(false);
      }
    },
    expectNoEventTitleAsHighlight() {
      for (const c of bundle.children) {
        for (const h of c.highlights) {
          const label = h.replace(/^\d{2}:\d{2}(?:[–-]\d{2}:\d{2})?\s+/, "").trim();
          expect(normalizeNorwegianLetters(label)).not.toBe(normalizeNorwegianLetters(c.title));
          expect(normalizeNorwegianLetters(label)).not.toBe(normalizeNorwegianLetters(bundle.parentTitle));
        }
      }
    },
    expectNoStructureFallbackInNotes() {
      for (const c of bundle.children) {
        const note = c.notes ?? "";
        expect(/Høydepunkter\s*:|Notater\s*:|Husk\s*:/i.test(note)).toBe(false);
      }
    },
    expectTimePrecision(day: DayKey, precision: TimePrecision) {
      const child = bundle.children.find((c) => c.day === day);
      expect(child).toBeTruthy();
      expect(child!.timePrecision).toBe(precision);
    },
    expectTentativeOnlyForDay(day: DayKey) {
      for (const c of bundle.children) {
        if (c.day === day) expect(c.tentative).toBe(true);
        else expect(c.tentative).toBe(false);
      }
    },
    expectDayHighlightsNotContaining(day: DayKey, snippets: string[]) {
      const child = bundle.children.find((c) => c.day === day);
      expect(child).toBeTruthy();
      const joined = (child?.highlights ?? []).join("\n").toLowerCase();
      for (const s of snippets) expect(joined).not.toContain(s.toLowerCase());
    },
    expectTaskDeadline(expected: { titleIncludes: string; date: string; dueTime: string }) {
      const hit = bundle.tasks.find(
        (t) =>
          normalizeNorwegianLetters(t.title).includes(normalizeNorwegianLetters(expected.titleIncludes)) &&
          t.date === expected.date &&
          t.dueTime === expected.dueTime,
      );
      expect(hit).toBeTruthy();
    },
  };
}
