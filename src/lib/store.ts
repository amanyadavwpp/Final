import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { activityLog, chapters, lectures, studySessions, subjects } from "@/db/schema";
import {
  DIRECT_TAX_APP_TITLE,
  DIRECT_TAX_SEED,
  SEED_EXTRA_SESSIONS,
} from "./seed-data";
import { FR_COMPLETED, FR_SEED, FR_SUBJECT, durationToHours } from "./seed-fr";
import { AUDIT_COMPLETED, AUDIT_SEED, AUDIT_SUBJECT } from "./seed-audit";
import { parseImportPayload } from "./import-parse";
import type {
  ActivityItem,
  BootstrapPayload,
  Chapter,
  ChapterPlanInput,
  ExportStats,
  Lecture,
  LectureDef,
  SessionKind,
  StudySession,
  Subject,
} from "./types";

type SubjectRow = typeof subjects.$inferSelect;
type ChapterRow = typeof chapters.$inferSelect;
type LectureRow = typeof lectures.$inferSelect;
type SessionRow = typeof studySessions.$inferSelect;
type ActivityRow = typeof activityLog.$inferSelect;

const iso = (value: Date | string | null | undefined): string | null => {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

const mapSubject = (row: SubjectRow): Subject => ({
  id: row.id,
  name: row.name,
  teacher: row.teacher,
  color: row.color,
  defaultHoursPerLecture: row.defaultHoursPerLecture,
  createdAt: iso(row.createdAt) ?? new Date().toISOString(),
  updatedAt: iso(row.updatedAt) ?? new Date().toISOString(),
});

const mapChapter = (row: ChapterRow): Chapter => ({
  id: row.id,
  subjectId: row.subjectId,
  chapterNumber: row.chapterNumber,
  title: row.title,
  lectureCount: row.lectureCount,
  hoursPerLecture: row.hoursPerLecture,
  position: row.position,
  notes: row.notes,
  createdAt: iso(row.createdAt) ?? new Date().toISOString(),
  updatedAt: iso(row.updatedAt) ?? new Date().toISOString(),
});

const mapLecture = (row: LectureRow): Lecture => ({
  id: row.id,
  chapterId: row.chapterId,
  lectureNumber: row.lectureNumber,
  status: row.status === "completed" ? "completed" : "pending",
  hours: row.hours,
  label: row.label,
  sourceNumber: row.sourceNumber,
  partNumber: row.partNumber,
  kind: row.kind ?? "lecture",
  completedAt: iso(row.completedAt),
  notes: row.notes,
  createdAt: iso(row.createdAt) ?? new Date().toISOString(),
  updatedAt: iso(row.updatedAt) ?? new Date().toISOString(),
});

const mapSession = (row: SessionRow): StudySession => ({
  id: row.id,
  subjectId: row.subjectId,
  chapterId: row.chapterId,
  lectureId: row.lectureId,
  subjectName: row.subjectName,
  chapterTitle: row.chapterTitle,
  lectureLabel: row.lectureLabel,
  kind: (row.kind as SessionKind) ?? "lecture",
  hours: row.hours,
  studiedOn: row.studiedOn,
  note: row.note,
  createdAt: iso(row.createdAt) ?? new Date().toISOString(),
  updatedAt: iso(row.updatedAt) ?? new Date().toISOString(),
});

const mapActivity = (row: ActivityRow): ActivityItem => ({
  id: row.id,
  subjectId: row.subjectId,
  chapterId: row.chapterId,
  lectureId: row.lectureId,
  kind: row.kind,
  title: row.title,
  detail: row.detail,
  createdAt: iso(row.createdAt) ?? new Date().toISOString(),
});

export function dayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function daysAgoKey(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return dayKey(d);
}

/** Turns a YYYY-MM-DD key into an evening timestamp so history sorting feels natural. */
export function timestampFromDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map((part) => Number(part));
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d, 20, 0, 0, 0);
}

