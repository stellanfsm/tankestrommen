import { describe, expect, it } from "vitest";
import {
  extractGlobalCupScheduleTimesByDay,
  extractGlobalCupScheduleTimesForDay,
  isConditionalTournamentTextForDay,
} from "./cup-timing-context";
import {
  buildCupStructuredDayContent,
  enrichCupStructuredContentWithResolvedTiming,
} from "./cup-day-content";

describe("cup timing context regression (Vårcupen)", () => {
  it("distribuerer globale kamptider til riktig dag", () => {
    const text =
      "Foreløpig kampoppsett er at vi spiller fredag kl. 18:40, lørdag kl. 09:20 og lørdag kl. 15:10. Dersom vi går videre til A-sluttspill, blir det kamp enten søndag formiddag eller tidlig ettermiddag.";
    const byDay = extractGlobalCupScheduleTimesByDay(text);
    expect(byDay.fredag).toEqual(["18:40"]);
    expect(byDay.lordag).toEqual(["09:20", "15:10"]);
    expect(byDay.sondag).toEqual([]);
    expect(extractGlobalCupScheduleTimesForDay(text, "fredag")).toEqual(["18:40"]);
    expect(extractGlobalCupScheduleTimesForDay(text, "lørdag")).toEqual(["09:20", "15:10"]);
  });

  it("tar ikke med oppmøte-klokkeslett som kamp når dag og kl står i oppmøte-setningen", () => {
    const text = [
      "Foreløpig kampoppsett er at vi spiller fredag kl. 18:40, lørdag kl. 09:20 og lørdag kl. 15:10.",
      "Oppmøte fredag er kl. 17:45 ved banen, 55 minutter før kampstart.",
    ].join("\n");
    const byDay = extractGlobalCupScheduleTimesByDay(text);
    expect(byDay.fredag).toEqual(["18:40"]);
    expect(byDay.lordag).toEqual(["09:20", "15:10"]);
  });

  it("søndagsbetingelse smitter ikke til lørdag", () => {
    const saturdayBlob =
      "Lørdag kl. 09:20 og 15:10. Oppmøte 45 minutter før hver kamp. Dersom vi går videre til A-sluttspill blir det kamp søndag.";
    const sundayBlob =
      "Dersom vi går videre til A-sluttspill, blir det kamp søndag formiddag eller tidlig ettermiddag.";
    expect(isConditionalTournamentTextForDay(saturdayBlob, "lørdag")).toBe(false);
    expect(isConditionalTournamentTextForDay(sundayBlob, "søndag")).toBe(true);
  });

  it("A-sluttspill kun som søndagskamp merker ikke fredag som betinget (Høstcupen)", () => {
    const blob =
      "Helg: fredag 18. september. Ved A-sluttspill kan det bli søndagskamp mellom kl. 10:00 og 12:00.";
    expect(isConditionalTournamentTextForDay(blob, "fredag")).toBe(false);
    expect(isConditionalTournamentTextForDay(blob, "søndag")).toBe(true);
  });

  it("bygger highlights fra global schedule + oppmøte-regler uten duplikater", () => {
    const base = {
      parentTitle: "Vårcupen",
      details: null,
      highlights: [],
      rememberItems: [] as string[],
      deadlines: [] as string[],
    };
    const globalSchedule =
      "Foreløpig kampoppsett er at vi spiller fredag kl. 18:40, lørdag kl. 09:20 og lørdag kl. 15:10.";
    const fridayStructured = buildCupStructuredDayContent({
      ...base,
      date: "2026-06-12",
      childTitle: "Vårcupen – fredag",
      notes: ["Oppmøte fredag er kl. 17:45 ved baneområdet på Ekeberg, altså 55 minutter før kampstart."],
    });
    const friday = enrichCupStructuredContentWithResolvedTiming(fridayStructured, {
      date: "2026-06-12",
      parentTitleNorm: "varcupen",
      childTitleNorm: "varcupen fredag",
      sourceBlob:
        `${globalSchedule}\nOppmøte fredag er kl. 17:45 ved baneområdet på Ekeberg, altså 55 minutter før kampstart.`,
      attendanceTime: "17:45",
      orderedMatchTimes: ["18:40"],
      daySegmentStart: "17:45",
      daySegmentEnd: null,
      timeWindow: null,
      timePrecision: "start_only",
      tentative: false,
    });
    expect(friday.highlights).toContain("17:45 Oppmøte");
    expect(friday.highlights.some((h) => /^18:40\s+(Kamp|Første kamp)$/.test(h))).toBe(true);

    const saturdayStructured = buildCupStructuredDayContent({
      ...base,
      date: "2026-06-13",
      childTitle: "Vårcupen – lørdag",
      notes: ["På lørdag ønsker vi oppmøte 45 minutter før hver kamp."],
    });
    const saturday = enrichCupStructuredContentWithResolvedTiming(saturdayStructured, {
      date: "2026-06-13",
      parentTitleNorm: "varcupen",
      childTitleNorm: "varcupen lordag",
      sourceBlob: `${globalSchedule}\nPå lørdag ønsker vi oppmøte 45 minutter før hver kamp.`,
      attendanceTime: null,
      orderedMatchTimes: ["09:20", "15:10"],
      daySegmentStart: "09:20",
      daySegmentEnd: null,
      timeWindow: null,
      timePrecision: "start_only",
      tentative: false,
    });
    expect(saturday.highlights).toContain("08:35 Oppmøte før første kamp");
    expect(saturday.highlights).toContain("14:25 Oppmøte før andre kamp");
    expect(saturday.highlights.some((h) => /^09:20\s+(Kamp|Første kamp)$/.test(h))).toBe(true);
    expect(saturday.highlights.some((h) => /^15:10\s+(Kamp|Andre kamp)$/.test(h))).toBe(true);
    expect(new Set(saturday.highlights).size).toBe(saturday.highlights.length);
    expect(saturday.highlights.some((h) => /vårcupen/i.test(h))).toBe(false);
  });
});
