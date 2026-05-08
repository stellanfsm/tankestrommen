import { describe, it } from "vitest";
import {
  createRegressionAsserts,
  runTankestromFixture,
} from "@/lib/tankestrom-regression-harness";

describe("Tankestrømmen regression harness", () => {
  it("Vårcupen fixture holder parent/child struktur og highlights", () => {
    const bundle = runTankestromFixture("fixtures/tankestrom/vaacup_original.txt");
    const t = createRegressionAsserts(bundle);
    t.expectParentCount(1);
    t.expectChildCount(3);
    t.expectChildTitles(["Vårcupen – fredag", "Vårcupen – lørdag", "Vårcupen – søndag"]);
    t.expectDayHighlights("fredag", ["17:45 Oppmøte", "18:40 Kamp"]);
    t.expectDayHighlights("lørdag", ["08:35 Oppmøte", "09:20 Kamp", "14:25 Oppmøte", "15:10 Kamp"]);
    t.expectTimePrecision("søndag", "date_only");
    t.expectTentativeOnlyForDay("søndag");
    t.expectNoEventTitleAsHighlight();
    t.expectNoStructureFallbackInNotes();
    t.expectNoDateTokensInChildTitles();
    t.expectNoDuplicateDays();
  });

  it("Høstcupen fixture holder struktur, dedupe og rene notes", () => {
    const bundle = runTankestromFixture("fixtures/tankestrom/hostcup_handball.txt");
    const t = createRegressionAsserts(bundle);
    t.expectParentCount(1);
    t.expectChildCount(3);
    t.expectChildTitles(["Høstcupen – fredag", "Høstcupen – lørdag", "Høstcupen – søndag"]);
    t.expectNoDuplicateDays();
    t.expectNoDateTokensInChildTitles();
    t.expectNoEventTitleAsHighlight();
    t.expectNoStructureFallbackInNotes();
  });
});
