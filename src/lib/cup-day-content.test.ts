import { describe, expect, it } from "vitest";
import {
  buildCupStructuredDayContent,
  enrichCupStructuredContentWithResolvedTiming,
  formatCupEventNotesFlat,
  isNoiseFragment,
} from "./cup-day-content";

describe("buildCupStructuredDayContent (Høstcupen-regresjon)", () => {
  const base = {
    date: "2026-09-18",
    parentTitle: "Høstcupen",
    childTitle: "Høstcupen – fredag",
  };

  it("deduper bringItems: ekstra t-skjorte vs Gjerne ekstra t-skjorte", () => {
    const r = buildCupStructuredDayContent({
      ...base,
      details: null,
      highlights: [],
      notes: ["Husk: Gjerne ekstra t-skjorte", "Husk: ekstra t-skjorte"],
      rememberItems: [],
      deadlines: [],
    });
    const t = r.bringItems.filter((x) => x.includes("t-skjorte"));
    expect(t).toHaveLength(1);
    expect(t[0]).toBe("ekstra t-skjorte");
  });

  it("formatCupEventNotesFlat har ikke genererte seksjonstitler", () => {
    const r = buildCupStructuredDayContent({
      ...base,
      details:
        "Høydepunkter: Første kamp i Nadderud Arena; Møt ferdig skiftet 50 minutter før kampstart. Husk: Gjerne ekstra t-skjorte. Notater: Kampen varer 2 x 20 minutter.",
      highlights: [],
      notes: [],
      rememberItems: [],
      deadlines: [],
    });
    const flat = formatCupEventNotesFlat(r) ?? "";
    expect(flat).not.toMatch(/Høydepunkter\s*:/i);
    expect(flat).not.toMatch(/Notater\s*:/i);
    expect(flat).not.toMatch(/\bHusk\s*:/i);
  });

  it("09:15 bag/kjølebag-koordinering er ikke highlight", () => {
    const r = buildCupStructuredDayContent({
      ...base,
      date: "2026-09-19",
      childTitle: "Høstcupen – lørdag",
      details: null,
      highlights: [
        "09:15 Første kamp",
        "09:15 Ta gjerne med ekstra stor bag eller kjølebag og skriv det i kommentarfeltet",
        "14:40 Andre kamp i Nadderud Arena",
      ],
      notes: [],
      rememberItems: [],
      deadlines: [],
    });
    const bad = r.highlights.some((h) => /kjølebag|kommentarfelt/i.test(h));
    expect(bad).toBe(false);
    expect(r.highlights.some((h) => /14:40.*Andre kamp/i.test(h))).toBe(true);
    expect(r.parentTasks.some((p) => /kjølebag/i.test(p))).toBe(true);
  });

  it("14:40 Andre kamp kun én gang (semantisk dedupe)", () => {
    const r = buildCupStructuredDayContent({
      ...base,
      date: "2026-09-19",
      childTitle: "Høstcupen – lørdag",
      details: null,
      highlights: ["14:40 i Nadderud Arena; Andre kamp", "14:40 Andre kamp"],
      notes: [],
      rememberItems: [],
      deadlines: [],
    });
    expect(r.highlights.filter((h) => h.startsWith("14:40"))).toHaveLength(1);
  });

  it("søndag: mellom 10:00 og 12:00 blir ett timeWindow, ikke fire highlights", () => {
    const r = buildCupStructuredDayContent({
      ...base,
      date: "2026-09-20",
      childTitle: "Høstcupen – søndag",
      details: null,
      highlights: [],
      notes: [
        "A-sluttspill: første kamp mellom kl. 10:00 og 12:00 dersom vi går videre.",
        "10:00 og",
        "12:00 og",
        "Ved B-sluttspill trolig etter lunsj.",
      ],
      rememberItems: [],
      deadlines: [],
    });
    expect(r.timeWindowCandidates).toHaveLength(1);
    expect(r.timeWindowCandidates[0]!.earliestStart).toBe("10:00");
    expect(r.timeWindowCandidates[0]!.latestStart).toBe("12:00");
    const hhmmHighlights = r.highlights.filter((h) => /^\d{2}:\d{2}\s/.test(h));
    expect(hhmmHighlights.length).toBe(0);
  });

  it("fragmentfilter markerer støy (og, spist litt, liste-overtrekksklær)", () => {
    expect(isNoiseFragment("og")).toBe(true);
    expect(isNoiseFragment("spist litt")).toBe(true);
    expect(isNoiseFragment("- overtrekksklær")).toBe(true);
  });

  it("beriking: vindu 10:00–12:00 gir én highlight med semantisk label og (foreløpig)", () => {
    const structured = buildCupStructuredDayContent({
      ...base,
      date: "2026-09-20",
      childTitle: "Høstcupen – søndag",
      details: null,
      highlights: [],
      notes: [
        "A-sluttspill: første kamp mellom kl. 10:00 og 12:00 dersom vi går videre.",
        "10:00 og",
        "12:00 og",
      ],
      rememberItems: [],
      deadlines: [],
    });
    const enriched = enrichCupStructuredContentWithResolvedTiming(structured, {
      date: "2026-09-20",
      parentTitleNorm: "hostcupen",
      childTitleNorm: "hostcupen sondag",
      sourceBlob:
        "A-sluttspill: første kamp mellom kl. 10:00 og 12:00 dersom vi går videre.\n10:00 og\n12:00 og",
      attendanceTime: null,
      orderedMatchTimes: ["10:00", "12:00"],
      daySegmentStart: null,
      daySegmentEnd: null,
      timeWindow: { earliestStart: "10:00", latestStart: "12:00" },
      timePrecision: "time_window",
      tentative: true,
    });
    expect(enriched.highlights).toContain("10:00–12:00 Første sluttspillkamp (foreløpig)");
    expect(enriched.highlights.some((h) => /^10:00\s/.test(h) && !h.includes("–"))).toBe(false);
    expect(enriched.highlights.some((h) => /^12:00\s/.test(h) && !h.includes("–"))).toBe(false);
  });

  it("beriking: én kamptid + note uten inline tid → highlight med klokkeslett + semantikk", () => {
    const structured = buildCupStructuredDayContent({
      ...base,
      details: "Første kamp i Nadderud Arena. Oppvarming som vanlig.",
      highlights: [],
      notes: [],
      rememberItems: [],
      deadlines: [],
    });
    const enriched = enrichCupStructuredContentWithResolvedTiming(structured, {
      date: "2026-09-18",
      parentTitleNorm: "hostcupen",
      childTitleNorm: "hostcupen fredag",
      sourceBlob: "Første kamp i Nadderud Arena. Oppvarming som vanlig.\n17:30",
      attendanceTime: null,
      orderedMatchTimes: ["17:30"],
      daySegmentStart: "17:30",
      daySegmentEnd: "18:10",
      timeWindow: null,
      timePrecision: "exact",
      tentative: false,
    });
    expect(enriched.highlights.some((h) => h === "17:30 Første kamp")).toBe(true);
  });
});