export async function logActivity(entry: {
  subjectId?: number | null;
  chapterId?: number | null;
  lectureId?: number | null;
  kind: string;
  title: string;
  detail?: string | null;
}) {
  await db.insert(activityLog).values({
    subjectId: entry.subjectId ?? null,
    chapterId: entry.chapterId ?? null,
    lectureId: entry.lectureId ?? null,
    kind: entry.kind,
    title: entry.title,
    detail: entry.detail ?? null,
  });
}

export async function getBootstrap(): Promise<BootstrapPayload> {
  const [subjectRows, chapterRows, lectureRows, sessionRows, activityRows] =
    await Promise.all([
      db.select().from(subjects).orderBy(asc(subjects.id)),
      db.select().from(chapters).orderBy(asc(chapters.subjectId), asc(chapters.position), asc(chapters.id)),
      db.select().from(lectures).orderBy(asc(lectures.chapterId), asc(lectures.lectureNumber)),
      db.select().from(studySessions).orderBy(desc(studySessions.studiedOn), desc(studySessions.id)).limit(400),
      db.select().from(activityLog).orderBy(desc(activityLog.id)).limit(400),
    ]);

  return {
    subjects: subjectRows.map(mapSubject),
    chapters: chapterRows.map(mapChapter),
    lectures: lectureRows.map(mapLecture),
    sessions: sessionRows.map(mapSession),
    activity: activityRows.map(mapActivity),
  };
}

export async function getChapterOrThrow(chapterId: number) {
  const [row] = await db.select().from(chapters).where(eq(chapters.id, chapterId)).limit(1);
  if (!row) return null;
  return row;
}

export async function getSubjectOrThrow(subjectId: number) {
  const [row] = await db.select().from(subjects).where(eq(subjects.id, subjectId)).limit(1);
  if (!row) return null;
  return row;
}

/**
 * Keeps lecture rows in sync with a chapter plan: creates missing rows, drops
 * surplus pending rows (completed ones are preserved for history) and refreshes
 * the default duration on untouched rows.
 */
export async function syncLectureRows(
  chapterId: number,
  lectureCount: number,
  hoursPerLecture: number,
) {
  const existing = await db
    .select()
    .from(lectures)
    .where(eq(lectures.chapterId, chapterId))
    .orderBy(asc(lectures.lectureNumber));

  const byNumber = new Map(existing.map((row) => [row.lectureNumber, row]));
  const missing: { chapterId: number; lectureNumber: number; hours: number }[] = [];
  for (let n = 1; n <= lectureCount; n += 1) {
    if (!byNumber.has(n)) missing.push({ chapterId, lectureNumber: n, hours: hoursPerLecture });
  }
  if (missing.length) await db.insert(lectures).values(missing);

  const surplus = existing
    .filter((row) => row.lectureNumber > lectureCount && row.status !== "completed")
    .map((row) => row.id);
  if (surplus.length) {
    await db.delete(lectures).where(inArray(lectures.id, surplus));
  }

  // Only plain (unlabelled) slots follow the chapter default — described lectures
  // keep their exact runtime.
  await db
    .update(lectures)
    .set({ hours: hoursPerLecture, updatedAt: new Date() })
    .where(
      and(
        eq(lectures.chapterId, chapterId),
        eq(lectures.status, "pending"),
        isNull(lectures.label),
      ),
    );
}

