import type { Chapter, Lecture, StudySession, Subject } from "./types";

export function cn(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(" ");
}

export function formatHours(hours: number): string {
  if (!hours || hours <= 0) return "—";
  const rounded = Math.round(hours * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}h`;
}

/** Compact pill text: "32.1a" for Day 32 Part 1a, plain number otherwise. */
export function lecturePillText(lecture: Lecture): string {
  const labelled = lecture.label?.match(/(?:Day|Lecture)\s+(\d+),\s*Part\s+(\d+[a-z]?)/i);
  if (labelled) return `${labelled[1]}.${labelled[2]}`;
  if (lecture.sourceNumber !== null && lecture.sourceNumber !== undefined) {
    return lecture.partNumber ? `${lecture.sourceNumber}.${lecture.partNumber}` : `${lecture.sourceNumber}`;
  }
  if (lecture.label) {
    const match = lecture.label.match(/(\d+)/);
    return match ? match[1] : "•";
  }
  return String(lecture.lectureNumber);
}

export function isMilestone(lecture: Lecture): boolean {
  return lecture.kind === "milestone";
}

export function plural(count: number, singular: string, pluralWord = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralWord}`;
}

export function chapterLabel(chapter: Pick<Chapter, "chapterNumber" | "title">): string {
  return chapter.chapterNumber === null
    ? chapter.title
    : `Ch ${chapter.chapterNumber} · ${chapter.title}`;
}

export function shortChapterLabel(chapter: Pick<Chapter, "chapterNumber" | "title">): string {
  return chapter.chapterNumber === null ? chapter.title : `Ch ${chapter.chapterNumber}`;
}

export function dayKeyOf(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function shiftDayKey(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return dayKeyOf(date);
}

export function prettyDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  const date = new Date(y, m - 1, d);
  const today = dayKeyOf();
  if (key === today) return "Today";
  if (key === shiftDayKey(1)) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export type ChapterStats = {
  total: number;
  completed: number;
  percent: number;
  plannedHours: number;
  studiedHours: number;
  remainingHours: number;
};

export type SubjectStats = ChapterStats & {
  chapters: number;
  completedChapters: number;
  lectures: number;
};

export function lectureStats(lectures: Lecture[]): { total: number; completed: number; plannedHours: number; studiedHours: number } {
  const completed = lectures.filter((l) => l.status === "completed");
  return {
    total: lectures.length,
    completed: completed.length,
    plannedHours: lectures.reduce((sum, l) => sum + l.hours, 0),
    studiedHours: completed.reduce((sum, l) => sum + l.hours, 0),
  };
}

export function statsForChapters(chapters: Chapter[], lectures: Lecture[]): SubjectStats {
  const ids = new Set(chapters.map((c) => c.id));
  const own = lectures.filter((l) => ids.has(l.chapterId));
  const base = lectureStats(own);
  const completedChapters = chapters.filter((chapter) => {
    const rows = own.filter((l) => l.chapterId === chapter.id);
    return rows.length > 0 && rows.every((l) => l.status === "completed");
  }).length;
  const plannedHours = own.reduce((sum, l) => sum + l.hours, 0);

  return {
    chapters: chapters.length,
    completedChapters,
    lectures: base.total,
    total: base.total,
    completed: base.completed,
    percent: base.total ? Math.round((base.completed / base.total) * 100) : 0,
    plannedHours: Math.round((plannedHours || base.plannedHours) * 10) / 10,
    studiedHours: Math.round(base.studiedHours * 10) / 10,
    remainingHours: Math.round((plannedHours - base.studiedHours) * 10) / 10,
  };
}

export function hoursByDay(sessions: StudySession[], days: number): { key: string; hours: number }[] {
  const out: { key: string; hours: number }[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = shiftDayKey(i);
    const hours = sessions
      .filter((session) => session.studiedOn === key)
      .reduce((sum, session) => sum + session.hours, 0);
    out.push({ key, hours: Math.round(hours * 10) / 10 });
  }
  return out;
}

export function averageDailyHours(sessions: StudySession[], days = 14): number {
  const total = sessions
    .filter((session) => session.studiedOn >= shiftDayKey(days - 1))
    .reduce((sum, session) => sum + session.hours, 0);
  return Math.round((total / days) * 10) / 10;
}

export const SUBJECT_COLORS: Record<
  string,
  { dot: string; soft: string; text: string; bar: string; ring: string }
> = {
  indigo: {
    dot: "bg-indigo-500",
    soft: "bg-indigo-50 border-indigo-100",
    text: "text-indigo-700",
    bar: "bg-indigo-500",
    ring: "ring-indigo-200",
  },
  emerald: {
    dot: "bg-emerald-500",
    soft: "bg-emerald-50 border-emerald-100",
    text: "text-emerald-700",
    bar: "bg-emerald-500",
    ring: "ring-emerald-200",
  },
  amber: {
    dot: "bg-amber-500",
    soft: "bg-amber-50 border-amber-100",
    text: "text-amber-700",
    bar: "bg-amber-500",
    ring: "ring-amber-200",
  },
  rose: {
    dot: "bg-rose-500",
    soft: "bg-rose-50 border-rose-100",
    text: "text-rose-700",
    bar: "bg-rose-500",
    ring: "ring-rose-200",
  },
  sky: {
    dot: "bg-sky-500",
    soft: "bg-sky-50 border-sky-100",
    text: "text-sky-700",
    bar: "bg-sky-500",
    ring: "ring-sky-200",
  },
  violet: {
    dot: "bg-violet-500",
    soft: "bg-violet-50 border-violet-100",
    text: "text-violet-700",
    bar: "bg-violet-500",
    ring: "ring-violet-200",
  },
};

export const COLOR_KEYS = Object.keys(SUBJECT_COLORS);

export function colorOf(subject: Subject | undefined) {
  return SUBJECT_COLORS[subject?.color ?? "indigo"] ?? SUBJECT_COLORS.indigo;
}

export const KIND_META: Record<string, { label: string; emoji: string; className: string }> = {
  lecture: { label: "Lecture", emoji: "🎬", className: "bg-indigo-50 text-indigo-700 border-indigo-100" },
  revision: { label: "Revision", emoji: "🔁", className: "bg-amber-50 text-amber-700 border-amber-100" },
  practice: { label: "Practice", emoji: "✍️", className: "bg-sky-50 text-sky-700 border-sky-100" },
  test: { label: "Test", emoji: "📝", className: "bg-rose-50 text-rose-700 border-rose-100" },
};

export const ACTIVITY_META: Record<string, { emoji: string; className: string }> = {
  created: { emoji: "✨", className: "bg-sky-50 text-sky-700" },
  updated: { emoji: "✏️", className: "bg-slate-100 text-slate-700" },
  deleted: { emoji: "🗑️", className: "bg-rose-50 text-rose-700" },
  completed: { emoji: "✅", className: "bg-emerald-50 text-emerald-700" },
  reopened: { emoji: "↩️", className: "bg-amber-50 text-amber-700" },
  imported: { emoji: "📥", className: "bg-violet-50 text-violet-700" },
};
