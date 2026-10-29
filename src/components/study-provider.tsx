"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  ActivityItem,
  BootstrapPayload,
  Chapter,
  Lecture,
  StudySession,
  Subject,
} from "@/lib/types";
import { dayKeyOf } from "@/lib/format";
import { IS_STATIC, localFetch } from "@/lib/local-engine";

type Toast = { id: number; message: string; tone: "success" | "error" | "info" };

const EMPTY: BootstrapPayload = {
  subjects: [],
  chapters: [],
  lectures: [],
  sessions: [],
  activity: [],
};

type SubjectInput = {
  name: string;
  teacher?: string | null;
  color?: string;
  defaultHoursPerLecture?: number;
};

type ChapterInput = {
  subjectId: number;
  title: string;
  chapterNumber: number | null;
  lectureCount: number;
  hoursPerLecture: number;
  notes?: string | null;
};

type SessionInput = {
  subjectId: number | null;
  chapterId: number | null;
  kind: string;
  hours: number;
  studiedOn: string;
  note?: string | null;
};

type StudyContextValue = {
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  subjects: Subject[];
  chapters: Chapter[];
  lectures: Lecture[];
  sessions: StudySession[];
  activity: ActivityItem[];
  refresh: () => Promise<void>;
  chaptersOf: (subjectId: number) => Chapter[];
  lecturesOf: (chapterId: number) => Lecture[];
  createSubject: (input: SubjectInput) => Promise<boolean>;
  updateSubject: (id: number, patch: SubjectInput) => Promise<boolean>;
  deleteSubject: (id: number) => Promise<boolean>;
  createChapter: (input: ChapterInput) => Promise<boolean>;
  updateChapter: (id: number, patch: Partial<ChapterInput>) => Promise<boolean>;
  chapterAction: (id: number, action: "complete" | "reset") => Promise<boolean>;
  deleteChapter: (id: number) => Promise<boolean>;
  addLectures: (chapterId: number, count: number) => Promise<boolean>;
  deleteLecture: (id: number) => Promise<boolean>;
  toggleLecture: (id: number, studiedOn?: string) => Promise<boolean>;
  updateLecture: (id: number, patch: { notes?: string | null; hours?: number }) => Promise<boolean>;
  createSession: (input: SessionInput) => Promise<boolean>;
  updateSession: (id: number, patch: Partial<StudySession>) => Promise<boolean>;
  deleteSession: (id: number) => Promise<boolean>;
  importData: (body: Record<string, unknown>) => Promise<{ ok: boolean; summary?: string }>;
  resetDemo: () => Promise<boolean>;
  toasts: Toast[];
  dismissToast: (id: number) => void;
};

const StudyContext = createContext<StudyContextValue | null>(null);

let tempCounter = 0;
const nextTempId = () => {
  tempCounter -= 1;
  return tempCounter;
};

