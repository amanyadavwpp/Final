import {
  AUDIT_COMPLETED,
  AUDIT_SEED,
  AUDIT_SUBJECT,
} from "./seed-audit";
import { DIRECT_TAX_APP_TITLE, DIRECT_TAX_SEED, SEED_EXTRA_SESSIONS } from "./seed-data";
import { FR_COMPLETED, FR_SEED, FR_SUBJECT } from "./seed-fr";
import { dayKeyOf, shiftDayKey } from "./format";
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

/**
 * Browser-only data engine.
 *
 * GitHub Pages can only serve static files, so when the app is exported the
 * API routes disappear. This module implements the exact same operations
 * against localStorage, which lets one codebase run in two modes:
 *
 *   server mode  -> PostgreSQL through /api/* (full history + audit trail)
 *   static mode  -> localStorage (works offline, no backend needed)
 */

const DB_KEY = "ca-final-tracker-db-v2";

export const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "1";

type Db = BootstrapPayload;

let cache: Db | null = null;
let idCursor = 5000;

const nextId = () => {
  idCursor += 1;
  return idCursor;
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function blank(): Db {
  return { subjects: [], chapters: [], lectures: [], sessions: [], activity: [] };
}

function read(): Db {
  if (cache) return cache;
  if (typeof window === "undefined") return blank();
  try {
    const raw = window.localStorage.getItem(DB_KEY);
    if (!raw) return blank();
    const parsed = JSON.parse(raw) as Partial<Db>;
    cache = {
      subjects: parsed.subjects ?? [],
      chapters: parsed.chapters ?? [],
      lectures: parsed.lectures ?? [],
      sessions: parsed.sessions ?? [],
      activity: parsed.activity ?? [],
    };
    return cache;
  } catch {
    return blank();
  }
}

function write(db: Db) {
  cache = db;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    /* quota exceeded — keep the in-memory copy so the session still works */
  }
}

function log(
  db: Db,
  entry: {
    subjectId?: number | null;
    chapterId?: number | null;
    lectureId?: number | null;
    kind: string;
    title: string;
    detail?: string | null;
  },
) {
  db.activity.unshift({
    id: nextId(),
    subjectId: entry.subjectId ?? null,
    chapterId: entry.chapterId ?? null,
    lectureId: entry.lectureId ?? null,
    kind: entry.kind,
    title: entry.title,
    detail: entry.detail ?? null,
    createdAt: new Date().toISOString(),
  });
  db.activity = db.activity.slice(0, 800);
}

const chapterLabel = (chapter: Chapter) =>
  chapter.chapterNumber === null ? chapter.title : `Ch ${chapter.chapterNumber} — ${chapter.title}`;

const lectureLabel = (chapter: Chapter, lecture: Lecture) =>
  lecture.label
    ? `${chapter.title} · ${lecture.label}`
    : chapter.chapterNumber === null
      ? `${chapter.title} · Lecture ${lecture.lectureNumber}`
      : `Ch ${chapter.chapterNumber} · Lecture ${lecture.lectureNumber}`;

function lectureRows(
  db: Db,
  chapterId: number,
  count: number,
  hours: number,
  defs?: LectureDef[],
): Lecture[] {
  const now = new Date().toISOString();
  return Array.from({ length: count }, (_, index) => {
    const def = defs?.[index];
    return {
      id: nextId(),
      chapterId,
      lectureNumber: index + 1,
      status: def?.completed ? ("completed" as const) : ("pending" as const),
      hours: def?.hours ?? hours,
      label: def?.label ?? null,
      sourceNumber: def?.sourceNumber ?? null,
      partNumber: def?.partNumber ?? null,
      kind: def?.kind ?? "lecture",
      completedAt: null,
      notes: null,
      createdAt: now,
      updatedAt: now,
    };
  });
}

