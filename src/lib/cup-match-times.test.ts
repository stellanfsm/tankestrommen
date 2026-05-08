import { describe, expect, it } from "vitest";
import { extractCupMatchTimes, extractExplicitAttendanceHhmmTimes } from "./cup-match-times";

describe("cup-match-times (portal timing)", () => {
  it("tar ikke med oppmøtetid som kamp når format er «17:45 Oppmøte»", () => {
    const blob = [
      "Kamp kl. 18:40",
      "17:45 Oppmøte ved baneområdet på Ekeberg",
      "Oppmøte ved baneområdet på Ekeberg 55 minutter før kampstart",
    ].join("\n");
    expect(extractCupMatchTimes(blob)).toEqual(["18:40"]);
    expect(extractExplicitAttendanceHhmmTimes(blob).has("17:45")).toBe(true);
  });

  it("tar ikke med oppmøte … kl. 17:45 som ekstra kampstart", () => {
    const blob = "Oppmøte fredag er kl. 17:45 ved Ekeberg, altså 55 minutter før kampstart.\nKamp kl. 18:40";
    expect(extractCupMatchTimes(blob)).toEqual(["18:40"]);
  });
});
