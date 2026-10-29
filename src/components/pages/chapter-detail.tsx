"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ChapterModal } from "@/components/chapter-modal";
import { useStudy } from "@/components/study-provider";
import { Badge, Button, Card, EmptyState, Progress, Skeleton } from "@/components/ui";
import {
  KIND_META,
  colorOf,
  formatHours,
  isMilestone,
  lecturePillText,
  plural,
  prettyDay,
  relativeTime,
} from "@/lib/format";

export default function ChapterDetailPage() {
  const searchParams = useSearchParams();
  const chapterId = Number(searchParams.get("id"));
  const {
    loading,
    subjects,
    chapters,
    lectures,
    sessions,
    toggleLecture,
    updateLecture,
    deleteLecture,
    addLectures,
    chapterAction,
  } = useStudy();
  const [editOpen, setEditOpen] = useState(false);
  const [draftNotes, setDraftNotes] = useState<Record<number, string>>({});

  const chapter = chapters.find((row) => row.id === chapterId);
  const subject = subjects.find((row) => row.id === chapter?.subjectId);
  const rows = useMemo(
    () =>
      lectures
        .filter((lecture) => lecture.chapterId === chapterId)
        .sort((a, b) => a.lectureNumber - b.lectureNumber),
    [lectures, chapterId],
  );
  const completed = rows.filter((lecture) => lecture.status === "completed");
  const percent = rows.length ? Math.round((completed.length / rows.length) * 100) : 0;
  const chapterSessions = useMemo(
    () => sessions.filter((session) => session.chapterId === chapterId),
    [sessions, chapterId],
  );
  const label = chapter
    ? chapter.chapterNumber === null
      ? chapter.title
      : `Ch ${chapter.chapterNumber} · ${chapter.title}`
    : "";

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (!chapter || !subject) {
    return (
      <EmptyState
        emoji="🤷"
        title="Chapter not found"
        description="This chapter may have been deleted."
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
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
        <Link href="/subjects" className="hover:text-slate-900">
          Subjects
        </Link>
        <span>/</span>
        <Link href={`/subject?id=${subject.id}`} className="hover:text-slate-900">
          {subject.name}
        </Link>
        <span>/</span>
        <span className="text-slate-900">{label}</span>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${palette.text} ${palette.soft} border`}>
                {chapter.chapterNumber === null ? "Un-numbered" : `Chapter ${chapter.chapterNumber}`}
              </span>
              {percent === 100 && rows.length ? (
                <Badge className="border-emerald-100 bg-emerald-50 text-emerald-700">Completed</Badge>
              ) : null}
            </div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">{chapter.title}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {completed.length}/{rows.length} lectures · {formatHours(chapter.hoursPerLecture)} each ·{" "}
              {formatHours(completed.reduce((sum, l) => sum + l.hours, 0))} studied of{" "}
              {formatHours(rows.length * chapter.hoursPerLecture)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void addLectures(chapter.id, 1)}>
              + Add lecture
            </Button>
            <Button size="sm" onClick={() => setEditOpen(true)}>
              ✏️ Edit plan
            </Button>
            <Button
              size="sm"
              variant="subtle"
              onClick={() => void chapterAction(chapter.id, percent === 100 ? "reset" : "complete")}
            >
              {percent === 100 ? "↩️ Reset chapter" : "✅ Complete chapter"}
            </Button>
          </div>
        </div>

        <Progress
          percent={percent}
          className="mt-4 h-2.5"
          barClassName={percent === 100 ? "bg-emerald-500" : "bg-gradient-to-r from-indigo-500 to-sky-500"}
        />

        {chapter.notes ? (
          <div className="mt-4 whitespace-pre-line rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            <span className="font-semibold text-slate-700">Notes · </span>
            {chapter.notes}
          </div>
        ) : null}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-slate-900">Lectures</h3>
            <p className="text-xs text-slate-500">
              Toggle a lecture to log it in your history. Notes and durations are saved on blur.
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {plural(rows.length - completed.length, "lecture", "lectures")} left ·{" "}
            {formatHours(rows.filter((l) => l.status !== "completed").reduce((sum, l) => sum + l.hours, 0))}
          </span>
        </div>

        {rows.length ? (
          <ul className="divide-y divide-slate-100">
            {rows.map((lecture) => {
              const done = lecture.status === "completed";
              const milestone = isMilestone(lecture);
              return (
                <li key={lecture.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                  <button
                    onClick={() => void toggleLecture(lecture.id)}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold transition ${
                      done
                        ? milestone
                          ? "bg-amber-500 text-white hover:bg-amber-400"
                          : "bg-emerald-500 text-white hover:bg-emerald-600"
                        : milestone
                          ? "border border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-400"
                          : "border border-slate-200 bg-white text-slate-500 hover:border-slate-400 hover:text-slate-900"
                    }`}
                    title={done ? "Mark as pending" : "Mark as studied"}
                  >
                    {done ? "✓" : milestone ? "🎯" : lecturePillText(lecture)}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">
                      {lecture.label ?? `Lecture ${lecture.lectureNumber}`}
                    </p>
                    <p className="text-xs text-slate-500">
                      {done
                        ? `Completed ${lecture.completedAt ? prettyDay(lecture.completedAt.slice(0, 10)) : ""} · ${relativeTime(lecture.completedAt ?? "")}`
                        : `Pending · ${lecture.hours ? formatHours(lecture.hours) : "duration not listed"}`}
                    </p>
                    <input
                      value={draftNotes[lecture.id] ?? lecture.notes ?? ""}
                      onChange={(event) =>
                        setDraftNotes((prev) => ({ ...prev, [lecture.id]: event.target.value }))
                      }
                      onBlur={() => {
                        const draft = draftNotes[lecture.id];
                        if (draft === undefined) return;
                        if (draft !== (lecture.notes ?? "")) {
                          void updateLecture(lecture.id, { notes: draft.trim() || null });
                        }
                      }}
                      placeholder="Add a note for this lecture…"
                      className="mt-2 h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0.25"
                      step="0.25"
                      defaultValue={lecture.hours}
                      onBlur={(event) => {
                        const value = Number(event.target.value);
                        if (value && value !== lecture.hours) {
                          void updateLecture(lecture.id, { hours: value });
                        }
                      }}
                      className="h-9 w-20 rounded-xl border border-slate-200 bg-white px-2 text-center text-sm shadow-sm focus:border-slate-400 focus:outline-none"
                      title="Hours"
                    />
                    <span className="text-xs font-medium text-slate-400">h</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete lecture"
                      onClick={() => void deleteLecture(lecture.id)}
                    >
                      🗑️
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="p-5">
            <EmptyState
              emoji="🎬"
              title="No lectures planned"
              description="Add lecture slots to start tracking your progress."
              action={
                <Button size="sm" variant="primary" onClick={() => void addLectures(chapter.id, 1)}>
                  + Add first lecture
                </Button>
              }
            />
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold tracking-tight text-slate-900">Chapter history</h3>
        <p className="text-xs text-slate-500">
          Every study entry recorded against {chapter.title} — including manual revision logs.
        </p>
        {chapterSessions.length ? (
          <ul className="mt-4 space-y-2">
            {[...chapterSessions]
              .sort((a, b) => (a.studiedOn < b.studiedOn ? 1 : -1))
              .map((session) => (
                <li
                  key={session.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="text-base">{KIND_META[session.kind]?.emoji ?? "🕘"}</span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-800">
                        {session.lectureLabel ?? session.chapterTitle ?? session.subjectName}
                      </p>
                      <p className="truncate text-[11px] text-slate-500">
                        {prettyDay(session.studiedOn)}
                        {session.note ? ` · ${session.note}` : ""}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-slate-700">{formatHours(session.hours)}</span>
                </li>
              ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
            Nothing logged yet — complete a lecture above or add a revision entry from the header.
          </p>
        )}
      </Card>

      {editOpen ? (
        <ChapterModal onClose={() => setEditOpen(false)} subject={subject} chapter={chapter} />
      ) : null}
    </div>
  );
}
