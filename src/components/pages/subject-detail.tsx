"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ChapterCard } from "@/components/chapter-card";
import { ChapterModal } from "@/components/chapter-modal";
import { useStudy } from "@/components/study-provider";
import { Button, Card, EmptyState, Ring, Skeleton, StatCard } from "@/components/ui";
import { colorOf, formatHours, plural, statsForChapters } from "@/lib/format";
import type { Chapter } from "@/lib/types";

type Filter = "all" | "todo" | "progress" | "done";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All chapters" },
  { key: "progress", label: "In progress" },
  { key: "todo", label: "Not started" },
  { key: "done", label: "Completed" },
];

export default function SubjectDetailPage() {
  const searchParams = useSearchParams();
  const subjectId = Number(searchParams.get("id"));
  const { loading, subjects, chapters, lectures, sessions } = useStudy();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Chapter | null>(null);

  const subject = subjects.find((row) => row.id === subjectId);
  const subjectChapters = useMemo(
    () =>
      chapters
        .filter((chapter) => chapter.subjectId === subjectId)
        .sort((a, b) => (a.position - b.position) || (a.id - b.id)),
    [chapters, subjectId],
  );
  const stats = useMemo(() => statsForChapters(subjectChapters, lectures), [subjectChapters, lectures]);
  const subjectSessions = useMemo(
    () => sessions.filter((session) => session.subjectId === subjectId),
    [sessions, subjectId],
  );

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return subjectChapters.filter((chapter) => {
      const rows = lectures.filter((lecture) => lecture.chapterId === chapter.id);
      const completed = rows.filter((lecture) => lecture.status === "completed").length;
      const matchesFilter =
        filter === "all" ||
        (filter === "done" && rows.length > 0 && completed === rows.length) ||
        (filter === "progress" && completed > 0 && completed < rows.length) ||
        (filter === "todo" && completed === 0);
      const matchesTerm = !term || chapter.title.toLowerCase().includes(term);
      return matchesFilter && matchesTerm;
    });
  }, [subjectChapters, lectures, filter, query]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-36" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (!subject) {
    return (
      <EmptyState
        emoji="🤷"
        title="Subject not found"
        description="It may have been deleted. Pick another subject from the list."
        action={
          <Link href="/subjects">
            <Button variant="primary">Back to subjects</Button>
          </Link>
        }
      />
    );
  }
  const palette = colorOf(subject);

  return (
    <div className="space-y-6">
      <Link href="/subjects" className="inline-flex text-xs font-semibold text-slate-500 hover:text-slate-900">
        ← All subjects
      </Link>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-5">
            <Ring percent={stats.percent} label={`${stats.percent}%`} sublabel="done" size={112} />
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">{subject.name}</h2>
              <p className="text-sm text-slate-500">{subject.teacher ?? "No faculty set"}</p>
              <p className="mt-2 text-xs text-slate-500">
                {stats.completedChapters}/{stats.chapters} chapters · {plural(stats.completed, "lecture")}{" "}
                finished · {formatHours(stats.studiedHours)} studied
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    setEditing(null);
                    setModalOpen(true);
                  }}
                >
                  + Add chapter
                </Button>
                <Link href={`/data?subjectId=${subject.id}`}>
                  <Button size="sm">Export / import</Button>
                </Link>
                <Link href="/history">
                  <Button size="sm" variant="ghost">
                    Study log
                  </Button>
                </Link>
              </div>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:w-auto">
            <div className={`rounded-xl border p-3 ${palette.soft}`}>
              <dt className="text-[11px] font-semibold uppercase text-slate-500">Planned</dt>
              <dd className="text-sm font-semibold text-slate-900">{formatHours(stats.plannedHours)}</dd>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <dt className="text-[11px] font-semibold uppercase text-slate-500">Remaining</dt>
              <dd className="text-sm font-semibold text-slate-900">{formatHours(stats.remainingHours)}</dd>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <dt className="text-[11px] font-semibold uppercase text-slate-500">Log entries</dt>
              <dd className="text-sm font-semibold text-slate-900">{subjectSessions.length}</dd>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <dt className="text-[11px] font-semibold uppercase text-slate-500">Per lecture</dt>
              <dd className="text-sm font-semibold text-slate-900">
                {formatHours(subject.defaultHoursPerLecture)}
              </dd>
            </div>
          </dl>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Chapters" value={`${stats.completedChapters}/${stats.chapters}`} icon="📚" />
        <StatCard label="Lectures" value={`${stats.completed}/${stats.total}`} icon="🎬" />
        <StatCard label="Hours studied" value={formatHours(stats.studiedHours)} icon="⏱️" accent="text-indigo-600" />
        <StatCard label="Hours left" value={formatHours(stats.remainingHours)} icon="🧭" accent="text-amber-600" />
      </div>

      <div className="nowrap-scroll -mx-4 flex items-center gap-2 px-4 lg:mx-0 lg:px-0">
        {FILTERS.map((item) => {
          const active = filter === item.key;
          const count =
            item.key === "all"
              ? subjectChapters.length
              : subjectChapters.filter((chapter) => {
                  const rows = lectures.filter((lecture) => lecture.chapterId === chapter.id);
                  const completed = rows.filter((lecture) => lecture.status === "completed").length;
                  return (
                    (item.key === "done" && rows.length > 0 && completed === rows.length) ||
                    (item.key === "progress" && completed > 0 && completed < rows.length) ||
                    (item.key === "todo" && completed === 0)
                  );
                }).length;
          return (
            <button
              key={item.key}
              onClick={() => setFilter(item.key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                active
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
              }`}
            >
              {item.label} · {count}
            </button>
          );
        })}
      </div>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search chapters…"
        className="mt-3 h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none sm:ml-auto sm:mt-0 sm:w-56"
      />

      <div className="space-y-3">
        {visible.length ? (
          visible.map((chapter) => (
            <ChapterCard
              key={chapter.id}
              chapter={chapter}
              lectures={lectures}
              subject={subject}
              onEdit={(target) => {
                setEditing(target);
                setModalOpen(true);
              }}
            />
          ))
        ) : (
          <EmptyState
            emoji="🗂️"
            title={subjectChapters.length ? "Nothing matches this filter" : "No chapters yet"}
            description={
              subjectChapters.length
                ? "Try another filter or clear the search."
                : "Add chapters and set how many lectures each one has — then tick them off as you study."
            }
            action={
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setModalOpen(true);
                }}
              >
                + Add chapter
              </Button>
            }
          />
        )}
      </div>

      {modalOpen ? (
        <ChapterModal
          onClose={() => setModalOpen(false)}
          subject={subject}
        chapter={editing}
          nextNumber={
            subjectChapters.reduce((max, chapter) => Math.max(max, chapter.chapterNumber ?? 0), 0) + 1
          }
        />
      ) : null}
    </div>
  );
}
