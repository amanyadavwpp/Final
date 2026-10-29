"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChapterCard } from "@/components/chapter-card";
import { ChapterModal } from "@/components/chapter-modal";
import { FocusRunningBanner } from "@/components/focus-timer";
import { useStudy } from "@/components/study-provider";
import { StudyHeatmap } from "@/components/study-heatmap";
import { Button, Card, EmptyState, Ring, Skeleton, StatCard } from "@/components/ui";
import {
  ACTIVITY_META,
  chapterLabel,
  cn,
  colorOf,
  dayKeyOf,
  formatHours,
  hoursByDay,
  isMilestone,
  plural,
  relativeTime,
  shiftDayKey,
  statsForChapters,
} from "@/lib/format";
import { daysUntil, useSettings } from "@/lib/use-settings";
import type { Chapter, Subject } from "@/lib/types";

/* -------------------------------------------------------------------------- */

function PageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-44 w-full" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-40 w-full" />
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-28" />
        ))}
      </div>
    </div>
  );
}

function TodayRing({
  done,
  target,
}: {
  done: number;
  target: number;
}) {
  const percent = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;
  return (
    <Ring
      percent={percent}
      size={104}
      label={formatHours(done)}
      sublabel={`of ${target}h`}
    />
  );
}

function StreakBars({ days }: { days: { key: string; hours: number }[] }) {
  const max = Math.max(1, ...days.map((day) => day.hours));
  return (
    <div className="flex h-16 items-end gap-1">
      {days.map((day) => (
        <div key={day.key} className="group relative flex flex-1 flex-col items-center justify-end">
          <div
            className={cn(
              "w-full rounded-md transition-[height] duration-300",
              day.hours > 0 ? "bg-gradient-to-t from-indigo-500 to-sky-400" : "bg-slate-100",
            )}
            style={{ height: `${Math.max(4, (day.hours / max) * 56)}px` }}
          />
          <span className="mt-0.5 text-[8px] font-semibold text-slate-300">
            {new Date(`${day.key}T00:00:00`).toLocaleDateString(undefined, { weekday: "narrow" })}
          </span>
          <span className="tnum pointer-events-none absolute -top-6 hidden rounded-md bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white group-hover:block">
            {formatHours(day.hours)}
          </span>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export default function DashboardPage() {
  const {
    loading,
    error,
    subjects,
    chapters,
    lectures,
    sessions,
    activity,
    toggleLecture,
    refresh,
  } = useStudy();
  const { settings } = useSettings();
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [chapterModalOpen, setChapterModalOpen] = useState(false);
  const [editing, setEditing] = useState<Chapter | null>(null);
  const [query, setQuery] = useState("");

  const activeSubject: Subject | undefined =
    subjects.find((subject) => subject.id === subjectId) ?? subjects[0];

  const subjectChapters = useMemo(
    () => chapters.filter((chapter) => chapter.subjectId === activeSubject?.id),
    [chapters, activeSubject?.id],
  );
  const stats = useMemo(() => statsForChapters(subjectChapters, lectures), [subjectChapters, lectures]);
  const allStats = useMemo(() => statsForChapters(chapters, lectures), [chapters, lectures]);

  const today = dayKeyOf();
  const todayHours = useMemo(
    () =>
      Math.round(
        sessions
          .filter((session) => session.studiedOn === today)
          .reduce((sum, session) => sum + session.hours, 0) * 10,
      ) / 10,
    [sessions, today],
  );
  const week = useMemo(() => hoursByDay(sessions, 7), [sessions]);
  const avgDaily = useMemo(() => {
    const total = week.reduce((sum, day) => sum + day.hours, 0);
    return Math.round((total / 7) * 10) / 10;
  }, [week]);

  const streak = useMemo(() => {
    let count = 0;
    for (let i = 0; i < 90; i += 1) {
      const key = shiftDayKey(i);
      const total = sessions
        .filter((session) => session.studiedOn === key)
        .reduce((sum, session) => sum + session.hours, 0);
      if (total > 0) count += 1;
      else if (i > 0) break;
    }
    return count;
  }, [sessions]);

  const nextLecture = useMemo(() => {
    const pending = lectures.find((lecture) => {
      const chapter = chapters.find((row) => row.id === lecture.chapterId);
      return (
        chapter?.subjectId === activeSubject?.id &&
        lecture.status === "pending" &&
        !isMilestone(lecture)
      );
    });
    if (!pending) return null;
    const chapter = chapters.find((row) => row.id === pending.chapterId);
    return chapter ? { lecture: pending, chapter } : null;
  }, [lectures, chapters, activeSubject?.id]);

  const filteredChapters = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return subjectChapters;
    return subjectChapters.filter((chapter) => chapter.title.toLowerCase().includes(term));
  }, [subjectChapters, query]);

  const examCountdown = daysUntil(settings.examDate);
  const daysAtTarget = settings.dailyTargetHours
    ? Math.ceil(allStats.remainingHours / settings.dailyTargetHours)
    : null;

  if (loading) return <PageSkeleton />;

  if (!subjects.length) {
    return (
      <EmptyState
        emoji="📚"
        title="No subjects yet"
        description="Import the JSON you already have, or start a fresh subject and add chapters manually."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/data">
              <Button variant="primary">Import JSON</Button>
            </Link>
            <Link href="/subjects">
              <Button>Add a subject</Button>
            </Link>
          </div>
        }
      />
    );
  }

  const palette = colorOf(activeSubject);

  return (
    <div className="space-y-5">
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}{" "}
          <button className="font-semibold underline" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      ) : null}

      <FocusRunningBanner />

      {/* Subject switcher — horizontal snap scroll on phones */}
      <div className="nowrap-scroll -mx-4 flex gap-2 px-4 lg:mx-0 lg:px-0">
        {subjects.map((subject) => {
          const active = subject.id === activeSubject?.id;
          return (
            <button
              key={subject.id}
              onClick={() => setSubjectId(subject.id)}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition active:scale-95",
                active
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600",
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", colorOf(subject).dot)} />
              {subject.name}
            </button>
          );
        })}
      </div>

      {/* Today */}
      <Card className="p-4">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <TodayRing done={todayHours} target={settings.dailyTargetHours} />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Today
              </p>
              <p className="tnum text-lg font-semibold leading-tight tracking-tight text-slate-900">
                {todayHours >= settings.dailyTargetHours
                  ? "Target hit 🎉"
                  : `${formatHours(Math.max(0, settings.dailyTargetHours - todayHours))} to go`}
              </p>
              <p className="text-xs text-slate-500">
                {plural(streak, "day")} streak · {formatHours(avgDaily)}/day avg
              </p>
              {examCountdown !== null ? (
                <p
                  className={cn(
                    "tnum mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    examCountdown <= 30
                      ? "bg-rose-50 text-rose-700"
                      : "bg-slate-100 text-slate-600",
                  )}
                >
                  {examCountdown >= 0
                    ? `${examCountdown} days to exam`
                    : `${Math.abs(examCountdown)} days since exam`}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex-1 sm:border-l sm:border-slate-100 sm:pl-5">
            <div className="flex items-baseline justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Last 7 days
              </p>
              <p className="tnum text-[11px] font-semibold text-slate-500">
                {formatHours(week.reduce((sum, day) => sum + day.hours, 0))}
              </p>
            </div>
            <div className="mt-2">
              <StreakBars days={week} />
            </div>
          </div>
        </div>
      </Card>

      {/* Subject hero + up next */}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-5 p-4 sm:p-5 lg:flex-row lg:items-center">
          <div className="flex items-center gap-4">
            <Ring percent={stats.percent} size={96} label={`${stats.percent}%`} sublabel="done" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {activeSubject?.teacher ?? "Subject"}
              </p>
              <h2 className="truncate text-lg font-semibold tracking-tight text-slate-900">
                {activeSubject?.name}
              </h2>
              <p className="tnum mt-0.5 text-xs text-slate-500">
                {stats.completedChapters}/{stats.chapters} chapters ·{" "}
                {plural(stats.completed, "session")} finished
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Link href={`/subject?id=${activeSubject?.id}`}>
                  <Button size="sm">Open plan</Button>
                </Link>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    setEditing(null);
                    setChapterModalOpen(true);
                  }}
                >
                  + Chapter
                </Button>
              </div>
            </div>
          </div>

          <div className="flex-1 lg:border-l lg:border-slate-100 lg:pl-5">
            {nextLecture ? (
              <div className={cn("rounded-2xl border p-3.5", palette.soft)}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Up next
                </p>
                <p className="mt-1 text-sm font-semibold leading-snug text-slate-900">
                  {chapterLabel(nextLecture.chapter)} ·{" "}
                  {nextLecture.lecture.label ?? `Lecture ${nextLecture.lecture.lectureNumber}`}
                </p>
                <p className="tnum mt-0.5 text-xs text-slate-500">
                  {nextLecture.lecture.hours
                    ? formatHours(nextLecture.lecture.hours)
                    : "duration not listed"}{" "}
                  · {formatHours(stats.remainingHours)} left in subject
                </p>
                <Button
                  size="sm"
                  variant="primary"
                  className="mt-2.5"
                  onClick={() => void toggleLecture(nextLecture.lecture.id)}
                >
                  ✓ Mark as studied
                </Button>
              </div>
            ) : (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3.5">
                <p className="text-sm font-semibold text-emerald-800">🎉 All caught up!</p>
                <p className="mt-1 text-xs text-emerald-700">
                  Add more lectures or import another subject to keep going.
                </p>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Stats */}
      <div className="tnum grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Sessions done"
          value={`${stats.completed}/${stats.total}`}
          hint={`${stats.total - stats.completed} to go`}
          icon="🎬"
        />
        <StatCard
          label="Hours studied"
          value={formatHours(stats.studiedHours)}
          hint={`of ${formatHours(stats.plannedHours)} planned`}
          icon="⏱️"
          accent="text-indigo-600"
        />
        <StatCard
          label="Hours left"
          value={formatHours(stats.remainingHours)}
          hint={daysAtTarget ? `${daysAtTarget} days at ${settings.dailyTargetHours}h/day` : undefined}
          icon="🧭"
          accent="text-amber-600"
        />
        <StatCard
          label="Chapters"
          value={`${stats.completedChapters}/${stats.chapters}`}
          hint={`${stats.chapters - stats.completedChapters} in progress`}
          icon="📚"
          accent="text-emerald-600"
        />
      </div>

      {/* Consistency */}
      <Card className="p-4">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-slate-900">Consistency</h2>
            <p className="text-xs text-slate-500">Study hours over the last 14 weeks.</p>
          </div>
          <Link href="/history" className="shrink-0 text-xs font-semibold text-slate-500">
            Log →
          </Link>
        </div>
        <div className="mt-3">
          <StudyHeatmap />
        </div>
      </Card>

      {/* Chapters */}
      <Card className="p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-slate-900">Chapter progress</h2>
              <p className="text-xs text-slate-500">Tap a number to toggle a session.</p>
            </div>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search…"
              className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none sm:w-44"
            />
          </div>
          <div className="space-y-3">
            {filteredChapters.length ? (
              filteredChapters.map((chapter) => (
                <ChapterCard
                  key={chapter.id}
                  chapter={chapter}
                  lectures={lectures}
                  onEdit={(target) => {
                    setEditing(target);
                    setChapterModalOpen(true);
                  }}
                />
              ))
            ) : (
              <EmptyState
                emoji="🔍"
                title={query ? "No chapters match" : "No chapters yet"}
                description={
                  query ? "Try a different search term." : "Add your first chapter to get going."
                }
                action={
                  query ? (
                    <Button size="sm" onClick={() => setQuery("")}>
                      Clear search
                    </Button>
                  ) : (
                    <Button size="sm" variant="primary" onClick={() => setChapterModalOpen(true)}>
                      + Add chapter
                    </Button>
                  )
                }
              />
            )}
          </div>
        </div>
      </Card>

      {/* Recent activity */}
      <Card className="p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold tracking-tight text-slate-900">Recent activity</h2>
          <Link href="/activity" className="text-xs font-semibold text-slate-500">
            All →
          </Link>
        </div>
        <ul className="mt-3 space-y-2.5">
          {activity.slice(0, 6).map((item) => {
            const meta = ACTIVITY_META[item.kind] ?? ACTIVITY_META.updated;
            return (
              <li key={item.id} className="flex gap-2.5">
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px]",
                    meta.className,
                  )}
                >
                  {meta.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-800">{item.title}</p>
                  <p className="truncate text-[11px] text-slate-400">
                    {item.detail ?? item.kind} · {relativeTime(item.createdAt)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {activeSubject && chapterModalOpen ? (
        <ChapterModal
          onClose={() => setChapterModalOpen(false)}
          subject={activeSubject}
          chapter={editing}
          nextNumber={
            subjectChapters.reduce((max, chapter) => Math.max(max, chapter.chapterNumber ?? 0), 0) + 1
          }
        />
      ) : null}
    </div>
  );
}