/** Mirrors the server: adds missing slots, drops surplus pending ones. */
function syncLectures(db: Db, chapter: Chapter, count: number, hours: number) {
  const existing = db.lectures
    .filter((lecture) => lecture.chapterId === chapter.id)
    .sort((a, b) => a.lectureNumber - b.lectureNumber);

  const missing: Lecture[] = [];
  for (let n = 1; n <= count; n += 1) {
    if (!existing.some((lecture) => lecture.lectureNumber === n)) {
      const now = new Date().toISOString();
      missing.push({
        id: nextId(),
        chapterId: chapter.id,
        lectureNumber: n,
        status: "pending",
        hours,
        label: null,
        sourceNumber: null,
        partNumber: null,
        kind: "lecture",
        completedAt: null,
        notes: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  const keep = existing.filter(
    (lecture) => lecture.lectureNumber <= count || lecture.status === "completed",
  );
  const removed = existing.filter((lecture) => !keep.includes(lecture));

  db.lectures = db.lectures
    .filter((lecture) => !removed.includes(lecture))
    .concat(missing)
    .map((lecture) =>
      lecture.chapterId === chapter.id && lecture.status === "pending" && !lecture.label
        ? { ...lecture, hours }
        : lecture,
    );
}

/** Applies an exact completion set, writing study-log + activity entries. */
function applyCompletions(
  db: Db,
  chapterId: number,
  completed: number[],
  studiedOn: string,
  quiet = false,
) {
  const chapter = db.chapters.find((row) => row.id === chapterId);
  if (!chapter) return;
  const subject = db.subjects.find((row) => row.id === chapter.subjectId);
  const wanted = new Set(completed);

  for (const lecture of db.lectures.filter((row) => row.chapterId === chapterId)) {
    const should = wanted.has(lecture.lectureNumber);
    if (should && lecture.status !== "completed") {
      lecture.status = "completed";
      lecture.completedAt = new Date().toISOString();
      db.sessions.unshift({
        id: nextId(),
        subjectId: chapter.subjectId,
        chapterId,
        lectureId: lecture.id,
        subjectName: subject?.name ?? "Subject",
        chapterTitle: chapter.title,
        lectureLabel: lectureLabel(chapter, lecture),
        kind: "lecture",
        hours: lecture.hours,
        studiedOn,
        note: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      if (!quiet) {
        log(db, {
          subjectId: chapter.subjectId,
          chapterId,
          lectureId: lecture.id,
          kind: "completed",
          title: lectureLabel(chapter, lecture),
          detail: `${lecture.hours}h lecture marked complete`,
        });
      }
    } else if (!should && lecture.status === "completed") {
      lecture.status = "pending";
      lecture.completedAt = null;
      db.sessions = db.sessions.filter(
        (session) => !(session.lectureId === lecture.id && session.kind === "lecture"),
      );
      if (!quiet) {
        log(db, {
          subjectId: chapter.subjectId,
          chapterId,
          lectureId: lecture.id,
          kind: "reopened",
          title: lectureLabel(chapter, lecture),
          detail: "Lecture moved back to pending",
        });
      }
    }
  }
}

function createChapter(db: Db, subjectId: number, plan: ChapterPlanInput, position: number, studiedOn: string) {
  const now = new Date().toISOString();
  const defs = plan.lectures ?? [];
  const timed = defs.filter((def) => (def.hours ?? 0) > 0);
  const average = timed.length
    ? Math.round((timed.reduce((sum, def) => sum + (def.hours ?? 0), 0) / timed.length) * 100) / 100
    : 0;
  const chapter: Chapter = {
    id: nextId(),
    subjectId,
    chapterNumber: plan.chapterNumber,
    title: plan.title,
    lectureCount: defs.length || plan.lectureCount,
    hoursPerLecture: plan.hoursPerLecture || (defs.length ? average || 3 : 0),
    position,
    notes: plan.notes ?? null,
    createdAt: now,
    updatedAt: now,
  };
  db.chapters.push(chapter);

  if (defs.length) {
    db.lectures.push(...lectureRows(db, chapter.id, defs.length, chapter.hoursPerLecture, defs));
  } else if (chapter.lectureCount) {
    db.lectures.push(...lectureRows(db, chapter.id, chapter.lectureCount, chapter.hoursPerLecture));
  }

  if (plan.completedLectures.length) {
    applyCompletions(db, chapter.id, plan.completedLectures, studiedOn, true);
  }

  log(db, {
    subjectId,
    chapterId: chapter.id,
    kind: "created",
    title: chapterLabel(chapter),
    detail: defs.length
      ? `${defs.length} sessions · ${timed.reduce((sum, def) => sum + (def.hours ?? 0), 0).toFixed(1)}h planned`
      : `${chapter.lectureCount} lectures · ${chapter.hoursPerLecture}h each`,
  });
  return chapter.id;
}

/* -------------------------------------------------------------------------- */
/* Seeding                                                                    */
/* -------------------------------------------------------------------------- */

function seedSubject(
  db: Db,
  subject: { name: string; teacher: string; color: string; defaultHoursPerLecture: number },
  plans: ChapterPlanInput[],
  completedByTitle: Record<string, number>,
  startDay: number,
) {
  const created: Subject = {
    id: nextId(),
    name: subject.name,
    teacher: subject.teacher,
    color: subject.color,
    defaultHoursPerLecture: subject.defaultHoursPerLecture,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.subjects.push(created);

  let dayCursor = startDay;
  plans.forEach((plan, index) => {
    const done = completedByTitle[plan.title] ?? 0;
    const completed = Array.from({ length: done }, (_, i) => i + 1);
    if (completed.length) {
      completed.forEach(() => {
        dayCursor = dayCursor <= 1 ? 1 : dayCursor - 1;
      });
    }
    createChapter(db, created.id, { ...plan, completedLectures: completed }, index, shiftDayKey(dayCursor));
  });

  return created;
}

export function seed(db: Db) {
  const direct = seedSubject(
    db,
    { name: "Direct Tax", teacher: "JK Shah Classes", color: "indigo", defaultHoursPerLecture: 3 },
    DIRECT_TAX_SEED,
    { "Introduction to DT": 3, "Capital Gains": 5 },
    11,
  );
  log(db, {
    subjectId: direct.id,
    kind: "imported",
    title: "Direct Tax",
    detail: `${DIRECT_TAX_APP_TITLE} — ${DIRECT_TAX_SEED.length} chapters imported`,
  });

  for (const extra of SEED_EXTRA_SESSIONS) {
    const chapter = db.chapters.find((row) => row.title === extra.chapterTitle && row.subjectId === direct.id);
    db.sessions.unshift({
      id: nextId(),
      subjectId: direct.id,
      chapterId: chapter?.id ?? null,
      lectureId: null,
      subjectName: direct.name,
      chapterTitle: extra.chapterTitle,
      lectureLabel: null,
      kind: extra.kind as SessionKind,
      hours: extra.hours,
      studiedOn: shiftDayKey(extra.daysAgo),
      note: extra.note,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  const fr = seedSubject(db, FR_SUBJECT, FR_SEED, FR_COMPLETED, 6);
  log(db, {
    subjectId: fr.id,
    kind: "imported",
    title: FR_SUBJECT.name,
    detail: `${FR_SUBJECT.appTitle} — ${FR_SEED.length} chapters imported`,
  });

  const audit = seedSubject(db, AUDIT_SUBJECT, AUDIT_SEED, AUDIT_COMPLETED, 5);
  log(db, {
    subjectId: audit.id,
    kind: "imported",
    title: AUDIT_SUBJECT.name,
    detail: `${AUDIT_SUBJECT.appTitle} — ${AUDIT_SEED.length} chapters imported`,
  });

  db.sessions.unshift({
    id: nextId(),
    subjectId: fr.id,
    chapterId: null,
    lectureId: null,
    subjectName: fr.name,
    chapterTitle: null,
    lectureLabel: null,
    kind: "revision",
    hours: 1,
    studiedOn: shiftDayKey(3),
    note: "Revised Ind AS 16 solved examples",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  db.sessions.unshift({
    id: nextId(),
    subjectId: audit.id,
    chapterId: null,
    lectureId: null,
    subjectName: audit.name,
    chapterTitle: null,
    lectureLabel: null,
    kind: "revision",
    hours: 0.75,
    studiedOn: shiftDayKey(2),
    note: "Revised SQC 1 key points",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

/* -------------------------------------------------------------------------- */
/* Export payload (matches the server shape)                                 */
/* -------------------------------------------------------------------------- */

function statsFor(db: Db, subjectId: number): ExportStats {
  const chapterRows = db.chapters.filter((chapter) => chapter.subjectId === subjectId);
  const ids = new Set(chapterRows.map((chapter) => chapter.id));
  const rows = db.lectures.filter((lecture) => ids.has(lecture.chapterId));
  const completed = rows.filter((lecture) => lecture.status === "completed");
  const plannedHours = rows.reduce((sum, lecture) => sum + lecture.hours, 0);
  const studiedHours = completed.reduce((sum, lecture) => sum + lecture.hours, 0);
  const completedChapters = chapterRows.filter((chapter) => {
    const own = rows.filter((lecture) => lecture.chapterId === chapter.id);
    return own.length > 0 && own.every((lecture) => lecture.status === "completed");
  }).length;

  return {
    plannedChapters: chapterRows.length,
    completedChapters,
    totalLectures: rows.length,
    completedLectures: completed.length,
    plannedHours: Math.round(plannedHours * 10) / 10,
    studiedHours: Math.round(studiedHours * 10) / 10,
    remainingHours: Math.round((plannedHours - studiedHours) * 10) / 10,
    progress: rows.length ? Math.round((completed.length / rows.length) * 100) : 0,
  };
}

function buildExport(db: Db, subjectId: number) {
  const subject = db.subjects.find((row) => row.id === subjectId) ?? db.subjects[0];
  if (!subject) return { app: "Lecture Tracker", stats: statsFor(db, subjectId), chapters: [] };
  const chapterRows = db.chapters
    .filter((chapter) => chapter.subjectId === subject.id)
    .sort((a, b) => a.position - b.position);

  return {
    app: subject.teacher ? `${subject.teacher} — ${subject.name}` : subject.name,
    exportedAt: new Date().toISOString(),
    defaultHours: subject.defaultHoursPerLecture,
    stats: statsFor(db, subject.id),
    chapters: chapterRows.map((chapter) => {
      const own = db.lectures
        .filter((lecture) => lecture.chapterId === chapter.id)
        .sort((a, b) => a.lectureNumber - b.lectureNumber);
      const completed = own.filter((lecture) => lecture.status === "completed");
      const plannedHours = own.reduce((sum, lecture) => sum + lecture.hours, 0);
      const lastUpdate = completed.reduce<string | null>((acc, lecture) => {
        const value = lecture.completedAt;
        if (!value) return acc;
        return !acc || value > acc ? value : acc;
      }, null);
      const described = own.filter((lecture) => lecture.label);
      return {
        chapterNumber: chapter.chapterNumber,
        title: chapter.title,
        notes: chapter.notes,
        plan: {
          lectureCount: chapter.lectureCount,
          hoursPerLecture: chapter.hoursPerLecture,
          totalHours: Math.round(plannedHours * 100) / 100,
          completedCount: completed.length,
          completedLectures: completed.map((lecture) => lecture.lectureNumber),
          remainingLectures: chapter.lectureCount - completed.length,
          progressPercent: chapter.lectureCount
            ? Math.round((completed.length / chapter.lectureCount) * 100)
            : 0,
          updatedAt: lastUpdate ?? chapter.updatedAt,
        },
        ...(described.length
          ? {
              lectures: own.map((lecture) => ({
                label: lecture.label,
                lecture: lecture.sourceNumber,
                part: lecture.partNumber,
                hours: lecture.hours,
                kind: lecture.kind,
                status: lecture.status,
                completedAt: lecture.completedAt,
              })),
            }
          : {}),
      };
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* Router                                                                     */
/* -------------------------------------------------------------------------- */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function body<T>(init?: RequestInit): T {
  if (!init?.body) return {} as T;
  try {
    return JSON.parse(String(init.body)) as T;
  } catch {
    return {} as T;
  }
}

function dayKeyFromIso(value: string | null | undefined): string {
  if (!value) return dayKeyOf();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return dayKeyOf();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** A drop-in replacement for `fetch` that talks to localStorage. */
export async function localFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
  const method = (init?.method ?? "GET").toUpperCase();
  const url = new URL(raw, "http://local");
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const segments = path.split("/").filter(Boolean); // ["api", ...]
  const [, resource, id] = segments;
  const payload = body<Record<string, unknown>>(init);
  const db = clone(read());

  if (!db.subjects.length && method === "GET" && resource === "bootstrap") {
    seed(db);
    write(db);
  }

  /* ---------------- health ---------------- */
  if (resource === "health") return json({ ok: true });

  /* ---------------- bootstrap ---------------- */
  if (resource === "bootstrap" && method === "GET") {
    write(db);
    return json(db);
  }

  /* ---------------- subjects ---------------- */
  if (resource === "subjects" && method === "POST") {
    const name = String(payload.name ?? "").trim();
    if (!name) return json({ error: "Subject name is required" }, 400);
    const subject: Subject = {
      id: nextId(),
      name,
      teacher: payload.teacher ? String(payload.teacher) : null,
      color: payload.color ? String(payload.color) : "indigo",
      defaultHoursPerLecture: Number(payload.defaultHoursPerLecture) || 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.subjects.push(subject);
    log(db, { subjectId: subject.id, kind: "created", title: subject.name, detail: "New subject added" });
    write(db);
    return json({ subject }, 201);
  }

  if (resource === "subjects" && id) {
    const subjectId = Number(id);
    const subject = db.subjects.find((row) => row.id === subjectId);
    if (!subject) return json({ error: "Subject not found" }, 404);

    if (method === "PATCH") {
      if (payload.name !== undefined) subject.name = String(payload.name) || subject.name;
      if (payload.teacher !== undefined) subject.teacher = payload.teacher ? String(payload.teacher) : null;
      if (payload.color) subject.color = String(payload.color);
      if (payload.defaultHoursPerLecture !== undefined) {
        subject.defaultHoursPerLecture = Number(payload.defaultHoursPerLecture) || subject.defaultHoursPerLecture;
      }
      subject.updatedAt = new Date().toISOString();
      log(db, { subjectId, kind: "updated", title: subject.name, detail: "Subject details updated" });
      write(db);
      return json({ subject });
    }

    if (method === "DELETE") {
      const chapterIds = new Set(
        db.chapters.filter((chapter) => chapter.subjectId === subjectId).map((chapter) => chapter.id),
      );
      log(db, { kind: "deleted", title: subject.name, detail: "Subject and all its chapters removed" });
      db.chapters = db.chapters.filter((chapter) => chapter.subjectId !== subjectId);
      db.lectures = db.lectures.filter((lecture) => !chapterIds.has(lecture.chapterId));
      db.subjects = db.subjects.filter((row) => row.id !== subjectId);
      db.sessions = db.sessions.map((session) =>
        session.subjectId === subjectId ? { ...session, subjectId: null, chapterId: null } : session,
      );
      write(db);
      return json({ deleted: true });
    }
  }

  /* ---------------- chapters ---------------- */
  if (resource === "chapters" && method === "POST") {
    const subjectId = Number(payload.subjectId);
    const subject = db.subjects.find((row) => row.id === subjectId);
    if (!subject) return json({ error: "Subject not found" }, 404);
    const title = String(payload.title ?? "").trim();
    if (!title) return json({ error: "Chapter title is required" }, 400);

    const position = db.chapters
      .filter((chapter) => chapter.subjectId === subjectId)
      .reduce((max, chapter) => Math.max(max, chapter.position), -1) + 1;

    const chapterId = createChapter(
      db,
      subjectId,
      {
        chapterNumber:
          payload.chapterNumber === undefined || payload.chapterNumber === null || payload.chapterNumber === ""
            ? null
            : Number(payload.chapterNumber),
        title,
        lectureCount: Math.max(0, Number(payload.lectureCount) || 0),
        hoursPerLecture: Number(payload.hoursPerLecture) || subject.defaultHoursPerLecture,
        completedLectures: [],
      },
      position,
      dayKeyOf(),
    );
    write(db);
    return json({ chapter: db.chapters.find((chapter) => chapter.id === chapterId) }, 201);
  }

  if (resource === "chapters" && id) {
    const chapterId = Number(id);
    const chapter = db.chapters.find((row) => row.id === chapterId);
    if (!chapter) return json({ error: "Chapter not found" }, 404);

    if (method === "GET") {
      return json({
        chapter,
        lectures: db.lectures.filter((lecture) => lecture.chapterId === chapterId),
      });
    }

    if (method === "PATCH") {
      const action = payload.action ? String(payload.action) : null;

      if (action === "complete" || action === "reset") {
        const rows = db.lectures.filter((lecture) => lecture.chapterId === chapterId);
        const already = rows.filter((lecture) => lecture.status === "completed").length;
        const target =
          action === "complete"
            ? Array.from({ length: chapter.lectureCount }, (_, i) => i + 1)
            : [];
        applyCompletions(db, chapterId, target, dayKeyOf());
        log(db, {
          subjectId: chapter.subjectId,
          chapterId,
          kind: action === "complete" ? "completed" : "reopened",
          title: chapterLabel(chapter),
          detail:
            action === "complete"
              ? `Chapter marked complete (${target.length - already} lectures finished)`
              : `Chapter progress reset (${already} lectures reopened)`,
        });
        chapter.updatedAt = new Date().toISOString();
        write(db);
        return json({ chapter });
      }

      if (payload.title !== undefined) chapter.title = String(payload.title) || chapter.title;
      if (payload.chapterNumber !== undefined) {
        chapter.chapterNumber =
          payload.chapterNumber === null || payload.chapterNumber === ""
            ? null
            : Number(payload.chapterNumber);
      }
      if (payload.notes !== undefined) chapter.notes = payload.notes ? String(payload.notes) : null;

      let notice: string | null = null;
      let count = chapter.lectureCount;
      if (payload.lectureCount !== undefined) {
        const requested = Math.max(0, Number(payload.lectureCount) || 0);
        const maxCompleted = db.lectures
          .filter((lecture) => lecture.chapterId === chapterId && lecture.status === "completed")
          .reduce((max, lecture) => Math.max(max, lecture.lectureNumber), 0);
        if (requested < maxCompleted) {
          notice = `Kept ${maxCompleted} lectures because lectures up to #${maxCompleted} are already completed.`;
          count = maxCompleted;
        } else {
          count = requested;
        }
        chapter.lectureCount = count;
      }
      if (payload.hoursPerLecture !== undefined) {
        chapter.hoursPerLecture = Number(payload.hoursPerLecture) || chapter.hoursPerLecture;
      }

      syncLectures(db, chapter, count, chapter.hoursPerLecture);
      log(db, {
        subjectId: chapter.subjectId,
        chapterId,
        kind: "updated",
        title: chapterLabel(chapter),
        detail: `Plan updated · ${count} lectures · ${chapter.hoursPerLecture}h each`,
      });
      chapter.updatedAt = new Date().toISOString();
      write(db);
      return json({ chapter, notice });
    }

    if (method === "DELETE") {
      log(db, {
        subjectId: chapter.subjectId,
        kind: "deleted",
        title: chapterLabel(chapter),
        detail: `Chapter deleted (${chapter.lectureCount} lectures planned)`,
      });
      db.lectures = db.lectures.filter((lecture) => lecture.chapterId !== chapterId);
      db.chapters = db.chapters.filter((row) => row.id !== chapterId);
      db.sessions = db.sessions.map((session) =>
        session.chapterId === chapterId ? { ...session, chapterId: null } : session,
      );
      write(db);
      return json({ deleted: true });
    }
  }

  /* ---------------- lectures ---------------- */
  if (resource === "lectures" && method === "POST") {
    const chapterId = Number(payload.chapterId);
    const chapter = db.chapters.find((row) => row.id === chapterId);
    if (!chapter) return json({ error: "Chapter not found" }, 404);
    const count = Math.max(1, Math.min(50, Number(payload.count) || 1));
    const existing = db.lectures.filter((lecture) => lecture.chapterId === chapterId);
    const start = existing.reduce((max, lecture) => Math.max(max, lecture.lectureNumber), 0) + 1;
    const label = payload.label ? String(payload.label) : null;
    const hours = Number(payload.hours) || chapter.hoursPerLecture;

    const added = lectureRows(db, chapterId, count, hours).map((lecture, index) => ({
      ...lecture,
      lectureNumber: start + index,
      label,
    }));
    db.lectures.push(...added);
    chapter.lectureCount = start + count - 1;
    log(db, {
      subjectId: chapter.subjectId,
      chapterId,
      kind: "created",
      title: chapterLabel(chapter),
      detail: `${count} lecture slot${count > 1 ? "s" : ""} added`,
    });
    write(db);
    return json({ chapter, lectures: added }, 201);
  }

  if (resource === "lectures" && id) {
    const lectureId = Number(id);
    const lecture = db.lectures.find((row) => row.id === lectureId);
    if (!lecture) return json({ error: "Lecture not found" }, 404);
    const chapter = db.chapters.find((row) => row.id === lecture.chapterId);
    if (!chapter) return json({ error: "Chapter not found" }, 404);
    const subject = db.subjects.find((row) => row.id === chapter.subjectId);
    const label = lectureLabel(chapter, lecture);

    if (method === "PATCH") {
      const requested = payload.status ? String(payload.status) : null;
      const nextStatus: "pending" | "completed" =
        payload.toggle === true
          ? lecture.status === "completed"
            ? "pending"
            : "completed"
          : requested === "completed" || requested === "pending"
            ? requested
            : lecture.status;

      const studiedOn = payload.studiedOn ? String(payload.studiedOn) : dayKeyOf();
      const hours =
        payload.hours !== undefined
          ? Number(payload.hours) || lecture.hours
          : lecture.hours || chapter.hoursPerLecture;

      if (nextStatus === "completed" && lecture.status !== "completed") {
        lecture.status = "completed";
        lecture.completedAt = new Date().toISOString();
        lecture.hours = hours;
        db.sessions.unshift({
          id: nextId(),
          subjectId: chapter.subjectId,
          chapterId: chapter.id,
          lectureId: lecture.id,
          subjectName: subject?.name ?? "Subject",
          chapterTitle: chapter.title,
          lectureLabel: label,
          kind: "lecture",
          hours,
          studiedOn,
          note: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        log(db, {
          subjectId: chapter.subjectId,
          chapterId: chapter.id,
          lectureId: lecture.id,
          kind: "completed",
          title: label,
          detail: `${hours ? `${hours}h logged` : "marked done"} on ${studiedOn}`,
        });
      } else if (nextStatus === "pending" && lecture.status === "completed") {
        lecture.status = "pending";
        lecture.completedAt = null;
        db.sessions = db.sessions.filter(
          (session) => !(session.lectureId === lecture.id && session.kind === "lecture"),
        );
        log(db, {
          subjectId: chapter.subjectId,
          chapterId: chapter.id,
          lectureId: lecture.id,
          kind: "reopened",
          title: label,
          detail: "Lecture reopened",
        });
      } else {
        if (payload.notes !== undefined) lecture.notes = payload.notes ? String(payload.notes) : null;
        if (payload.hours !== undefined) lecture.hours = hours;
        lecture.updatedAt = new Date().toISOString();
      }
      chapter.updatedAt = new Date().toISOString();
      write(db);
      return json({ lecture });
    }

    if (method === "DELETE") {
      log(db, {
        subjectId: chapter.subjectId,
        chapterId: chapter.id,
        lectureId: lecture.id,
        kind: "deleted",
        title: label,
        detail: "Lecture slot removed",
      });
      db.lectures = db.lectures.filter((row) => row.id !== lectureId);
      chapter.lectureCount = db.lectures
        .filter((row) => row.chapterId === chapter.id)
        .reduce((max, row) => Math.max(max, row.lectureNumber), 0);
      chapter.updatedAt = new Date().toISOString();
      write(db);
      return json({ chapter, deleted: true });
    }
  }

  /* ---------------- sessions ---------------- */
  if (resource === "sessions" && method === "GET") {
    write(db);
    return json({ sessions: db.sessions.slice(0, 400) });
  }

  if (resource === "sessions" && method === "POST") {
    const hours = Number(payload.hours) || 0;
    if (hours <= 0) return json({ error: "Hours must be greater than zero" }, 400);
    const chapterId = payload.chapterId ? Number(payload.chapterId) : null;
    const subjectId = payload.subjectId ? Number(payload.subjectId) : null;
    const chapter = chapterId ? db.chapters.find((row) => row.id === chapterId) : null;
    const subject = subjectId ? db.subjects.find((row) => row.id === subjectId) : null;
    const kindRaw = payload.kind ? String(payload.kind) : "revision";
    const kind = (["lecture", "revision", "practice", "test"].includes(kindRaw)
      ? kindRaw
      : "revision") as SessionKind;

    const session: StudySession = {
      id: nextId(),
      subjectId,
      chapterId,
      lectureId: null,
      subjectName: subject?.name ?? "General study",
      chapterTitle: chapter?.title ?? null,
      lectureLabel: null,
      kind,
      hours,
      studiedOn: payload.studiedOn ? String(payload.studiedOn) : dayKeyOf(),
      note: payload.note ? String(payload.note) : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.sessions.unshift(session);
    log(db, {
      subjectId,
      chapterId,
      kind: "created",
      title: chapter ? `${chapter.title} — ${kind}` : `${session.subjectName} — ${kind}`,
      detail: `${hours}h logged for ${session.studiedOn}`,
    });
    write(db);
    return json({ session }, 201);
  }

  if (resource === "sessions" && id) {
    const sessionId = Number(id);
    const session = db.sessions.find((row) => row.id === sessionId);
    if (!session) return json({ error: "Session not found" }, 404);

    if (method === "PATCH") {
      if (payload.hours !== undefined) session.hours = Number(payload.hours) || session.hours;
      if (payload.studiedOn) session.studiedOn = String(payload.studiedOn);
      if (payload.note !== undefined) session.note = payload.note ? String(payload.note) : null;
      if (payload.kind) session.kind = String(payload.kind) as SessionKind;
      session.updatedAt = new Date().toISOString();
      log(db, {
        subjectId: session.subjectId,
        chapterId: session.chapterId,
        kind: "updated",
        title: session.lectureLabel ?? session.chapterTitle ?? session.subjectName,
        detail: "Study log entry updated",
      });
      write(db);
      return json({ session });
    }

    if (method === "DELETE") {
      log(db, {
        subjectId: session.subjectId,
        chapterId: session.chapterId,
        kind: "deleted",
        title: session.lectureLabel ?? session.chapterTitle ?? session.subjectName,
        detail: `${session.hours}h entry removed from the log`,
      });
      db.sessions = db.sessions.filter((row) => row.id !== sessionId);
      write(db);
      return json({ deleted: true });
    }
  }

  /* ---------------- data (import / export / reset) ---------------- */
  if (resource === "data") {
    if (method === "GET") {
      const requested = url.searchParams.get("subjectId");
      const subjectId = requested ? Number(requested) : db.subjects[0]?.id;
      write(db);
      return json(buildExport(db, Number(subjectId)));
    }

    if (method === "POST") {
      const action = payload.action ? String(payload.action) : "import";

      if (action === "reset") {
        const fresh = blank();
        seed(fresh);
        write(fresh);
        return json({ reset: true });
      }

      if (action !== "import") return json({ error: `Unknown action "${action}"` }, 400);

      const parsed = parseImportPayload(payload.payload);
      if (!parsed.plans.length) {
        return json(
          { error: "No chapters found in the pasted JSON. Expected a { chapters: [...] } payload." },
          400,
        );
      }

      const mode = payload.mode ? String(payload.mode) : "new";
      const defaultHours = Number(payload.defaultHours) || parsed.defaultHours;

      if (mode === "new" || !payload.subjectId) {
        let subjectName = payload.subjectName ? String(payload.subjectName) : "";
        let teacher = payload.teacher ? String(payload.teacher) : "";
        if (!subjectName) {
          const parts = parsed.appName.split(/[—–-]{1}/).map((part) => part.trim());
          subjectName = parts.length > 1 ? parts[parts.length - 1] : parsed.appName;
          if (!teacher && parts.length > 1) teacher = parts[0];
        }
        const subject: Subject = {
          id: nextId(),
          name: subjectName || "Imported subject",
          teacher: teacher || null,
          color: "indigo",
          defaultHoursPerLecture: defaultHours,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        db.subjects.push(subject);
        parsed.plans.forEach((plan, index) => {
          createChapter(db, subject.id, plan, index, dayKeyFromIso(plan.updatedAt));
        });
        log(db, {
          subjectId: subject.id,
          kind: "imported",
          title: subject.name,
          detail: `${parsed.plans.length} chapters imported as a new subject`,
        });
        write(db);
        return json({ subjectId: subject.id, created: parsed.plans.length, mode: "new" });
      }

      const subjectId = Number(payload.subjectId);
      const subject = db.subjects.find((row) => row.id === subjectId);
      if (!subject) return json({ error: "Subject not found" }, 404);

      if (mode === "replace") {
        db.chapters = db.chapters.filter((chapter) => chapter.subjectId !== subjectId);
        parsed.plans.forEach((plan, index) => {
          createChapter(db, subjectId, plan, index, dayKeyFromIso(plan.updatedAt));
        });
        log(db, {
          subjectId,
          kind: "imported",
          title: subject.name,
          detail: `Replaced plan with ${parsed.plans.length} imported chapters`,
        });
        write(db);
        return json({ subjectId, created: parsed.plans.length, mode: "replace" });
      }

      // merge
      let created = 0;
      let updated = 0;
      let position = db.chapters
        .filter((chapter) => chapter.subjectId === subjectId)
        .reduce((max, chapter) => Math.max(max, chapter.position), -1) + 1;

      for (const plan of parsed.plans) {
        const match = db.chapters.find(
          (chapter) =>
            chapter.subjectId === subjectId &&
            ((plan.chapterNumber !== null && chapter.chapterNumber === plan.chapterNumber) ||
              chapter.title.toLowerCase() === plan.title.toLowerCase()),
        );
        if (!match) {
          createChapter(db, subjectId, plan, position, dayKeyFromIso(plan.updatedAt));
          position += 1;
          created += 1;
          continue;
        }
        match.title = plan.title;
        match.chapterNumber = plan.chapterNumber;
        match.lectureCount = plan.lectures?.length ?? plan.lectureCount;
        match.hoursPerLecture = plan.hoursPerLecture || match.hoursPerLecture;
        match.updatedAt = new Date().toISOString();
        syncLectures(db, match, match.lectureCount, match.hoursPerLecture);
        applyCompletions(
          db,
          match.id,
          plan.completedLectures,
          dayKeyFromIso(plan.updatedAt),
          true,
        );
        updated += 1;
      }

      log(db, {
        subjectId,
        kind: "imported",
        title: subject.name,
        detail: `Merged import — ${created} new chapters, ${updated} updated`,
      });
      write(db);
      return json({ subjectId, created, updated, mode: "merge" });
    }
  }

  return json({ error: `No local handler for ${method} ${path}` }, 404);
}

/** Wipes local data and reseeds the demo plan. */
export function resetLocal() {
  const fresh = blank();
  seed(fresh);
  write(fresh);
  return fresh;
}

export const localStore = { read, write, seed, resetLocal, buildExport, statsFor };
export type { ActivityItem };
