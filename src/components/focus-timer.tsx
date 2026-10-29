"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useStudy } from "@/components/study-provider";
import { Button, Field, Input, Modal, Select } from "@/components/ui";
import { cn, dayKeyOf, formatHours } from "@/lib/format";

const STORAGE_KEY = "ca-final-focus-timer";

type TimerState = {
  startedAt: number | null;
  accumulatedMs: number;
  running: boolean;
  subjectId: string;
  chapterId: string;
  note: string;
};

const DEFAULT_STATE: TimerState = {
  startedAt: null,
  accumulatedMs: 0,
  running: false,
  subjectId: "",
  chapterId: "",
  note: "",
};

function readState(): TimerState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<TimerState>;
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return DEFAULT_STATE;
  }
}

function writeState(state: TimerState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked — the session still works in memory */
  }
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

type FocusTimerValue = {
  running: boolean;
  elapsedMs: number;
  hasTime: boolean;
  open: boolean;
  setOpen: (value: boolean) => void;
  start: () => void;
  pause: () => void;
  reset: () => void;
};

const FocusTimerContext = createContext<FocusTimerValue | null>(null);

export function useFocusTimer() {
  const ctx = useContext(FocusTimerContext);
  if (!ctx) throw new Error("useFocusTimer must be used inside <FocusTimerProvider>");
  return ctx;
}

