"use client";

import { useState } from "react";
import { useStudy } from "@/components/study-provider";
import { Badge, Button, Card, Progress } from "@/components/ui";
import {
  chapterLabel,
  cn,
  formatHours,
  isMilestone,
  lecturePillText,
  plural,
  relativeTime,
} from "@/lib/format";
import type { Chapter, Lecture, Subject } from "@/lib/types";

export function LecturePills({
  lectures,
  onToggle,
  limit,
}: {
  lectures: Lecture[];
  onToggle: (id: number) => void;
  limit?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const ordered = [...lectures].sort((a, b) => a.lectureNumber - b.lectureNumber);
  const collapsed = limit !== undefined && ordered.length > limit;
  const visible = expanded || limit === undefined ? ordered : ordered.slice(0, limit);

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-1.5">
        {visible.map((lecture) => {
          const done = lecture.status === "completed";
          const milestone = isMilestone(lecture);
          return (
            <button
              key={lecture.id}
              onClick={() => onToggle(lecture.id)}
              title={
                done
                  ? `${lecture.label ?? `Lecture ${lecture.lectureNumber}`} · completed ${relativeTime(lecture.completedAt ?? "")}`
                  : `${lecture.label ?? `Lecture ${lecture.lectureNumber}`} · ${lecture.hours ? formatHours(lecture.hours) : "duration not listed"} pending`
              }
              className={cn(
                "relative flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-semibold transition",
                done
                  ? milestone
                    ? "bg-amber-500 text-white hover:bg-amber-400"
                    : "bg-slate-900 text-white hover:bg-slate-700"
                  : milestone
                    ? "border border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-400"
                    : "border border-slate-200 bg-white text-slate-500 hover:border-slate-400 hover:text-slate-900",
              )}
            >
              {done ? "✓" : milestone ? "🎯" : lecturePillText(lecture)}
            </button>
          );
        })}
        {collapsed ? (
          <button
            onClick={() => setExpanded((prev) => !prev)}
            className="flex h-8 items-center rounded-lg border border-dashed border-slate-300 px-2.5 text-xs font-semibold text-slate-500 transition active:scale-95"
          >
            {expanded
              ? "show less"
              : `+${ordered.length - limit} more${ordered.length > 20 ? " parts" : ""}`}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ChapterCard({
  chapter,
  lectures,
  subject,
  onEdit,
  showSubject = false,
  pillLimit = 12,
}: {
  chapter: Chapter;
  lectures: Lecture[];
  subject?: Subject;
  onEdit?: (chapter: Chapter) => void;
  showSubject?: boolean;
  pillLimit?: number;
}) {
  const { toggleLecture, chapterAction, deleteChapter, addLectures } = useStudy();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const rows = lectures.filter((lecture) => lecture.chapterId === chapter.id);
  const completed = rows.filter((lecture) => lecture.status === "completed");
  const percent = rows.length ? Math.round((completed.length / rows.length) * 100) : 0;
  const plannedHours = rows.reduce((sum, lecture) => sum + lecture.hours, 0);
  const nextLecture = rows.find((lecture) => lecture.status === "pending" && !isMilestone(lecture));
  const allDone = rows.length > 0 && percent === 100;

  return (
    <Card className="p-4 transition hover:border-slate-300 active:scale-[0.995]">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold",
            allDone ? "bg-emerald-500 text-white" : "bg-slate-900 text-white",
          )}
        >
          {allDone ? "✓" : chapter.chapterNumber === null ? "Live" : chapter.chapterNumber}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold tracking-tight text-slate-900">
                {chapter.title}
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                {showSubject && subject ? (
                  <span className="mr-1.5 font-medium text-slate-600">{subject.name} ·</span>
                ) : null}
                {completed.length}/{rows.length || chapter.lectureCount} lectures ·{" "}
                {formatHours(completed.reduce((sum, l) => sum + l.hours, 0))} of{" "}
                {formatHours(plannedHours)} · updated {relativeTime(chapter.updatedAt)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-700">{percent}%</span>
              <div className="relative">
                <Button variant="ghost" size="icon" onClick={() => setMenuOpen((prev) => !prev)} aria-label="Chapter actions">
                  ⋯
                </Button>
                {menuOpen ? (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-xl">
                      <button
                        className="w-full px-3 py-2 text-left hover:bg-slate-50"
                        onClick={() => {
                          setMenuOpen(false);
                          void addLectures(chapter.id, 1);
                        }}
                      >
                        ➕ Add 1 lecture slot
                      </button>
                      <button
                        className="w-full px-3 py-2 text-left hover:bg-slate-50"
                        onClick={() => {
                          setMenuOpen(false);
                          void chapterAction(chapter.id, "complete");
                        }}
                      >
                        ✅ Mark chapter complete
                      </button>
                      <button
                        className="w-full px-3 py-2 text-left hover:bg-slate-50"
                        onClick={() => {
                          setMenuOpen(false);
                          void chapterAction(chapter.id, "reset");
                        }}
                      >
                        ↩️ Reset progress
                      </button>
                      {onEdit ? (
                        <button
                          className="w-full px-3 py-2 text-left hover:bg-slate-50"
                          onClick={() => {
                            setMenuOpen(false);
                            onEdit(chapter);
                          }}
                        >
                          ✏️ Edit plan
                        </button>
                      ) : null}
                      <button
                        className="w-full px-3 py-2 text-left text-rose-600 hover:bg-rose-50"
                        onClick={() => {
                          setMenuOpen(false);
                          setConfirmDelete(true);
                        }}
                      >
                        🗑️ Delete chapter
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <Progress
            percent={percent}
            className="mt-2.5"
            barClassName={allDone ? "bg-emerald-500" : "bg-gradient-to-r from-indigo-500 to-sky-500"}
          />

          {chapter.notes ? (
            <div className="mt-2.5 whitespace-pre-line rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
              {chapter.notes}
            </div>
          ) : null}

          <LecturePills
            lectures={rows}
            limit={pillLimit}
            onToggle={(id) => void toggleLecture(id)}
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {nextLecture ? (
              <Button size="sm" variant="subtle" onClick={() => void toggleLecture(nextLecture.id)}>
                ✓ Done with {nextLecture.label ?? `lecture ${nextLecture.lectureNumber}`}
              </Button>
            ) : rows.length ? (
              <Badge className="border-emerald-100 bg-emerald-50 text-emerald-700">
                🎉 Chapter finished
              </Badge>
            ) : (
              <Badge className="border-slate-200 bg-slate-50 text-slate-500">No lectures planned</Badge>
            )}
            <span className="text-[11px] text-slate-400">
              {plural(rows.length - completed.length, "lecture", "lectures")} left ·{" "}
              {formatHours(rows.filter((l) => l.status !== "completed").reduce((sum, l) => sum + l.hours, 0))}
            </span>
          </div>
        </div>
      </div>

      {confirmDelete ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-xs text-rose-800">
          <span>Delete “{chapterLabel(chapter)}” and its {rows.length} lecture records?</span>
          <span className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                setConfirmDelete(false);
                void deleteChapter(chapter.id);
              }}
            >
              Delete
            </Button>
          </span>
        </div>
      ) : null}
    </Card>
  );
}
