import type { RegressionPortalBundle } from "@/lib/tankestrom-regression-fixture-runner";
import { stripGeneratedCupNoise } from "@/lib/cup-day-content";
import type { DayKey, TimePrecision } from "@/evals/tankestrom-expected";

function dayKeyFromTitle(title: string): DayKey | null {
  const t = title.toLowerCase();
  if (/\blørdag\b|saturday\b/.test(t)) return "lørdag";
  if (/\bsøndag\b|sunday\b/.test(t)) return "søndag";
  if (/\bfredag\b|friday\b/.test(t)) return "fredag";
  return null;
}

function joinNotes(parts: (string | undefined)[]): string | null {
  const raw = parts.flatMap((p) => (p ? p.split(/\r?\n/) : [])).map((s) => s.trim()).filter(Boolean);
  const lines = raw
    .map((s) => stripGeneratedCupNoise(s).trim())
    .filter(Boolean)
    .filter(
      (s) =>
        !/^(høydepunkter|hoydepunkter|notater|husk|dagens\s+innhold|husk\s*\/\s*ta\s+med)\s*:/i.test(s),
    );
  if (!lines.length) return null;
  return [...new Set(lines)].join("\n");
}

type BundleItem = {
  kind: string;
  event?: {
    title?: string;
    date?: string;
    start?: string | null;
    metadata?: {
      isArrangementParent?: boolean;
      embeddedSchedule?: EmbeddedSeg[];
      arrangementCoreTitle?: string;
    };
  };
  task?: {
    title?: string;
    date?: string;
    dueTime?: string;
  };
};

type EmbeddedSeg = {
  date: string;
  title: string;
  start?: string | null;
  startTime?: string | null;
  timePrecision?: TimePrecision;
  isConditional?: boolean;
  notes?: string;
  dayContent?: {
    highlights?: string[];
    bringItems?: string[];
    logisticsNotes?: string[];
    generalNotes?: string[];
    uncertaintyNotes?: string[];
  };
};

/**
 * Mapper portal-import bundle (items) til RegressionPortalBundle for eval-scorere.
 * Forutsetter parent-event med embeddedSchedule (cup/flerdagers).
 */
export function portalBundleToRegressionBundle(bundle: Record<string, unknown>): RegressionPortalBundle {
  const items = bundle.items as BundleItem[] | undefined;
  if (!Array.isArray(items)) {
    return { parentTitle: "", children: [], tasks: [] };
  }

  const events = items.filter((i) => i.kind === "event" && i.event);
  const parent = events.find((e) => e.event?.metadata?.embeddedSchedule?.length);
  const emb = parent?.event?.metadata?.embeddedSchedule;
  if (!parent?.event || !emb?.length) {
    return { parentTitle: parent?.event?.title ?? "", children: [], tasks: [] };
  }

  const parentTitle =
    parent.event.metadata?.arrangementCoreTitle?.trim() || parent.event.title?.trim() || "";

  const children = emb
    .map((seg) => {
      const day = dayKeyFromTitle(seg.title);
      if (!day) return null;
      const dc = seg.dayContent;
      const highlights = [...(dc?.highlights ?? [])];
      const notesFlat = joinNotes([
        seg.notes,
        ...(dc?.logisticsNotes ?? []),
        ...(dc?.generalNotes ?? []),
        ...(dc?.uncertaintyNotes ?? []),
      ]);
      const timePrecision: TimePrecision = seg.timePrecision ?? "date_only";
      const tentative = Boolean(seg.isConditional);
      const start = seg.start ?? seg.startTime ?? null;
      return {
        day,
        title: seg.title,
        date: seg.date ?? null,
        start,
        timePrecision,
        tentative,
        highlights,
        bringItems: [...(dc?.bringItems ?? [])],
        notes: notesFlat,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  const dayOrder: DayKey[] = ["fredag", "lørdag", "søndag"];
  children.sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day));

  const tasks = items
    .filter((i) => i.kind === "task" && i.task)
    .map((i) => ({
      title: i.task!.title ?? "",
      date: i.task!.date?.trim() ? i.task!.date : null,
      dueTime: i.task!.dueTime?.trim() ? i.task!.dueTime : null,
    }));

  return {
    parentTitle,
    children,
    tasks,
  };
}
