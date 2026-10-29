"use client";

import Link from "next/link";
import { useState } from "react";
import { useStudy } from "@/components/study-provider";
import { Button, Card, EmptyState, Field, Input, Modal, Progress, Select, Skeleton, StatCard } from "@/components/ui";
import { COLOR_KEYS, colorOf, formatHours, statsForChapters } from "@/lib/format";
import type { Subject } from "@/lib/types";

function SubjectModal({ onClose, subject }: { onClose: () => void; subject?: Subject | null }) {
  const { createSubject, updateSubject } = useStudy();
  const [name, setName] = useState(subject?.name ?? "");
  const [teacher, setTeacher] = useState(subject?.teacher ?? "");
  const [color, setColor] = useState(subject?.color ?? "indigo");
  const [hours, setHours] = useState(String(subject?.defaultHoursPerLecture ?? 3));
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const payload = {
      name: name.trim(),
      teacher: teacher.trim() || null,
      color,
      defaultHoursPerLecture: Math.max(0.25, Number(hours) || 3),
    };
    const done = subject
      ? await updateSubject(subject.id, payload)
      : await createSubject(payload);
    setSaving(false);
    if (done) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={subject ? "Edit subject" : "New subject"}
      description="Each subject keeps its own chapters, lectures and history."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={saving} onClick={submit}>
            {subject ? "Save subject" : "Create subject"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Subject name" className="sm:col-span-2">
          <Input value={name} autoFocus placeholder="e.g. Indirect Tax" onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Faculty / source" hint="optional">
          <Input value={teacher} placeholder="JK Shah Classes" onChange={(event) => setTeacher(event.target.value)} />
        </Field>
        <Field label="Default hours per lecture">
          <Input
            type="number"
            min="0.25"
            step="0.25"
            value={hours}
            onChange={(event) => setHours(event.target.value)}
          />
        </Field>
        <Field label="Colour" className="sm:col-span-2">
          <Select value={color} onChange={(event) => setColor(event.target.value)}>
            {COLOR_KEYS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

export default function SubjectsPage() {
  const { loading, subjects, chapters, lectures, deleteSubject, sessions } = useStudy();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [confirming, setConfirming] = useState<Subject | null>(null);

  const totals = statsForChapters(chapters, lectures);
  const loggedHours = sessions.reduce((sum, session) => sum + session.hours, 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24" />
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <Skeleton key={index} className="h-52" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">Subjects</h2>
          <p className="text-sm text-slate-500">
            {subjects.length
              ? "Create, rename or remove subjects — every chapter and lecture is kept in sync."
              : "Start by adding your first subject."}
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          + New subject
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Subjects" value={String(subjects.length)} icon="📚" />
        <StatCard label="Chapters planned" value={String(totals.chapters)} icon="🗂️" />
        <StatCard label="Lectures" value={`${totals.completed}/${totals.total}`} icon="🎬" />
        <StatCard label="Logged study time" value={formatHours(loggedHours)} icon="⏱️" accent="text-indigo-600" />
      </div>

      {subjects.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {subjects.map((subject) => {
            const subjectChapters = chapters.filter((chapter) => chapter.subjectId === subject.id);
            const stats = statsForChapters(subjectChapters, lectures);
            const palette = colorOf(subject);
            return (
              <Card key={subject.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className={cnDot(palette.dot)} />
                    <div>
                      <Link
                        href={`/subject?id=${subject.id}`}
                        className="text-base font-semibold tracking-tight text-slate-900 hover:underline"
                      >
                        {subject.name}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {subject.teacher ?? "No faculty set"} · {formatHours(subject.defaultHoursPerLecture)} per lecture
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Edit subject"
                      onClick={() => {
                        setEditing(subject);
                        setModalOpen(true);
                      }}
                    >
                      ✏️
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete subject"
                      onClick={() => setConfirming(subject)}
                    >
                      🗑️
                    </Button>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                    <span>
                      {stats.completed}/{stats.total} lectures
                    </span>
                    <span>{stats.percent}%</span>
                  </div>
                  <Progress
                    percent={stats.percent}
                    className="mt-2"
                    barClassName={palette.bar}
                  />
                  <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-xl bg-slate-50 p-2.5">
                      <dt className="text-slate-400">Chapters</dt>
                      <dd className="font-semibold text-slate-800">
                        {stats.completedChapters}/{stats.chapters}
                      </dd>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-2.5">
                      <dt className="text-slate-400">Studied</dt>
                      <dd className="font-semibold text-slate-800">{formatHours(stats.studiedHours)}</dd>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-2.5">
                      <dt className="text-slate-400">Left</dt>
                      <dd className="font-semibold text-slate-800">{formatHours(stats.remainingHours)}</dd>
                    </div>
                  </dl>
                </div>

                {confirming?.id === subject.id ? (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-xs text-rose-800">
                    <span>
                      Delete {subject.name} with {subjectChapters.length} chapters and all lecture history?
                    </span>
                    <span className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                        Keep
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          void deleteSubject(subject.id);
                          setConfirming(null);
                        }}
                      >
                        Delete
                      </Button>
                    </span>
                  </div>
                ) : (
                  <div className="mt-4 flex gap-2">
                    <Link href={`/subject?id=${subject.id}`} className="flex-1">
                      <Button className="w-full" size="sm">
                        Open chapters
                      </Button>
                    </Link>
                    <Link href={`/data?subjectId=${subject.id}`} className="flex-1">
                      <Button className="w-full" size="sm" variant="ghost">
                        Export JSON
                      </Button>
                    </Link>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          emoji="📗"
          title="No subjects yet"
          description="Add a subject manually, or head to Import & export to paste your Direct Tax JSON."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="primary"
                onClick={() => {
                  setEditing(null);
                  setModalOpen(true);
                }}
              >
                + New subject
              </Button>
              <Link href="/data">
                <Button>Import JSON</Button>
              </Link>
            </div>
          }
        />
      )}

      {modalOpen ? <SubjectModal onClose={() => setModalOpen(false)} subject={editing} /> : null}
    </div>
  );
}

function cnDot(dot: string) {
  return `mt-1 h-3 w-3 shrink-0 rounded-full ${dot}`;
}
