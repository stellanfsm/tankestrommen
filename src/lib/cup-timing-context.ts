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

type CupWeekdayKey = "fredag" | "lordag" | "sondag";

function toCupWeekdayKey(label: string): CupWeekdayKey | null {
  const n = normalizeNorwegianLetters(label);
  if (/\bfri(day)?|fredag\b/.test(n)) return "fredag";
  if (/\blordag|l[øo]rdag|saturday\b/.test(n)) return "lordag";
  if (/\bsondag|s[øo]ndag|sunday\b/.test(n)) return "sondag";
  return null;
}

function dedupeTimes(times: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of times) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function extractGlobalCupScheduleTimesByDay(text: string): Record<CupWeekdayKey, string[]> {
  const out: Record<CupWeekdayKey, string[]> = { fredag: [], lordag: [], sondag: [] };
  const re =
    /\b(fredag|fri(?:day)?|l[øo]rdag|saturday|s[øo]ndag|sunday)\b[^.!?\n]{0,30}?(?:kl\.?\s*)?(\d{1,2})[.:](\d{2})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const day = toCupWeekdayKey(m[1] ?? "");
    if (!day) continue;
    const hh = Number(m[2]);
    const mm = Number(m[3]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) continue;
    out[day].push(`${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  }
  out.fredag = dedupeTimes(out.fredag);
  out.lordag = dedupeTimes(out.lordag);
  out.sondag = dedupeTimes(out.sondag);
  return out;
}

export function extractGlobalCupScheduleTimesForDay(text: string, dayLabel: string | null | undefined): string[] {
  const day = toCupWeekdayKey(dayLabel ?? "");
  if (!day) return [];
  return extractGlobalCupScheduleTimesByDay(text)[day];
}

export function isConditionalTournamentTextForDay(
  blob: string,
  dayLabel: string | null | undefined,
): boolean {
  const spaced = normalizeSpace(blob);
  const n = normalizeNorwegianLetters(spaced);
  const dayKey = toCupWeekdayKey(dayLabel ?? "");
  const mentionsSunday = /\b(sondag|søndag)\b/.test(spaced) || /\bsondag\b/.test(n);
  const mentionsCurrentDay = dayKey ? new RegExp(`\\b${dayKey}\\b`).test(n) : false;
  const sundayConditional =
    mentionsSunday &&
    /\b(sluttspill|finale|cupkamp|semifinale|kamp)\b/.test(n) &&
    /\b(hvis|dersom|eventuell|avhengig|kanskje|evt|kommer\s+senere|tidspunkt\s+kommer)\b/.test(n);

  if (dayKey && dayKey !== "sondag" && sundayConditional) {
    const currentDayConditional = new RegExp(
      `\\b${dayKey}\\b[^.!?\\n]{0,70}\\b(hvis|dersom|eventuell|avhengig|kanskje|evt|ikke\\s+fastsatt|kommer\\s+senere)\\b`,
    ).test(n);
    if (!currentDayConditional) return false;
  }

  if (/\bhvis\s+vi\s+(går|gar)\s+videre\b/.test(n)) return true;
  if (/\b(hvis|dersom)\s+(vi|laget|gruppa|dere)\s+(går|gar|kommer)\b/.test(n)) return true;
  if (/\b(avhengig|evt\.?|eventuell|eventuelle)\b/.test(n) && /\b(sluttspill|cup|finale|spill|kamp)\b/.test(n))
    return true;
  if (/\beventuell\w*\b/.test(n) && /\b(sluttspill|kamp|finale|cup|a-)\b/.test(n)) return true;
  if (/\ba-?sluttspill\b/.test(n)) return true;
  if (/\btidspunkt\s+kommer\b/.test(n)) return true;
  if (/\b(kommer|publiseres)\s+senere\b/.test(n)) return true;
  if (/\bikke\s+fastsatt\b/.test(n)) return true;
  if (/\btba\b/.test(n)) return true;
  if (mentionsSunday && /\b(sluttspill|finale|semifinale)\b/.test(n) && !/\d{1,2}[.:]\d{2}/.test(spaced)) {
    if (!dayKey || dayKey === "sondag") return true;
    if (mentionsCurrentDay) return true;
    return false;
  }
  return false;
}