export function FocusTimerProvider({ children }: { children: ReactNode }) {
  const { subjects, chapters, lectures, createSession, toggleLecture } = useStudy();
  const [state, setState] = useState<TimerState>(readState);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState<number>(() => Date.now());
  const [saving, setSaving] = useState(false);

  const persist = useCallback((next: TimerState) => {
    setState(next);
    writeState(next);
  }, []);

  useEffect(() => {
    if (!state.running) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [state.running]);

  const elapsedMs = state.accumulatedMs + (state.running && state.startedAt ? now - state.startedAt : 0);

  const start = useCallback(() => {
    persist({ ...state, running: true, startedAt: Date.now() });
    setNow(Date.now());
  }, [persist, state]);

  const pause = useCallback(() => {
    if (!state.running || !state.startedAt) return;
    persist({
      ...state,
      running: false,
      accumulatedMs: state.accumulatedMs + (Date.now() - state.startedAt),
      startedAt: null,
    });
  }, [persist, state]);

  const reset = useCallback(() => {
    persist({ ...state, running: false, accumulatedMs: 0, startedAt: null });
  }, [persist, state]);

  const value = useMemo<FocusTimerValue>(
    () => ({
      running: state.running,
      elapsedMs,
      hasTime: elapsedMs > 1000,
      open,
      setOpen,
      start,
      pause,
      reset,
    }),
    [state.running, elapsedMs, open, start, pause, reset],
  );

  const selectedSubject = state.subjectId;
  const chapterOptions = chapters.filter((chapter) => String(chapter.subjectId) === selectedSubject);
  const nextLecture = useMemo(() => {
    const chapterId = Number(state.chapterId);
    if (!chapterId) return null;
    const chapter = chapters.find((row) => row.id === chapterId);
    if (!chapter) return null;
    const rows = lectures
      .filter((lecture) => lecture.chapterId === chapterId && lecture.kind !== "milestone")
      .sort((a, b) => a.lectureNumber - b.lectureNumber);
    const pending = rows.find((lecture) => lecture.status === "pending");
    return pending ? { lecture: pending, chapter } : null;
  }, [chapters, lectures, state.chapterId]);

  const hoursFromMs = Math.round((elapsedMs / 3_600_000) * 100) / 100;

  const finish = async (alsoComplete: boolean) => {
    if (hoursFromMs <= 0) return;
    setSaving(true);
    const snapshot = state;
    let completed = false;
    if (alsoComplete && nextLecture) {
      completed = await toggleLecture(nextLecture.lecture.id);
    }
    await createSession({
      subjectId: snapshot.subjectId ? Number(snapshot.subjectId) : null,
      chapterId: snapshot.chapterId ? Number(snapshot.chapterId) : null,
      kind: "revision",
      hours: hoursFromMs,
      studiedOn: dayKeyOf(),
      note:
        snapshot.note.trim() ||
        (completed ? "Focus session — lecture marked complete" : "Focus session"),
    });
    persist({ ...snapshot, running: false, accumulatedMs: 0, startedAt: null, note: "" });
    setSaving(false);
    setOpen(false);
  };

  return (
    <FocusTimerContext.Provider value={value}>
      {children}
      <FocusTimerSheet
        open={open}
        onClose={() => setOpen(false)}
        state={state}
        setState={persist}
        elapsedMs={elapsedMs}
        running={state.running}
        onStart={start}
        onPause={pause}
        onReset={reset}
        onFinish={finish}
        saving={saving}
        subjects={subjects}
        chapterOptions={chapterOptions}
        nextLecture={nextLecture}
      />
    </FocusTimerContext.Provider>
  );
}

type SheetProps = {
  open: boolean;
  onClose: () => void;
  state: TimerState;
  setState: (next: TimerState) => void;
  elapsedMs: number;
  running: boolean;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onFinish: (alsoComplete: boolean) => void;
  saving: boolean;
  subjects: { id: number; name: string }[];
  chapterOptions: { id: number; chapterNumber: number | null; title: string }[];
  nextLecture: {
    lecture: { id: number; lectureNumber: number; label: string | null; hours: number };
    chapter: { title: string; chapterNumber: number | null };
  } | null;
};

function FocusTimerSheet({
  open,
  onClose,
  state,
  setState,
  elapsedMs,
  running,
  onStart,
  onPause,
  onReset,
  onFinish,
  saving,
  subjects,
  chapterOptions,
  nextLecture,
}: SheetProps) {
  const hours = Math.round((elapsedMs / 3_600_000) * 100) / 100;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Focus session"
      description="Run the timer while you study — it writes straight into your history."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            disabled={!hours}
            loading={saving}
            onClick={() => void onFinish(false)}
          >
            Save {hours ? formatHours(hours) : "0h"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 px-4 py-6 text-center text-white">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/50">
            {running ? "Studying now" : elapsedMs > 0 ? "Paused" : "Ready"}
          </p>
          <p className="tnum mt-1 text-4xl font-semibold tracking-tight" suppressHydrationWarning>
            {formatClock(elapsedMs)}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button
              variant={running ? "subtle" : "primary"}
              onClick={running ? onPause : onStart}
              className="min-w-28"
            >
              {running ? "⏸ Pause" : elapsedMs > 0 ? "▶ Resume" : "▶ Start"}
            </Button>
            {elapsedMs > 0 ? (
              <Button variant="ghost" onClick={onReset}>
                ↺ Reset
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Subject">
            <Select
              value={state.subjectId}
              onChange={(event) =>
                setState({ ...state, subjectId: event.target.value, chapterId: "" })
              }
            >
              <option value="">General study</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Chapter" hint="optional">
            <Select
              value={state.chapterId}
              onChange={(event) => setState({ ...state, chapterId: event.target.value })}
            >
              <option value="">No specific chapter</option>
              {chapterOptions.map((chapter) => (
                <option key={chapter.id} value={chapter.id}>
                  {chapter.chapterNumber === null
                    ? chapter.title
                    : `Ch ${chapter.chapterNumber} · ${chapter.title}`}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Note" hint="optional" className="sm:col-span-2">
            <Input
              value={state.note}
              placeholder="What are you focusing on?"
              onChange={(event) => setState({ ...state, note: event.target.value })}
            />
          </Field>
        </div>

        {nextLecture ? (
          <button
            onClick={() => void onFinish(true)}
            disabled={!hours || saving}
            className={cn(
              "flex w-full items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left transition active:scale-[0.99] disabled:opacity-50",
            )}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-sm font-semibold text-white">
              ✓
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-emerald-900">
                Finish &amp; mark {nextLecture.lecture.label ?? `lecture ${nextLecture.lecture.lectureNumber}`} done
              </span>
              <span className="block text-xs text-emerald-700">
                {nextLecture.chapter.chapterNumber === null
                  ? nextLecture.chapter.title
                  : `Ch ${nextLecture.chapter.chapterNumber} · ${nextLecture.chapter.title}`}{" "}
                · saves {hours ? formatHours(hours) : "0h"} and ticks the next pending lecture
              </span>
            </span>
          </button>
        ) : null}
      </div>
    </Modal>
  );
}

/** Compact pill used in the app header. */
export function FocusTimerChip() {
  const { running, elapsedMs, setOpen, pause } = useFocusTimer();
  return (
    <button
      onClick={() => setOpen(true)}
      className={cn(
        "flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition active:scale-95",
        running
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-white text-slate-600",
      )}
      suppressHydrationWarning
    >
      {running ? (
        <>
          <span className="animate-pulse-ring inline-block h-2 w-2 rounded-full bg-emerald-500" />
          <span className="tnum" onClick={(event) => { event.stopPropagation(); pause(); }}>
            {formatClock(elapsedMs)}
          </span>
        </>
      ) : (
        <>
          <span>▶</span>
          <span>Focus</span>
        </>
      )}
    </button>
  );
}

/** Small hint shown on the dashboard when a session is live. */
export function FocusRunningBanner() {
  const { running, elapsedMs, setOpen } = useFocusTimer();
  if (!running) return null;
  return (
    <button
      onClick={() => setOpen(true)}
      suppressHydrationWarning
      className="flex w-full items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left"
    >
      <span className="animate-pulse-ring inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-emerald-900">Focus session running</span>
        <span className="block text-xs text-emerald-700">Tap to review, pause or save your time</span>
      </span>
      <span className="tnum text-sm font-semibold text-emerald-800">{formatClock(elapsedMs)}</span>
    </button>
  );
}
