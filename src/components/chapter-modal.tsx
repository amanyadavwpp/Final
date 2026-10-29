"use client";

import { useState } from "react";
import { useStudy } from "@/components/study-provider";
import { Button, Field, Input, Modal, Textarea } from "@/components/ui";
import type { Chapter, Subject } from "@/lib/types";

export function ChapterModal({
  onClose,
  subject,
  chapter,
  nextNumber,
}: {
  onClose: () => void;
  subject: Subject;
  chapter?: Chapter | null;
  nextNumber?: number;
}) {
  const { createChapter, updateChapter } = useStudy();
  const [title, setTitle] = useState(chapter?.title ?? "");
  const [number, setNumber] = useState(
    chapter ? (chapter.chapterNumber === null ? "" : String(chapter.chapterNumber)) : (nextNumber ? String(nextNumber) : ""),
  );
  const [lectureCount, setLectureCount] = useState(String(chapter?.lectureCount ?? 3));
  const [hours, setHours] = useState(String(chapter?.hoursPerLecture ?? subject.defaultHoursPerLecture));
  const [notes, setNotes] = useState(chapter?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const payload = {
      title: title.trim(),
      chapterNumber: number.trim() === "" ? null : Number(number),
      lectureCount: Math.max(0, Number(lectureCount) || 0),
      hoursPerLecture: Math.max(0.25, Number(hours) || subject.defaultHoursPerLecture),
      notes: notes.trim() || null,
    };
    const done = chapter
      ? await updateChapter(chapter.id, payload)
      : await createChapter({ subjectId: subject.id, ...payload });
    setSaving(false);
    if (done) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={chapter ? "Edit chapter plan" : "Add chapter"}
      description={
        chapter
          ? "Update the plan — completed lectures are never dropped."
          : `New chapter for ${subject.name}`
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={saving} onClick={submit}>
            {chapter ? "Save changes" : "Add chapter"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Chapter title" className="sm:col-span-2">
          <Input
            autoFocus
            value={title}
            placeholder="e.g. Capital Gains"
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <Field label="Chapter number" hint="blank = un-numbered">
          <Input
            value={number}
            inputMode="numeric"
            placeholder="e.g. 2"
            onChange={(event) => setNumber(event.target.value)}
          />
        </Field>
        <Field label="Hours per lecture">
          <Input
            type="number"
            min="0.25"
            step="0.25"
            value={hours}
            onChange={(event) => setHours(event.target.value)}
          />
        </Field>
        <Field label="Planned lectures" hint="you can add more later" className="sm:col-span-2">
          <Input
            type="number"
            min="0"
            step="1"
            value={lectureCount}
            onChange={(event) => setLectureCount(event.target.value)}
          />
        </Field>
        <Field label="Notes" hint="optional" className="sm:col-span-2">
          <Textarea
            value={notes}
            placeholder="Summary, faculty tips, revision dates…"
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>
        {!chapter ? (
          <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500 sm:col-span-2">
            {Number(lectureCount) || 0} lectures × {Number(hours) || 0}h ={" "}
            <span className="font-semibold text-slate-700">
              {((Number(lectureCount) || 0) * (Number(hours) || 0)).toFixed(1)}h
            </span>{" "}
            of planned study
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
