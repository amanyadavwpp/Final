"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useStudy } from "@/components/study-provider";
import { Button, Card, EmptyState, Progress, Skeleton, StatCard } from "@/components/ui";
import { colorOf, cn, formatHours, plural, prettyDay, relativeTime } from "@/lib/format";

type TestRow = {
  id: number;
  subjectId: number;
  subjectName: string;
  chapterId: number;
  chapterTitle: string;
  chapterNumber: number | null;
  label: string;
  done: boolean;
  completedAt: string | null;
  position: number;
};

export default function TestsPage() {
  const { loading, subjects, chapters, lectures, toggleLecture } = useStudy();
  const [filter, setFilter] = useState<"all" | "todo" | "done">("all");

  const tests = useMemo<TestRow[]>(() => {
    const rows: TestRow[] = [];
    for (const chapter of chapters) {
      const subject = subjects.find((row) => row.id === chapter.subjectId);
      if (!subject) continue;
      const chapterLectures = lectures
        .filter((lecture) => lecture.chapterId === chapter.id && lecture.kind === "milestone")
        .sort((a, b) => a.lectureNumber - b.lectureNumber);
      chapterLectures.forEach((lecture) => {
        rows.push({
          id: lecture.id,
          subjectId: subject.id,
          subjectName: subject.name,
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          chapterNumber: chapter.chapterNumber,
          label: (lecture.label ?? "Milestone").replace(/^Milestone\s*—\s*/, ""),
          done: lecture.status === "completed",
          completedAt: lecture.completedAt,
          position: lecture.lectureNumber,
        });
      });
    }
    return rows;
  }, [chapters, lectures, subjects]);

  const visible = useMemo(
    () =>
      tests.filter((test) =>
        filter === "all" ? true : filter === "done" ? test.done : !test.done,
      ),
    [tests, filter],
  );

  const grouped = useMemo(() => {
    const map = new Map<number, TestRow[]>();
    for (const test of visible) {
      const list = map.get(test.subjectId) ?? [];
      list.push(test);
      map.set(test.subjectId, list);
    }
    return [...map.entries()];
  }, [visible]);

  const nextTest = useMemo(() => tests.find((test) => !test.done) ?? null, [tests]);
  const doneCount = tests.filter((test) => test.done).length;
  const percent = tests.length ? Math.round((doneCount / tests.length) * 100) : 0;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-16" />
        <Skeleton className="h-56" />
      </div>
    );
  }

  if (!tests.length) {
    return (
      <EmptyState
        emoji="🎯"
        title="No tests tracked yet"
        description="Tests appear here when a chapter has milestone entries — your Audit and Financial Reporting plans already include them."
        action={
          <Link href="/subjects">
            <Button variant="primary">Browse subjects</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">Tests &amp; milestones</h2>
        <p className="text-sm text-slate-500">
          Every test milestone across your subjects — tick them off as you clear each one.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Tests done" value={`${doneCount}/${tests.length}`} icon="🎯" />
        <StatCard
          label="Remaining"
          value={String(tests.length - doneCount)}
          hint={nextTest ? `next: ${nextTest.label.slice(0, 22)}…` : "all clear"}
          icon="⏳"
          accent="text-amber-600"
        />
        <StatCard label="Progress" value={`${percent}%`} icon="📈" accent="text-emerald-600" />
        <StatCard label="Subjects" value={String(grouped.length)} icon="📚" />
      </div>

      {nextTest ? (
        <Card className="border-amber-200 bg-amber-50/70 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
            Up next
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{nextTest.label}</p>
          <p className="mt-0.5 text-xs text-amber-800">
            {nextTest.subjectName} ·{" "}
            {nextTest.chapterNumber === null
              ? nextTest.chapterTitle
              : `Ch ${nextTest.chapterNumber} · ${nextTest.chapterTitle}`}
          </p>
          <Button
            size="sm"
            variant="primary"
            className="mt-3"
            onClick={() => void toggleLecture(nextTest.id)}
          >
            ✓ I appeared for this test
          </Button>
        </Card>
      ) : (
        <Card className="border-emerald-200 bg-emerald-50/70 p-4">
          <p className="text-sm font-semibold text-emerald-800">
            🎉 Every test milestone is cleared!
          </p>
          <p className="mt-1 text-xs text-emerald-700">
            Keep revising — add revision entries from the Log tab to build your history.
          </p>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "todo", "done"] as const).map((option) => (
          <button
            key={option}
            onClick={() => setFilter(option)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition active:scale-95",
              filter === option
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-600",
            )}
          >
            {option === "all" ? "All tests" : option === "todo" ? "Pending" : "Cleared"}
          </button>
        ))}
      </div>

      <div className="space-y-5">
        {grouped.map(([subjectId, rows]) => {
          const subject = subjects.find((row) => row.id === subjectId);
          const palette = colorOf(subject);
          const done = rows.filter((row) => row.done).length;
          return (
            <Card key={subjectId} className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", palette.dot)} />
                  <Link
                    href={`/subject?id=${subjectId}`}
                    className="truncate text-sm font-semibold tracking-tight text-slate-900"
                  >
                    {subject?.name ?? "Subject"}
                  </Link>
                </div>
                <span className="tnum shrink-0 text-xs font-semibold text-slate-500">
                  {done}/{rows.length}
                </span>
              </div>
              <div className="px-4 pt-3">
                <Progress percent={rows.length ? (done / rows.length) * 100 : 0} barClassName={palette.bar} />
              </div>
              <ul className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <li key={row.id} className="flex items-center gap-3 px-4 py-3">
                    <button
                      onClick={() => void toggleLecture(row.id)}
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-semibold transition active:scale-90",
                        row.done
                          ? "bg-emerald-500 text-white"
                          : "border border-amber-200 bg-amber-50 text-amber-600",
                      )}
                      aria-label={row.done ? "Mark as pending" : "Mark as cleared"}
                    >
                      {row.done ? "✓" : "🎯"}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-sm font-semibold",
                          row.done ? "text-slate-400 line-through" : "text-slate-900",
                        )}
                      >
                        {row.label}
                      </p>
                      <p className="truncate text-[11px] text-slate-400">
                        {row.chapterNumber === null
                          ? row.chapterTitle
                          : `Ch ${row.chapterNumber} · ${row.chapterTitle}`}
                        {row.completedAt
                          ? ` · cleared ${prettyDay(row.completedAt.slice(0, 10))} (${relativeTime(row.completedAt)})`
                          : ""}
                      </p>
                    </div>
                    <Link
                      href={`/chapter?id=${row.chapterId}`}
                      className="shrink-0 text-[11px] font-semibold text-slate-400"
                    >
                      Open ›
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>

      <p className="px-1 text-center text-[11px] text-slate-400">
        {plural(tests.length, "test milestone")} tracked across your subjects.
      </p>
    </div>
  );
}