/** Applies an exact completion set to a chapter (used by import + bulk actions). */
export async function applyChapterCompletions(
  chapterId: number,
  completedLectures: number[],
  studiedOn: string | ((lectureNumber: number) => string),
  options: { log?: boolean } = {},
) {
  const chapter = await getChapterOrThrow(chapterId);
  if (!chapter) return;
  const subject = await getSubjectOrThrow(chapter.subjectId);
  const rows = await db.select().from(lectures).where(eq(lectures.chapterId, chapterId));
  const wanted = new Set(completedLectures);
  const label = (row: typeof rows[number]) =>
    row.label
      ? `${chapter.title} · ${row.label}`
      : chapter.chapterNumber === null
        ? `${chapter.title} · Lecture ${row.lectureNumber}`
        : `Ch ${chapter.chapterNumber} · Lecture ${row.lectureNumber}`;

  for (const row of rows) {
    const shouldComplete = wanted.has(row.lectureNumber);
    if (shouldComplete && row.status !== "completed") {
      const day = typeof studiedOn === "function" ? studiedOn(row.lectureNumber) : studiedOn;
      const completedAt = timestampFromDayKey(day);
      await db
        .update(lectures)
        .set({ status: "completed", completedAt, updatedAt: new Date() })
        .where(eq(lectures.id, row.id));
      await db.insert(studySessions).values({
        subjectId: chapter.subjectId,
        chapterId,
        lectureId: row.id,
        subjectName: subject?.name ?? "Subject",
        chapterTitle: chapter.title,
        lectureLabel: label(row),
        kind: "lecture",
        hours: row.hours,
        studiedOn: day,
        note: null,
      });
      if (options.log !== false) {
        await logActivity({
          subjectId: chapter.subjectId,
          chapterId,
          lectureId: row.id,
          kind: "completed",
          title: label(row),
          detail: `${row.hours}h lecture marked complete`,
        });
      }
    } else if (!shouldComplete && row.status === "completed") {
      await db
        .update(lectures)
        .set({ status: "pending", completedAt: null, updatedAt: new Date() })
        .where(eq(lectures.id, row.id));
      await db
        .delete(studySessions)
        .where(and(eq(studySessions.lectureId, row.id), eq(studySessions.kind, "lecture")));
      if (options.log !== false) {
        await logActivity({
          subjectId: chapter.subjectId,
          chapterId,
          lectureId: row.id,
          kind: "reopened",
          title: label(row),
          detail: "Lecture moved back to pending",
        });
      }
    }
  }
}

export async function createChapterFromPlan(
  subjectId: number,
  plan: ChapterPlanInput,
  position: number,
  studiedOn: string | ((lectureNumber: number) => string),
): Promise<number> {
  const [chapter] = await db
    .insert(chapters)
    .values({
      subjectId,
      chapterNumber: plan.chapterNumber,
      title: plan.title,
      lectureCount: plan.lectureCount,
      hoursPerLecture: plan.hoursPerLecture,
      position,
      notes: null,
    })
    .returning();
  await syncLectureRows(chapter.id, plan.lectureCount, plan.hoursPerLecture);
  await applyChapterCompletions(chapter.id, plan.completedLectures, studiedOn, { log: false });
  await logActivity({
    subjectId,
    chapterId: chapter.id,
    kind: "created",
    title: plan.chapterNumber === null ? plan.title : `Ch ${plan.chapterNumber} — ${plan.title}`,
    detail: `${plan.lectureCount} lectures · ${plan.hoursPerLecture}h each · ${plan.completedLectures.length} already done`,
  });
  return chapter.id;
}

/**
 * Creates a chapter whose lectures are fully described (label + exact runtime),
 * e.g. the Financial Reporting batch where every lecture is split into parts.
 */
export async function createChapterWithLectures(
  subjectId: number,
  plan: ChapterPlanInput,
  position: number,
  studiedOn: string | ((position: number) => string),
): Promise<number> {
  const defs: LectureDef[] = plan.lectures ?? [];
  const timed = defs.filter((def) => (def.hours ?? 0) > 0);
  const average = timed.length
    ? Math.round((timed.reduce((sum, def) => sum + (def.hours ?? 0), 0) / timed.length) * 100) / 100
    : 0;
  // Chapters with no lectures at all (e.g. a pure "Instructions" section) keep 0.
  const hoursPerLecture = plan.hoursPerLecture || (defs.length ? average || 3 : 0);

  const [chapter] = await db
    .insert(chapters)
    .values({
      subjectId,
      chapterNumber: plan.chapterNumber,
      title: plan.title,
      lectureCount: defs.length,
      hoursPerLecture,
      position,
      notes: plan.notes ?? null,
    })
    .returning();

  if (defs.length) {
    await db.insert(lectures).values(
      defs.map((def, index) => ({
        chapterId: chapter.id,
        lectureNumber: index + 1,
        hours: def.hours ?? 0,
        label: def.label ?? null,
        sourceNumber: def.sourceNumber ?? null,
        partNumber: def.partNumber ?? null,
        kind: def.kind ?? "lecture",
        status: def.completed ? "completed" : "pending",
        completedAt: def.completed ? new Date() : null,
      })),
    );
  }

  const completed = plan.completedLectures
    .map((n) => Math.round(Number(n)))
    .filter((n) => n >= 1 && n <= defs.length);

  if (completed.length) {
    await applyChapterCompletions(
      chapter.id,
      completed,
      typeof studiedOn === "function" ? studiedOn : () => studiedOn,
      { log: false },
    );
  }

  await logActivity({
    subjectId,
    chapterId: chapter.id,
    kind: "created",
    title: plan.chapterNumber === null ? plan.title : `Ch ${plan.chapterNumber} — ${plan.title}`,
    detail: `${defs.length} sessions · ${timed.reduce((sum, def) => sum + (def.hours ?? 0), 0).toFixed(1)}h planned`,
  });
  return chapter.id;
}

