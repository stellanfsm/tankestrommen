import { expect } from "vitest";
import {
  type DayKey,
  type RegressionPortalBundle,
  type TimePrecision,
  runTankestromFixture,
} from "@/lib/tankestrom-regression-fixture-runner";

export {
  type DayKey,
  type RegressionChild,
  type RegressionPortalBundle,
  type TimePrecision,
  runTankestromFixture,
} from "@/lib/tankestrom-regression-fixture-runner";

function normalizeNorwegianLetters(input: string): string {
  return input
    .toLowerCase()
    .replace(/å/g, "a")
    .replace(/ø/g, "o")
    .replace(/æ/g, "e");
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
    expectNoDayHighlightAt(day: DayKey, hhmm: string) {
      const child = bundle.children.find((c) => c.day === day);
      expect(child).toBeTruthy();
      expect(child!.highlights.some((h) => h.startsWith(`${hhmm} `))).toBe(false);
    },
    expectNoDayHighlightContaining(day: DayKey, snippet: string) {
      const child = bundle.children.find((c) => c.day === day);
      expect(child).toBeTruthy();
      const lowered = normalizeNorwegianLetters(snippet);
      expect(
        child!.highlights.some((h) => normalizeNorwegianLetters(h).includes(lowered)),
      ).toBe(false);
    },
    expectNoDeadlineHighlightInProgramDays() {
      for (const c of bundle.children) {
        for (const h of c.highlights) {
          const n = normalizeNorwegianLetters(h);
          expect(
            /\b(spond|svar|frist|senest|pamelding|påmelding|om\s+barnet\s+kan\s+delta)\b/.test(n),
          ).toBe(false);
        }
      }
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
        expect(
          /(?:^|\n)\s*(?:Høydepunkter|Hoydepunkter)\s*:/i.test(note),
        ).toBe(false);
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
