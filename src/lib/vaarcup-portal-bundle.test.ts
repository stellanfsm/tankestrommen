import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import "@/app/api/analyze/route";
import { toPortalBundle } from "@/lib/portal-bundle";
import type { AIAnalysisResult, DayScheduleEntry } from "@/lib/types";

function baseExtractedText(raw: string) {
  return { raw, language: "no", confidence: 1 };
}

/** Speiler typisk modell-output som ga feil 16:50 i portal (før fiks). */
function vaarcupLikeResult(): AIAnalysisResult {
  const raw = readFileSync(resolve("fixtures/tankestrom/vaacup_original.txt"), "utf8");
  const emptyDay = (partial: Partial<DayScheduleEntry> & Pick<DayScheduleEntry, "dayLabel">): DayScheduleEntry => ({
    dayLabel: partial.dayLabel,
    date: partial.date ?? null,
    time: partial.time ?? null,
    details: partial.details ?? null,
    highlights: partial.highlights ?? [],
    rememberItems: partial.rememberItems ?? [],
    deadlines: partial.deadlines ?? [],
    notes: partial.notes ?? [],
  });

  return {
    title: "Vårcupen 2026",
    schedule: [],
    scheduleByDay: [
      emptyDay({
        dayLabel: "fredag",
        date: "12. juni 2026",
        time: "17:45",
        highlights: ["Kamp kl. 18:40", "17:45 Oppmøte ved baneområdet på Ekeberg"],
        notes: [
          "Oppmøte ved baneområdet på Ekeberg 55 minutter før kampstart",
          "Det er meldt ustabilt vær",
          "Det trengs hjelp til kjøring og enkel organisering mellom kampene",
        ],
      }),
      emptyDay({
        dayLabel: "lørdag",
        date: "13. juni 2026",
        highlights: ["Kamp kl. 09:20", "Kamp kl. 15:10"],
        notes: ["På lørdag ønsker vi oppmøte 45 minutter før hver kamp."],
      }),
      emptyDay({
        dayLabel: "søndag",
        date: "14. juni 2026",
        highlights: [],
        notes: [
          "Eventuell kamp hvis laget går videre til A-sluttspill",
          "Egen melding kommer når det er avklart.",
        ],
      }),
    ],
    location: null,
    description: raw.slice(0, 400),
    category: "arrangement",
    targetGroup: null,
    organizer: null,
    contactPerson: null,
    sourceUrl: null,
    confidence: 0.9,
    extractedText: baseExtractedText(raw),
  };
}

describe("Vårcupen portal bundle (faktisk toPortalBundle)", () => {
  it("fredag: serialized bundle skal ikke inneholde «18:40 Oppmøte» (kamp feilmerket som oppmøte)", async () => {
    const raw = readFileSync(resolve("fixtures/tankestrom/vaacup_original.txt"), "utf8");
    const emptyDay = (partial: Partial<DayScheduleEntry> & Pick<DayScheduleEntry, "dayLabel">): DayScheduleEntry => ({
      dayLabel: partial.dayLabel,
      date: partial.date ?? null,
      time: partial.time ?? null,
      details: partial.details ?? null,
      highlights: partial.highlights ?? [],
      rememberItems: partial.rememberItems ?? [],
      deadlines: partial.deadlines ?? [],
      notes: partial.notes ?? [],
    });
    const mislabeled: AIAnalysisResult = {
      title: "Vårcupen 2026",
      schedule: [],
      scheduleByDay: [
        emptyDay({
          dayLabel: "fredag",
          date: "12. juni 2026",
          time: "17:45",
          highlights: [
            "18:40 Oppmøte",
            "Mye prat om oppmøte og logistikk uten kamp-ord i denne linjen",
          ],
          notes: [
            "Oppmøte kl. 17:45 ved banen. Kampstart kl. 18:40.",
            "Det er meldt ustabilt vær.",
          ],
        }),
        emptyDay({
          dayLabel: "lørdag",
          date: "13. juni 2026",
          highlights: ["Kamp kl. 09:20", "Kamp kl. 15:10"],
          notes: ["På lørdag ønsker vi oppmøte 45 minutter før hver kamp."],
        }),
        emptyDay({
          dayLabel: "søndag",
          date: "14. juni 2026",
          highlights: [],
          notes: ["Eventuell kamp hvis laget går videre.", "Egen melding kommer når det er avklart."],
        }),
      ],
      location: null,
      description: raw.slice(0, 400),
      category: "arrangement",
      targetGroup: null,
      organizer: null,
      contactPerson: null,
      sourceUrl: null,
      confidence: 0.9,
      extractedText: baseExtractedText(raw),
    };
    const bundle = (await toPortalBundle(mislabeled, "text", undefined, false, {
      knownPersons: [],
    })) as Record<string, unknown>;
    const items = bundle.items as Array<Record<string, unknown>>;
    const events = items.filter((i) => i.kind === "event") as Array<{
      event: {
        metadata?: {
          embeddedSchedule?: Array<{ title?: string; dayContent?: { highlights?: string[] } }>;
        };
      };
    }>;
    const parent = events.find((e) => e.event.metadata?.embeddedSchedule);
    const fri = parent!.event.metadata!.embeddedSchedule!.find((s) => /fredag/i.test(String(s.title ?? "")));
    const hl = (fri?.dayContent?.highlights ?? []).join(" ");
    const friJson = JSON.stringify(fri?.dayContent ?? {});
    expect(friJson).not.toMatch(/18:40\s+Oppmøte/i);
    expect(hl).toMatch(/17:45/);
    expect(hl).toContain("Oppmøte");
    expect(hl).toMatch(/18:40.*(Første kamp|Kamp)/);
  });

  it("fredag: ingen 16:50; start 17:45; highlights 17:45 Oppmøte og 18:40 Første kamp", async () => {
    const bundle = (await toPortalBundle(vaarcupLikeResult(), "text", undefined, false, {
      knownPersons: [],
    })) as Record<string, unknown>;
    const json = JSON.stringify(bundle);
    expect(json).not.toContain("16:50");
    expect(json).not.toMatch(/18:40\s+Oppmøte/i);

    const items = bundle.items as Array<Record<string, unknown>>;
    expect(Array.isArray(items)).toBe(true);

    const events = items.filter((i) => i.kind === "event") as Array<{
      kind: string;
      event: {
        title?: string;
        date?: string;
        start?: string | null;
        metadata?: {
          embeddedSchedule?: Array<{
            date?: string;
            start?: string | null;
            dayContent?: { highlights?: string[] };
          }>;
        };
      };
    }>;

    const parent = events.find((e) => e.event.metadata?.embeddedSchedule);
    expect(parent).toBeTruthy();
    const emb = parent!.event.metadata!.embeddedSchedule!;
    const fri = emb.find((s) => /fredag/i.test(String(s.title ?? "")));
    expect(fri).toBeTruthy();
    expect(fri!.start).toBe("17:45");
    const hl = fri!.dayContent?.highlights ?? [];
    const joined = hl.join(" ");
    expect(joined).toContain("17:45");
    expect(joined).toContain("Oppmøte");
    expect(joined).toContain("18:40");
    expect(joined).toContain("Første kamp");
    expect(joined).not.toContain("16:50");

    const childFri = events.find(
      (e) => e.event.title?.includes("fredag") && !e.event.metadata?.embeddedSchedule?.length,
    );
    if (childFri?.event.start) {
      expect(childFri.event.start).toContain("17:45");
      expect(childFri.event.start).not.toContain("16:50");
    }
  });
});
