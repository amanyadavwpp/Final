import type { ChapterPlanInput, LectureDef } from "./types";
import { durationToHours } from "./batch-source";

/**
 * Accepts the tracker export shape, a bare chapters array, or a single chapter,
 * and normalises it into chapter plans. Lives outside `store.ts` so the static
 * (localStorage) build can use it without pulling in the database driver.
 */

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

function normalise(raw: ChapterPlanInput): ChapterPlanInput {
  const lectureCount = Math.max(0, Math.min(500, Math.round(Number(raw.lectureCount) || 0)));
  const hours = Math.max(0, Math.min(24, Number(raw.hoursPerLecture) || 3));
  return {
    chapterNumber:
      raw.chapterNumber === null || raw.chapterNumber === undefined
        ? null
        : Math.max(0, Math.min(999, Math.round(Number(raw.chapterNumber)))),
    title: (raw.title ?? "").toString().trim() || "Untitled chapter",
    lectureCount,
    hoursPerLecture: hours,
    completedLectures: Array.isArray(raw.completedLectures)
      ? raw.completedLectures
          .map((n) => Math.round(Number(n)))
          .filter((n) => Number.isFinite(n) && n >= 1 && n <= lectureCount)
      : [],
    lectures: Array.isArray(raw.lectures) ? raw.lectures : undefined,
    notes: raw.notes ?? null,
    updatedAt: raw.updatedAt ?? null,
  };
}

export function parseImportPayload(
  input: unknown,
): { appName: string; defaultHours: number; plans: ChapterPlanInput[] } {
  let source: unknown = input;

  // The import UI sends the raw textarea contents, so accept a JSON string too.
  if (typeof source === "string") {
    const trimmed = source.trim();
    if (!trimmed) return { appName: "Imported tracker", defaultHours: 3, plans: [] };
    try {
      source = JSON.parse(trimmed) as unknown;
    } catch {
      return { appName: "Imported tracker", defaultHours: 3, plans: [] };
    }
  }

  const root = asRecord(source);
  const defaultHours = Number(root.defaultHours) || 3;
  let appName = typeof root.app === "string" ? root.app : "";

  let rawPlans: unknown[] = [];
  if (Array.isArray(root.chapters)) rawPlans = root.chapters;
  else if (Array.isArray(source)) rawPlans = source as unknown[];
  else if (Array.isArray(root.plans)) rawPlans = root.plans;
  else if (root.title) rawPlans = [root];

  const plans = rawPlans.map((entry) => {
    const record = asRecord(entry);
    const plan = asRecord(record.plan);
    const completed = Array.isArray(plan.completedLectures)
      ? (plan.completedLectures as unknown[])
      : Array.isArray(record.completedLectures)
        ? (record.completedLectures as unknown[])
        : [];

    const rawLectures = Array.isArray(plan.lectures)
      ? (plan.lectures as unknown[])
      : Array.isArray(record.lectures)
        ? (record.lectures as unknown[])
        : [];

    const lectures: LectureDef[] = rawLectures.map((item) => {
      const entry_ = asRecord(item);
      const source_ = entry_.sourceNumber ?? entry_.lecture ?? entry_.lectureNumber ?? null;
      const part = entry_.partNumber ?? entry_.part ?? null;
      const suffix = typeof entry_.suffix === "string" ? entry_.suffix : "";
      const hoursRaw =
        entry_.hours !== undefined && entry_.hours !== null
          ? Number(entry_.hours)
          : durationToHours(typeof entry_.duration === "string" ? entry_.duration : null);
      return {
        label:
          (typeof entry_.label === "string" && entry_.label.trim()) ||
          (source_ && part
            ? suffix
              ? `Lecture ${source_}, Part ${part} — ${suffix}`
              : `Lecture ${source_}, Part ${part}`
            : null),
        sourceNumber: source_ === null ? null : Number(source_),
        partNumber: part === null ? null : Number(part),
        hours: hoursRaw !== null && Number.isFinite(hoursRaw) ? hoursRaw : 0,
        kind: entry_.kind === "milestone" ? "milestone" : "lecture",
        completed: entry_.completed === true || entry_.status === "completed",
      };
    });

    return normalise({
      chapterNumber:
        record.chapterNumber === undefined || record.chapterNumber === null
          ? null
          : Number(record.chapterNumber),
      title: String(record.title ?? "Untitled chapter"),
      lectureCount: lectures.length
        ? lectures.length
        : Number(plan.lectureCount ?? record.lectureCount ?? 0),
      hoursPerLecture:
        Number(plan.hoursPerLecture ?? record.hoursPerLecture ?? defaultHours) || defaultHours,
      completedLectures: completed.map((n) => Number(n)),
      lectures: lectures.length ? lectures : undefined,
      notes: typeof record.notes === "string" ? record.notes : null,
      updatedAt: typeof plan.updatedAt === "string" ? plan.updatedAt : null,
    });
  });

  return { appName: appName || "Imported tracker", defaultHours, plans };
}
