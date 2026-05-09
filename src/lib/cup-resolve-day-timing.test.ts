import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseCupTimeWindow } from "./cup-day-content";
import { resolveCupDayTiming } from "./cup-resolve-day-timing";
import type { DayScheduleEntry } from "@/lib/types";

const __dirname = dirname(fileURLToPath(import.meta.url));

function emptyDay(): DayScheduleEntry {
  return {
    dayLabel: "søndag",
    date: "2026-09-20",
    time: null,
    details: null,
    highlights: [],
    rememberItems: [],
    deadlines: [],
    notes: [],
  };
}

describe("resolveCupDayTiming", () => {
  it("parseCupTimeWindow finner vindu i Høstcup-fixture", () => {
    const p = resolve(__dirname, "../../fixtures/tankestrom/hostcup_handball.txt");
    const host = readFileSync(p, "utf8");
    expect(parseCupTimeWindow(host)).toEqual(
      expect.objectContaining({ earliestStart: "10:00", latestStart: "12:00" }),
    );
  });

  it("betinget dag: «mellom 10 og 12» gir date_only uten timeWindow (ikke fast programvindu)", () => {
    const blob = "Ved A-sluttspill kan det bli søndagskamp mellom kl. 10:00 og 12:00.";
    const r = resolveCupDayTiming({
      day: emptyDay(),
      detailsForEvent: null,
      highlightsForEventFinal: [],
      notesOnlyForEvent: [blob],
      rememberForEvent: [],
      deadlinesForEvent: [],
      conditionalDay: true,
    });
    expect(r.timePrecision).toBe("date_only");
    expect(r.timeWindow).toBeUndefined();
    expect(r.start).toBeNull();
    expect(r.end).toBeNull();
  });

  it("lørdag: søndagskamp-vindu i delt blob skal ikke overstyrde som time_window", () => {
    const day: DayScheduleEntry = {
      dayLabel: "lørdag",
      date: "2026-09-19",
      time: null,
      details: null,
      highlights: ["09:15 Første kamp", "14:40 Andre kamp"],
      rememberItems: [],
      deadlines: [],
      notes: [
        "Kampoppsett: fredag kl. 17:30, lørdag kl. 09:15 og kl. 14:40.",
        "Ved A-sluttspill kan det bli søndagskamp mellom kl. 10:00 og 12:00.",
      ],
    };
    const r = resolveCupDayTiming({
      day,
      detailsForEvent: null,
      highlightsForEventFinal: day.highlights,
      notesOnlyForEvent: day.notes,
      rememberForEvent: [],
      deadlinesForEvent: [],
      conditionalDay: false,
    });
    expect(r.timePrecision).toBe("start_only");
    expect(r.timeWindow).toBeUndefined();
  });

  it("samme vindu uten betingelse: beholder time_window", () => {
    const blob = "Kamp mellom kl. 10:00 og 12:00.";
    const r = resolveCupDayTiming({
      day: emptyDay(),
      detailsForEvent: null,
      highlightsForEventFinal: [],
      notesOnlyForEvent: [blob],
      rememberForEvent: [],
      deadlinesForEvent: [],
      conditionalDay: false,
    });
    expect(r.timePrecision).toBe("time_window");
    expect(r.timeWindow).toEqual({ earliestStart: "10:00", latestStart: "12:00" });
  });
});