/** Picks the right creator: plain counted chapters vs fully described lecture lists. */
export async function createChapterAuto(
  subjectId: number,
  plan: ChapterPlanInput,
  position: number,
  studiedOn: string | ((position: number) => string),
): Promise<number> {
  return plan.lectures?.length
    ? createChapterWithLectures(subjectId, plan, position, studiedOn)
    : createChapterFromPlan(subjectId, plan, position, typeof studiedOn === "function" ? studiedOn(1) : studiedOn);
}

export function normalisePlan(raw: ChapterPlanInput): ChapterPlanInput {
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

/** Accepts either a full export object, a bare chapters array, or a single chapter. */

export async function computeStats(subjectId: number): Promise<ExportStats> {
  const chapterRows = await db.select().from(chapters).where(eq(chapters.subjectId, subjectId));
  const ids = chapterRows.map((row) => row.id);
  const lectureRows = ids.length
    ? await db.select().from(lectures).where(inArray(lectures.chapterId, ids))
    : [];

  const totalLectures = lectureRows.length;
  const completed = lectureRows.filter((row) => row.status === "completed");
  const plannedHours = lectureRows.reduce((sum, row) => sum + row.hours, 0);
  const studiedHours = completed.reduce((sum, row) => sum + row.hours, 0);
  const completedChapters = chapterRows.filter((row) => {
    const own = lectureRows.filter((l) => l.chapterId === row.id);
    return own.length > 0 && own.every((l) => l.status === "completed");
  }).length;

  return {
    plannedChapters: chapterRows.length,
    completedChapters,
    totalLectures,
    completedLectures: completed.length,
    plannedHours: Math.round(plannedHours * 10) / 10,
    studiedHours: Math.round(studiedHours * 10) / 10,
    remainingHours: Math.round((plannedHours - studiedHours) * 10) / 10,
    progress: totalLectures ? Math.round((completed.length / totalLectures) * 100) : 0,
  };
}

export async function buildExport(subjectId: number) {
  const subject = await getSubjectOrThrow(subjectId);
  if (!subject) return null;
  const chapterRows = await db
    .select()
    .from(chapters)
    .where(eq(chapters.subjectId, subjectId))
    .orderBy(asc(chapters.position), asc(chapters.id));
  const ids = chapterRows.map((row) => row.id);
  const lectureRows = ids.length
    ? await db
        .select()
        .from(lectures)
        .where(inArray(lectures.chapterId, ids))
        .orderBy(asc(lectures.chapterId), asc(lectures.lectureNumber))
    : [];

  const payload = {
    app: `${subject.teacher ? `${subject.teacher} — ` : ""}${subject.name}`.trim(),
    exportedAt: new Date().toISOString(),
    defaultHours: subject.defaultHoursPerLecture,
    stats: await computeStats(subjectId),
    chapters: chapterRows.map((chapter) => {
      const own = lectureRows.filter((row) => row.chapterId === chapter.id);
      const completed = own.filter((row) => row.status === "completed");
      const lastUpdate = completed.reduce<Date | null>((acc, row) => {
        const value = row.completedAt ? new Date(row.completedAt) : null;
        if (!value) return acc;
        return !acc || value > acc ? value : acc;
      }, null);
      const described = own.filter((row) => row.label);
      const plannedHours = own.reduce((sum, row) => sum + row.hours, 0);
      return {
        chapterNumber: chapter.chapterNumber,
        title: chapter.title,
        notes: chapter.notes,
        plan: {
          lectureCount: chapter.lectureCount,
          hoursPerLecture: chapter.hoursPerLecture,
          totalHours: Math.round(plannedHours * 100) / 100,
          completedCount: completed.length,
          completedLectures: completed.map((row) => row.lectureNumber).sort((a, b) => a - b),
          remainingLectures: chapter.lectureCount - completed.length,
          progressPercent: chapter.lectureCount
            ? Math.round((completed.length / chapter.lectureCount) * 100)
            : 0,
          updatedAt: (lastUpdate ?? chapter.updatedAt).toISOString(),
        },
        lectures: described.length
          ? own.map((row) => ({
              label: row.label,
              lecture: row.sourceNumber,
              part: row.partNumber,
              hours: row.hours,
              kind: row.kind,
              status: row.status,
              completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : null,
            }))
          : undefined,
      };
    }),
  };
  return payload;
}

let seedPromise: Promise<void> | null = null;

async function seedDirectTax() {
  const existing = await db.select().from(subjects).where(eq(subjects.name, "Direct Tax")).limit(1);
  if (existing.length) return;

  const [subject] = await db
    .insert(subjects)
    .values({
      name: "Direct Tax",
      teacher: "JK Shah Classes",
      color: "indigo",
      defaultHoursPerLecture: 3,
    })
    .returning();

  await logActivity({
    subjectId: subject.id,
    kind: "created",
    title: "Direct Tax",
    detail: `${DIRECT_TAX_APP_TITLE} imported`,
  });

  // Spread the already-studied lectures across the last couple of weeks so the
  // history view and the daily-hours chart look realistic.
  let dayCursor = 11;
  for (let i = 0; i < DIRECT_TAX_SEED.length; i += 1) {
    const plan = DIRECT_TAX_SEED[i];
    const dayMap = new Map<number, string>();
    for (const lectureNumber of plan.completedLectures) {
      dayMap.set(lectureNumber, daysAgoKey(dayCursor));
      dayCursor = dayCursor <= 1 ? 1 : dayCursor - 1;
    }
    await createChapterFromPlan(
      subject.id,
      plan,
      i,
      plan.completedLectures.length
        ? (lectureNumber) => dayMap.get(lectureNumber) ?? daysAgoKey(0)
        : daysAgoKey(0),
    );
  }

  const chapterRows = await db
    .select()
    .from(chapters)
    .where(eq(chapters.subjectId, subject.id));

  for (const extra of SEED_EXTRA_SESSIONS) {
    const chapter = chapterRows.find((row) => row.title === extra.chapterTitle);
    await db.insert(studySessions).values({
      subjectId: subject.id,
      chapterId: chapter?.id ?? null,
      lectureId: null,
      subjectName: subject.name,
      chapterTitle: extra.chapterTitle,
      lectureLabel: null,
      kind: extra.kind,
      hours: extra.hours,
      studiedOn: daysAgoKey(extra.daysAgo),
      note: extra.note,
    });
  }

  await logActivity({
    subjectId: subject.id,
    kind: "imported",
    title: "Demo data seeded",
    detail: `${DIRECT_TAX_SEED.length} chapters · ${DIRECT_TAX_SEED.reduce((s, p) => s + p.lectureCount, 0)} lectures`,
  });
}

async function seedFinancialReporting() {
  const existing = await db
    .select()
    .from(subjects)
    .where(eq(subjects.name, FR_SUBJECT.name))
    .limit(1);
  if (existing.length) return;

  const [subject] = await db
    .insert(subjects)
    .values({
      name: FR_SUBJECT.name,
      teacher: FR_SUBJECT.teacher,
      color: FR_SUBJECT.color,
      defaultHoursPerLecture: FR_SUBJECT.defaultHoursPerLecture,
    })
    .returning();

  await logActivity({
    subjectId: subject.id,
    kind: "imported",
    title: FR_SUBJECT.name,
    detail: `${FR_SUBJECT.appTitle} — ${FR_SEED.length} chapters imported`,
  });

  let dayCursor = 6;
  for (let i = 0; i < FR_SEED.length; i += 1) {
    const plan = FR_SEED[i];
    const doneCount = FR_COMPLETED[plan.title] ?? 0;
    const completed = Array.from({ length: doneCount }, (_, index) => index + 1);
    const dayMap = new Map<number, string>();
    for (const position of completed) {
      dayMap.set(position, daysAgoKey(dayCursor));
      dayCursor = dayCursor <= 1 ? 1 : dayCursor - 1;
    }
    await createChapterWithLectures(
      subject.id,
      { ...plan, completedLectures: completed },
      i,
      completed.length
        ? (position: number) => dayMap.get(position) ?? daysAgoKey(0)
        : daysAgoKey(0),
    );
  }

  await db.insert(studySessions).values({
    subjectId: subject.id,
    chapterId: null,
    lectureId: null,
    subjectName: subject.name,
    chapterTitle: null,
    lectureLabel: null,
    kind: "revision",
    hours: 1,
    studiedOn: daysAgoKey(3),
    note: "Revised Ind AS 16 solved examples",
  });
}

async function seedAudit() {
  const existing = await db
    .select()
    .from(subjects)
    .where(eq(subjects.name, AUDIT_SUBJECT.name))
    .limit(1);
  if (existing.length) return;

  const [subject] = await db
    .insert(subjects)
    .values({
      name: AUDIT_SUBJECT.name,
      teacher: AUDIT_SUBJECT.teacher,
      color: AUDIT_SUBJECT.color,
      defaultHoursPerLecture: AUDIT_SUBJECT.defaultHoursPerLecture,
    })
    .returning();

  await logActivity({
    subjectId: subject.id,
    kind: "imported",
    title: AUDIT_SUBJECT.name,
    detail: `${AUDIT_SUBJECT.appTitle} — ${AUDIT_SEED.length} chapters imported`,
  });

  let dayCursor = 5;
  for (let i = 0; i < AUDIT_SEED.length; i += 1) {
    const plan = AUDIT_SEED[i];
    const doneCount = AUDIT_COMPLETED[plan.title] ?? 0;
    const completed = Array.from({ length: doneCount }, (_, index) => index + 1);
    const dayMap = new Map<number, string>();
    for (const position of completed) {
      dayMap.set(position, daysAgoKey(dayCursor));
      dayCursor = dayCursor <= 1 ? 1 : dayCursor - 1;
    }
    await createChapterWithLectures(
      subject.id,
      { ...plan, completedLectures: completed },
      i,
      completed.length
        ? (position: number) => dayMap.get(position) ?? daysAgoKey(0)
        : daysAgoKey(0),
    );
  }

  await db.insert(studySessions).values({
    subjectId: subject.id,
    chapterId: null,
    lectureId: null,
    subjectName: subject.name,
    chapterTitle: null,
    lectureLabel: null,
    kind: "revision",
    hours: 0.75,
    studiedOn: daysAgoKey(2),
    note: "Revised SQC 1 key points",
  });
}

async function runSeed() {
  await seedDirectTax();
  await seedFinancialReporting();
  await seedAudit();
}

export async function ensureSeeded() {
  if (!seedPromise) {
    seedPromise = runSeed().catch((error) => {
      seedPromise = null;
      throw error;
    });
  }
  await seedPromise;
}

export async function resetToSeed() {
  await db.delete(activityLog);
  await db.delete(studySessions);
  await db.delete(chapters);
  await db.delete(subjects);
  seedPromise = null;
  await ensureSeeded();
}

export const mappers = { mapSubject, mapChapter, mapLecture, mapSession, mapActivity };
