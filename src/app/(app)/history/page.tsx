"use client";

import { useMemo, useState } from "react";
import { useStudy } from "@/components/study-provider";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
  StatCard,
  Textarea,
} from "@/components/ui";
import { KIND_META, dayKeyOf, formatHours, hoursByDay, prettyDay, shiftDayKey } from "@/lib/format";
import type { StudySession } from "@/lib/types";

const KINDS = ["all", "lecture", "revision", "practice", "test"] as const;

function SessionModal({ onClose, session }: { onClose: () => void; session?: StudySession | null }) {
  const { subjects, chapters, createSession, updateSession } = useStudy();
  const [studiedOn, setStudiedOn] = useState(session?.studiedOn ?? dayKeyOf());
  const [hours, setHours] = useState(String(session?.hours ?? 1));
  const [kind, setKind] = useState<string>(session?.kind ?? "revision");
  const [subjectId, setSubjectId] = useState(
    session ? (session.subjectId ? String(session.subjectId) : "") : subjects[0] ? String(subjects[0].id) : "",
  );
  const [chapterId, setChapterId] = useState(session?.chapterId ? String(session.chapterId) : "");
  const [note, setNote] = useState(session?.note ?? "");
  const [saving, setSaving] = useState(false);

  const chapterOptions = chapters.filter((chapter) => String(chapter.subjectId) === subjectId);

  return (
    <Modal
      open
      onClose={onClose}
      title={session ? "Edit log entry" : "Log study time"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={saving}
            onClick={async () => {
              const value = Number(hours);
              if (!value || value <= 0) return;
              setSaving(true);
              const done = session
                ? await updateSession(session.id, {
                    hours: value,
                    studiedOn,
                    kind: kind as StudySession["kind"],
                    note: note.trim() || null,
                  })
                : await createSession({
                    subjectId: subjectId ? Number(subjectId) : null,
                    chapterId: chapterId ? Number(chapterId) : null,
                    kind,
                    hours: value,
                    studiedOn,
                    note: note.trim() || null,
                  });
              setSaving(false);
              if (done) onClose();
            }}
          >
            {session ? "Save entry" : "Add entry"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date">
          <Input type="date" value={studiedOn} onChange={(event) => setStudiedOn(event.target.value)} />
        </Field>
        <Field label="Hours">
          <Input
            type="number"
            min="0.25"
            step="0.25"
            value={hours}
            onChange={(event) => setHours(event.target.value)}
          />
        </Field>
        <Field label="Type">
          <Select value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="lecture">Lecture</option>
            <option value="revision">Revision</option>
            <option value="practice">Practice</option>
            <option value="test">Test</option>
          </Select>
        </Field>
        {!session ? (
          <>
            <Field label="Subject">
              <Select
                value={subjectId}
                onChange={(event) => {
                  setSubjectId(event.target.value);
                  setChapterId("");
                }}
              >
                <option value="">General study</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Chapter" hint="optional" className="sm:col-span-2">
              <Select value={chapterId} onChange={(event) => setChapterId(event.target.value)}>
                <option value="">No specific chapter</option>
                {chapterOptions.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    {chapter.chapterNumber === null ? chapter.title : `Ch ${chapter.chapterNumber} · ${chapter.title}`}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        ) : null}
        <Field label="Notes" hint="optional" className="sm:col-span-2">
          <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="What did you cover?" />
        </Field>
      </div>
    </Modal>
  );
}

export default function HistoryPage() {
  const { loading, sessions, subjects, deleteSession } = useStudy();
  const [kind, setKind] = useState<(typeof KINDS)[number]>("all");
  const [subjectId, setSubjectId] = useState("all");
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StudySession | null>(null);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return sessions
      .filter((session) => {
        const matchesKind = kind === "all" || session.kind === kind;
        const matchesSubject = subjectId === "all" || String(session.subjectId ?? "") === subjectId;
        const haystack = `${session.subjectName} ${session.chapterTitle ?? ""} ${session.lectureLabel ?? ""} ${session.note ?? ""}`.toLowerCase();
        return matchesKind && matchesSubject && (!term || haystack.includes(term));
      })
      .sort((a, b) => (a.studiedOn < b.studiedOn ? 1 : a.studiedOn > b.studiedOn ? -1 : b.id - a.id));
  }, [sessions, kind, subjectId, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, StudySession[]>();
    for (const session of filtered) {
      const list = map.get(session.studiedOn) ?? [];
      list.push(session);
      map.set(session.studiedOn, list);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  const totalHours = filtered.reduce((sum, session) => sum + session.hours, 0);
  const weekHours = sessions
    .filter((session) => session.studiedOn >= shiftDayKey(6))
    .reduce((sum, session) => sum + session.hours, 0);
  const chart = hoursByDay(sessions, 7);
  const activeDays = new Set(sessions.map((session) => session.studiedOn)).size;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">Study log</h2>
          <p className="text-sm text-slate-500">
            A permanent history of every lecture, revision session and test you have recorded.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          + Log study time
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Entries shown" value={String(filtered.length)} icon="🗂️" />
        <StatCard label="Hours shown" value={formatHours(totalHours)} icon="⏱️" accent="text-indigo-600" />
        <StatCard label="Last 7 days" value={formatHours(weekHours)} icon="📈" accent="text-emerald-600" />
        <StatCard
          label="Days studied"
          value={String(activeDays)}
          hint={`avg ${formatHours(sessions.length ? totalHours / Math.max(1, activeDays) : 0)} per active day`}
          icon="🔥"
        />
      </div>

      <Card className="p-4">
        <div className="space-y-3">
        <div className="nowrap-scroll -mx-4 flex items-center gap-2 px-4">
          {KINDS.map((option) => (
            <button
              key={option}
              onClick={() => setKind(option)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition ${
                kind === option
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
              }`}
            >
              {option === "all" ? "All types" : KIND_META[option]?.label ?? option}
            </button>
          ))}
            <Select
              value={subjectId}
              onChange={(event) => setSubjectId(event.target.value)}
              className="h-9 w-auto shrink-0 py-0 text-xs"
            >
              <option value="all">All subjects</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </Select>
        </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search notes, chapters…"
            className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none sm:w-56 sm:justify-self-end"
          />
        </div>
        <div className="mt-4 flex items-end gap-1.5">
          {chart.map((day) => (
            <div key={day.key} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={`w-full rounded-md ${day.hours > 0 ? "bg-gradient-to-t from-indigo-500 to-sky-400" : "bg-slate-100"}`}
                style={{ height: `${Math.max(6, Math.min(64, (day.hours / 6) * 64))}px` }}
                title={`${prettyDay(day.key)} · ${formatHours(day.hours)}`}
              />
              <span className="text-[9px] font-medium text-slate-400">
                {new Date(`${day.key}T00:00:00`).toLocaleDateString(undefined, { weekday: "narrow" })}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {grouped.length ? (
        <div className="space-y-5">
          {grouped.map(([day, entries]) => {
            const dayHours = entries.reduce((sum, session) => sum + session.hours, 0);
            return (
              <div key={day}>
                <div className="mb-2 flex items-center justify-between px-1">
                  <h3 className="text-sm font-semibold tracking-tight text-slate-900">{prettyDay(day)}</h3>
                  <span className="text-xs font-semibold text-slate-500">{formatHours(dayHours)}</span>
                </div>
                <Card className="divide-y divide-slate-100 overflow-hidden">
                  {entries.map((session) => (
                    <div key={session.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm">
                        {KIND_META[session.kind]?.emoji ?? "🕘"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {session.lectureLabel ?? session.chapterTitle ?? session.subjectName}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {session.subjectName}
                          {session.chapterTitle && session.lectureLabel ? ` · ${session.chapterTitle}` : ""}
                          {session.note ? ` · ${session.note}` : ""}
                        </p>
                      </div>
                      <Badge className={KIND_META[session.kind]?.className ?? "bg-slate-100 text-slate-600"}>
                        {KIND_META[session.kind]?.label ?? session.kind}
                      </Badge>
                      <span className="w-14 text-right text-sm font-semibold text-slate-800">
                        {formatHours(session.hours)}
                      </span>
                      <span className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Edit entry"
                          onClick={() => {
                            setEditing(session);
                            setModalOpen(true);
                          }}
                        >
                          ✏️
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Delete entry"
                          onClick={() => void deleteSession(session.id)}
                        >
                          🗑️
                        </Button>
                      </span>
                    </div>
                  ))}
                </Card>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          emoji="🕘"
          title="No log entries yet"
          description="Completed lectures are logged automatically. You can also add revision, practice or test entries."
          action={
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
            >
              + Log study time
            </Button>
          }
        />
      )}

      {modalOpen ? <SessionModal onClose={() => setModalOpen(false)} session={editing} /> : null}
    </div>
  );
}