const jsonRequest = (url: string, method: string, body: unknown) => ({
  url,
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/**
 * In a static export (GitHub Pages) there is no server, so every call is served
 * by the localStorage engine instead. Server deployments keep hitting the API.
 */
const request = (url: string, init?: RequestInit): Promise<Response> =>
  IS_STATIC ? localFetch(url, init) : fetch(url, init);

const makeLectures = (
  chapterId: number,
  count: number,
  hours: number,
  startAt = 1,
): Lecture[] =>
  Array.from({ length: count }, (_, index) => {
    const now = new Date().toISOString();
    return {
      id: nextTempId(),
      chapterId,
      lectureNumber: startAt + index,
      status: "pending" as const,
      hours,
      label: null,
      sourceNumber: null,
      partNumber: null,
      kind: "lecture",
      completedAt: null,
      notes: null,
      createdAt: now,
      updatedAt: now,
    };
  });

export function useStudy() {
  const ctx = useContext(StudyContext);
  if (!ctx) throw new Error("useStudy must be used inside <StudyProvider>");
  return ctx;
}

export function StudyProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<BootstrapPayload>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastTimers = useRef<number[]>([]);

  const pushToast = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);
    const timer = window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3200);
    toastTimers.current.push(timer);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => () => {
    toastTimers.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await request("/api/bootstrap", { cache: "no-store" });
      if (!response.ok) throw new Error("Request failed");
      const payload = (await response.json()) as BootstrapPayload;
      setData(payload);
      setError(null);
    } catch {
      setError("Could not load your tracker. Check the connection and retry.");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async (
      optimistic: (draft: BootstrapPayload) => BootstrapPayload,
      perform: () => Promise<Response>,
      successMessage?: string,
    ): Promise<boolean> => {
      const snapshot = data;
      setData((prev) => optimistic(prev));
      try {
        const response = await perform();
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          setData(snapshot);
          pushToast(payload.error ?? "That change could not be saved.", "error");
          return false;
        }
        await refresh();
        if (successMessage) pushToast(successMessage, "success");
        return true;
      } catch {
        setData(snapshot);
        pushToast("Network error — your change was reverted.", "error");
        return false;
      }
    },
    [data, pushToast, refresh],
  );

  const chaptersOf = useCallback(
    (subjectId: number) => data.chapters.filter((chapter) => chapter.subjectId === subjectId),
    [data.chapters],
  );

  const lecturesOf = useCallback(
    (chapterId: number) => data.lectures.filter((lecture) => lecture.chapterId === chapterId),
    [data.lectures],
  );

  const createSubject = useCallback(
    (input: SubjectInput) =>
      run(
        (draft) => {
          const now = new Date().toISOString();
          const subject: Subject = {
            id: nextTempId(),
            name: input.name,
            teacher: input.teacher ?? null,
            color: input.color ?? "indigo",
            defaultHoursPerLecture: input.defaultHoursPerLecture ?? 3,
            createdAt: now,
            updatedAt: now,
          };
          return { ...draft, subjects: [...draft.subjects, subject] };
        },
        () => request("/api/subjects", jsonRequest("/api/subjects", "POST", input)),
        `${input.name} added`,
      ),
    [run],
  );

  const updateSubject = useCallback(
    (id: number, patch: SubjectInput) =>
      run(
        (draft) => ({
          ...draft,
          subjects: draft.subjects.map((subject) =>
            subject.id === id
              ? {
                  ...subject,
                  name: patch.name,
                  teacher: patch.teacher ?? null,
                  color: patch.color ?? subject.color,
                  defaultHoursPerLecture: patch.defaultHoursPerLecture ?? subject.defaultHoursPerLecture,
                }
              : subject,
          ),
        }),
        () => request(`/api/subject?id=${id}`, jsonRequest(`/api/subject?id=${id}`, "PATCH", patch)),
        "Subject updated",
      ),
    [run],
  );

  const deleteSubject = useCallback(
    (id: number) =>
      run(
        (draft) => {
          const chapterIds = new Set(
            draft.chapters.filter((chapter) => chapter.subjectId === id).map((chapter) => chapter.id),
          );
          return {
            ...draft,
            subjects: draft.subjects.filter((subject) => subject.id !== id),
            chapters: draft.chapters.filter((chapter) => chapter.subjectId !== id),
            lectures: draft.lectures.filter((lecture) => !chapterIds.has(lecture.chapterId)),
          };
        },
        () => request(`/api/subject?id=${id}`, { method: "DELETE" }),
        "Subject deleted",
      ),
    [run],
  );

  const createChapter = useCallback(
    (input: ChapterInput) =>
      run(
        (draft) => {
          const now = new Date().toISOString();
          const chapterId = nextTempId();
          const chapter: Chapter = {
            id: chapterId,
            subjectId: input.subjectId,
            chapterNumber: input.chapterNumber,
            title: input.title,
            lectureCount: input.lectureCount,
            hoursPerLecture: input.hoursPerLecture,
            position: draft.chapters.filter((c) => c.subjectId === input.subjectId).length,
            notes: input.notes ?? null,
            createdAt: now,
            updatedAt: now,
          };
          const rows = makeLectures(chapterId, input.lectureCount, input.hoursPerLecture);
          return {
            ...draft,
            chapters: [...draft.chapters, chapter],
            lectures: [...draft.lectures, ...rows],
          };
        },
        () => request("/api/chapters", jsonRequest("/api/chapters", "POST", input)),
        `${input.title} added to the plan`,
      ),
    [run],
  );

  const updateChapter = useCallback(
    (id: number, patch: Partial<ChapterInput>) =>
      run(
        (draft) => {
          const chapter = draft.chapters.find((row) => row.id === id);
          if (!chapter) return draft;
          const nextCount = patch.lectureCount ?? chapter.lectureCount;
          const nextHours = patch.hoursPerLecture ?? chapter.hoursPerLecture;
          const rows = draft.lectures.filter((lecture) => lecture.chapterId === id);
          const completedMax = rows
            .filter((lecture) => lecture.status === "completed")
            .reduce((max, lecture) => Math.max(max, lecture.lectureNumber), 0);
          const finalCount = Math.max(nextCount, completedMax);

          let lectures = rows;
          if (finalCount > rows.length) {
            lectures = [...rows, ...makeLectures(id, finalCount - rows.length, nextHours, rows.length + 1)];
          } else if (finalCount < rows.length) {
            lectures = rows.filter(
              (lecture) => lecture.lectureNumber <= finalCount || lecture.status === "completed",
            );
          }

          return {
            ...draft,
            chapters: draft.chapters.map((row) =>
              row.id === id
                ? {
                    ...row,
                    title: patch.title ?? row.title,
                    chapterNumber: patch.chapterNumber !== undefined ? patch.chapterNumber : row.chapterNumber,
                    lectureCount: finalCount,
                    hoursPerLecture: nextHours,
                    notes: patch.notes !== undefined ? patch.notes : row.notes,
                    updatedAt: new Date().toISOString(),
                  }
                : row,
            ),
            lectures: draft.lectures
              .filter((lecture) => lecture.chapterId !== id)
              .concat(lectures.map((lecture) => ({ ...lecture, chapterId: id })))
              .sort((a, b) => a.chapterId - b.chapterId || a.lectureNumber - b.lectureNumber),
          };
        },
        () => request(`/api/chapter?id=${id}`, jsonRequest(`/api/chapter?id=${id}`, "PATCH", patch)),
        "Chapter plan updated",
      ),
    [run],
  );

  const chapterAction = useCallback(
    (id: number, action: "complete" | "reset") =>
      run(
        (draft) => {
          const chapter = draft.chapters.find((row) => row.id === id);
          if (!chapter) return draft;
          const now = new Date().toISOString();
          return {
            ...draft,
            chapters: draft.chapters.map((row) => (row.id === id ? { ...row, updatedAt: now } : row)),
            lectures: draft.lectures.map((lecture) =>
              lecture.chapterId === id
                ? action === "complete"
                  ? { ...lecture, status: "completed" as const, completedAt: now, hours: chapter.hoursPerLecture }
                  : { ...lecture, status: "pending" as const, completedAt: null }
                : lecture,
            ),
          };
        },
        () =>
          request(
            `/api/chapter?id=${id}`,
            jsonRequest(`/api/chapter?id=${id}`, "PATCH", { action }),
          ),
        action === "complete" ? "Chapter marked complete 🎉" : "Chapter progress reset",
      ),
    [run],
  );

  const deleteChapter = useCallback(
    (id: number) =>
      run(
        (draft) => ({
          ...draft,
          chapters: draft.chapters.filter((chapter) => chapter.id !== id),
          lectures: draft.lectures.filter((lecture) => lecture.chapterId !== id),
        }),
        () => request(`/api/chapter?id=${id}`, { method: "DELETE" }),
        "Chapter deleted",
      ),
    [run],
  );

  const addLectures = useCallback(
    (chapterId: number, count: number) =>
      run(
        (draft) => {
          const chapter = draft.chapters.find((row) => row.id === chapterId);
          if (!chapter) return draft;
          const rows = draft.lectures.filter((lecture) => lecture.chapterId === chapterId);
          const added = makeLectures(chapterId, count, chapter.hoursPerLecture, rows.length + 1);
          return {
            ...draft,
            chapters: draft.chapters.map((row) =>
              row.id === chapterId
                ? { ...row, lectureCount: rows.length + count, updatedAt: new Date().toISOString() }
                : row,
            ),
            lectures: [...draft.lectures, ...added],
          };
        },
        () =>
          request("/api/lectures", jsonRequest("/api/lectures", "POST", { chapterId, count })),
        `${count} lecture slot${count > 1 ? "s" : ""} added`,
      ),
    [run],
  );

  const deleteLecture = useCallback(
    (id: number) =>
      run(
        (draft) => {
          const lecture = draft.lectures.find((row) => row.id === id);
          if (!lecture) return draft;
          const remaining = draft.lectures.filter(
            (row) => row.chapterId === lecture.chapterId && row.id !== id,
          );
          const highest = remaining.reduce((max, row) => Math.max(max, row.lectureNumber), 0);
          return {
            ...draft,
            lectures: draft.lectures.filter((row) => row.id !== id),
            chapters: draft.chapters.map((chapter) =>
              chapter.id === lecture.chapterId ? { ...chapter, lectureCount: highest } : chapter,
            ),
          };
        },
        () => request(`/api/lectures/${id}`, { method: "DELETE" }),
        "Lecture removed",
      ),
    [run],
  );

  const toggleLecture = useCallback(
    (id: number, studiedOn?: string) =>
      run(
        (draft) => ({
          ...draft,
          lectures: draft.lectures.map((lecture) =>
            lecture.id === id
              ? {
                  ...lecture,
                  status: lecture.status === "completed" ? ("pending" as const) : ("completed" as const),
                  completedAt: lecture.status === "completed" ? null : new Date().toISOString(),
                }
              : lecture,
          ),
        }),
        () =>
          request(
            `/api/lectures/${id}`,
            jsonRequest(`/api/lectures/${id}`, "PATCH", {
              toggle: true,
              studiedOn: studiedOn ?? dayKeyOf(),
            }),
          ),
      ),
    [run],
  );

  const updateLecture = useCallback(
    (id: number, patch: { notes?: string | null; hours?: number }) =>
      run(
        (draft) => ({
          ...draft,
          lectures: draft.lectures.map((lecture) =>
            lecture.id === id
              ? {
                  ...lecture,
                  notes: patch.notes !== undefined ? patch.notes : lecture.notes,
                  hours: patch.hours !== undefined ? patch.hours : lecture.hours,
                }
              : lecture,
          ),
        }),
        () => request(`/api/lectures/${id}`, jsonRequest(`/api/lectures/${id}`, "PATCH", patch)),
        "Lecture updated",
      ),
    [run],
  );

  const createSession = useCallback(
    (input: SessionInput) =>
      run(
        (draft) => {
          const subject = draft.subjects.find((row) => row.id === input.subjectId);
          const chapter = draft.chapters.find((row) => row.id === input.chapterId);
          const session: StudySession = {
            id: nextTempId(),
            subjectId: input.subjectId,
            chapterId: input.chapterId,
            lectureId: null,
            subjectName: subject?.name ?? "General study",
            chapterTitle: chapter?.title ?? null,
            lectureLabel: null,
            kind: (input.kind as StudySession["kind"]) ?? "revision",
            hours: input.hours,
            studiedOn: input.studiedOn,
            note: input.note ?? null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          return { ...draft, sessions: [session, ...draft.sessions] };
        },
        () => request("/api/sessions", jsonRequest("/api/sessions", "POST", input)),
        `${input.hours}h logged`,
      ),
    [run],
  );

  const updateSession = useCallback(
    (id: number, patch: Partial<StudySession>) =>
      run(
        (draft) => ({
          ...draft,
          sessions: draft.sessions.map((session) => (session.id === id ? { ...session, ...patch } : session)),
        }),
        () => request(`/api/sessions/${id}`, jsonRequest(`/api/sessions/${id}`, "PATCH", patch)),
        "Log entry updated",
      ),
    [run],
  );

  const deleteSession = useCallback(
    (id: number) =>
      run(
        (draft) => ({ ...draft, sessions: draft.sessions.filter((session) => session.id !== id) }),
        () => request(`/api/sessions/${id}`, { method: "DELETE" }),
        "Log entry removed",
      ),
    [run],
  );

  const importData = useCallback(
    async (body: Record<string, unknown>) => {
      try {
        const response = await request("/api/data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          created?: number;
          updated?: number;
          mode?: string;
        };
        if (!response.ok) {
          pushToast(payload.error ?? "Import failed", "error");
          return { ok: false };
        }
        await refresh();
        const summary =
          payload.mode === "merge"
            ? `Merged — ${payload.created ?? 0} new, ${payload.updated ?? 0} updated`
            : `Imported ${payload.created ?? 0} chapters`;
        pushToast(summary, "success");
        return { ok: true, summary };
      } catch {
        pushToast("Import failed — check the JSON and try again", "error");
        return { ok: false };
      }
    },
    [pushToast, refresh],
  );

  const resetDemo = useCallback(async () => {
    try {
      const response = await request("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      if (!response.ok) throw new Error("failed");
      await refresh();
      pushToast("Tracker reset to the seeded Direct Tax plan", "success");
      return true;
    } catch {
      pushToast("Reset failed", "error");
      return false;
    }
  }, [pushToast, refresh]);

  const value = useMemo<StudyContextValue>(
    () => ({
      loading,
      refreshing,
      error,
      subjects: data.subjects,
      chapters: data.chapters,
      lectures: data.lectures,
      sessions: data.sessions,
      activity: data.activity,
      refresh,
      chaptersOf,
      lecturesOf,
      createSubject,
      updateSubject,
      deleteSubject,
      createChapter,
      updateChapter,
      chapterAction,
      deleteChapter,
      addLectures,
      deleteLecture,
      toggleLecture,
      updateLecture,
      createSession,
      updateSession,
      deleteSession,
      importData,
      resetDemo,
      toasts,
      dismissToast,
    }),
    [
      loading,
      refreshing,
      error,
      data,
      refresh,
      chaptersOf,
      lecturesOf,
      createSubject,
      updateSubject,
      deleteSubject,
      createChapter,
      updateChapter,
      chapterAction,
      deleteChapter,
      addLectures,
      deleteLecture,
      toggleLecture,
      updateLecture,
      createSession,
      updateSession,
      deleteSession,
      importData,
      resetDemo,
      toasts,
      dismissToast,
    ],
  );

  return (
    <StudyContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-3 bottom-[calc(var(--tabbar-h)+0.75rem)] z-[60] flex w-[min(92vw,20rem)] flex-col gap-2 lg:bottom-4">
        {toasts.map((toast) => (
          <button
            key={toast.id}
            onClick={() => dismissToast(toast.id)}
            className={`pointer-events-auto flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-left text-sm shadow-lg backdrop-blur transition ${
              toast.tone === "success"
                ? "border-emerald-200 bg-emerald-50/95 text-emerald-900"
                : toast.tone === "error"
                  ? "border-rose-200 bg-rose-50/95 text-rose-900"
                  : "border-slate-200 bg-white/95 text-slate-900"
            }`}
          >
            <span>{toast.tone === "success" ? "✅" : toast.tone === "error" ? "⚠️" : "ℹ️"}</span>
            <span className="font-medium">{toast.message}</span>
          </button>
        ))}
      </div>
    </StudyContext.Provider>
  );
}
