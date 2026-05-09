import { describe, expect, it } from "vitest";
import { portalBundleToRegressionBundle } from "@/evals/portal-bundle-to-regression";

describe("portalBundleToRegressionBundle", () => {
  it("mapper embeddedSchedule til tre barnedager", () => {
    const bundle = {
      items: [
        {
          kind: "event",
          event: {
            title: "Vårcupen 2026",
            date: "2026-06-12",
            start: null,
            metadata: {
              isArrangementParent: true,
              arrangementCoreTitle: "Vårcupen",
              embeddedSchedule: [
                {
                  date: "2026-06-12",
                  title: "Vårcupen – fredag",
                  start: "17:45",
                  timePrecision: "start_only" as const,
                  isConditional: false,
                  dayContent: {
                    highlights: ["17:45 Oppmøte", "18:40 Første kamp"],
                    bringItems: [],
                    generalNotes: [],
                    logisticsNotes: [],
                  },
                },
                {
                  date: "2026-06-13",
                  title: "Vårcupen – lørdag",
                  start: "09:20",
                  timePrecision: "start_only" as const,
                  isConditional: false,
                  dayContent: { highlights: ["09:20 Kamp"], bringItems: [] },
                },
                {
                  date: "2026-06-14",
                  title: "Vårcupen – søndag",
                  start: null,
                  timePrecision: "date_only" as const,
                  isConditional: true,
                  dayContent: { highlights: [], bringItems: [] },
                },
              ],
            },
          },
        },
      ],
    };

    const r = portalBundleToRegressionBundle(bundle);
    expect(r.parentTitle).toBe("Vårcupen");
    expect(r.children).toHaveLength(3);
    expect(r.children.map((c) => c.day)).toEqual(["fredag", "lørdag", "søndag"]);
    expect(r.children[0]!.highlights).toContain("17:45 Oppmøte");
    expect(r.children[2]!.tentative).toBe(true);
  });
});
