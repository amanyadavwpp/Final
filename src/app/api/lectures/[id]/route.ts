import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { chapters, lectures, studySessions } from "@/db/schema";
import { bad, num, ok, optionalText, parseId, readJson } from "@/lib/api";
import {
  dayKey,
  getChapterOrThrow,
  getSubjectOrThrow,
  logActivity,
  mappers,
  timestampFromDayKey,
} from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return bad("Invalid lecture id");

  const [lecture] = await db.select().from(lectures).where(eq(lectures.id, id)).limit(1);
  if (!lecture) return bad("Lecture not found", 404);
  const chapter = await getChapterOrThrow(lecture.chapterId);
  if (!chapter) return bad("Chapter not found", 404);
  const subject = await getSubjectOrThrow(chapter.subjectId);

  const body = await readJson<Record<string, unknown>>(request);
  const label = lecture.label
    ? `${chapter.title} · ${lecture.label}`
    : chapter.chapterNumber === null
      ? `${chapter.title} · Lecture ${lecture.lectureNumber}`
      : `Ch ${chapter.chapterNumber} · Lecture ${lecture.lectureNumber}`;

  const requestedStatus = optionalText(body.status);
  let nextStatus: "pending" | "completed" =
    body.toggle === true
      ? lecture.status === "completed"
        ? "pending"
        : "completed"
      : requestedStatus === "completed" || requestedStatus === "pending"
        ? requestedStatus
        : lecture.status === "completed"
          ? "completed"
          : "pending";

  const studiedOn = optionalText(body.studiedOn) ?? dayKey();
  const hours = Math.max(0, Math.min(24, num(body.hours, lecture.hours || chapter.hoursPerLecture)));

  if (nextStatus === "completed" && lecture.status !== "completed") {
    const completedAt = timestampFromDayKey(studiedOn);
    await db
      .update(lectures)
      .set({ status: "completed", completedAt, hours, notes: optionalText(body.notes) ?? lecture.notes, updatedAt: new Date() })
      .where(eq(lectures.id, id));
    await db.insert(studySessions).values({
      subjectId: chapter.subjectId,
      chapterId: chapter.id,
      lectureId: id,
      subjectName: subject?.name ?? "Subject",
      chapterTitle: chapter.title,
      lectureLabel: label,
      kind: "lecture",
      hours,
      studiedOn,
      note: null,
    });
    await logActivity({
      subjectId: chapter.subjectId,
      chapterId: chapter.id,
      lectureId: id,
      kind: "completed",
      title: label,
      detail: `${hours ? `${hours}h logged` : "marked done"} on ${studiedOn}`,
    });
  } else if (nextStatus === "pending" && lecture.status === "completed") {
    await db
      .update(lectures)
      .set({ status: "pending", completedAt: null, notes: optionalText(body.notes) ?? lecture.notes, updatedAt: new Date() })
      .where(eq(lectures.id, id));
    await db
      .delete(studySessions)
      .where(and(eq(studySessions.lectureId, id), eq(studySessions.kind, "lecture")));
    await logActivity({
      subjectId: chapter.subjectId,
      chapterId: chapter.id,
      lectureId: id,
      kind: "reopened",
      title: label,
      detail: "Lecture reopened",
    });
  } else {
    const patch: Partial<typeof lectures.$inferInsert> = { updatedAt: new Date() };
    const notes = optionalText(body.notes);
    if (notes !== undefined) patch.notes = notes;
    if (body.hours !== undefined) patch.hours = hours;
    if (Object.keys(patch).length > 1) {
      await db.update(lectures).set(patch).where(eq(lectures.id, id));
    }
  }

  await db.update(chapters).set({ updatedAt: new Date() }).where(eq(chapters.id, chapter.id));
  const [fresh] = await db.select().from(lectures).where(eq(lectures.id, id)).limit(1);
  return ok({ lecture: mappers.mapLecture(fresh) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return bad("Invalid lecture id");

  const [lecture] = await db.select().from(lectures).where(eq(lectures.id, id)).limit(1);
  if (!lecture) return bad("Lecture not found", 404);
  const chapter = await getChapterOrThrow(lecture.chapterId);
  if (!chapter) return bad("Chapter not found", 404);

  await logActivity({
    subjectId: chapter.subjectId,
    chapterId: chapter.id,
    kind: "deleted",
    title:
      chapter.chapterNumber === null
        ? `${chapter.title} · Lecture ${lecture.lectureNumber}`
        : `Ch ${chapter.chapterNumber} · Lecture ${lecture.lectureNumber}`,
    detail: "Lecture slot removed",
  });

  await db.delete(lectures).where(eq(lectures.id, id));
  const remaining = await db.select().from(lectures).where(eq(lectures.chapterId, chapter.id));
  const highest = remaining.reduce((max, row) => Math.max(max, row.lectureNumber), 0);
  await db
    .update(chapters)
    .set({ lectureCount: highest, updatedAt: new Date() })
    .where(eq(chapters.id, chapter.id));

  const fresh = await getChapterOrThrow(chapter.id);
  return ok({ chapter: fresh ? mappers.mapChapter(fresh) : null, deleted: true });
}
