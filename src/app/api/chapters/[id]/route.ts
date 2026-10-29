import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { chapters, lectures } from "@/db/schema";
import { bad, num, ok, optionalText, parseId, readJson } from "@/lib/api";
import {
  applyChapterCompletions,
  dayKey,
  getChapterOrThrow,
  logActivity,
  mappers,
  syncLectureRows,
} from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return bad("Invalid chapter id");
  const row = await getChapterOrThrow(id);
  if (!row) return bad("Chapter not found", 404);
  const lectureRows = await db.select().from(lectures).where(eq(lectures.chapterId, id));
  return ok({
    chapter: mappers.mapChapter(row),
    lectures: lectureRows.map(mappers.mapLecture),
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return bad("Invalid chapter id");

  const chapter = await getChapterOrThrow(id);
  if (!chapter) return bad("Chapter not found", 404);

  const body = await readJson<Record<string, unknown>>(request);
  const action = optionalText(body.action);

  if (action === "complete" || action === "reset") {
    const done = await db
      .select()
      .from(lectures)
      .where(and(eq(lectures.chapterId, id), eq(lectures.status, "completed")));
    const numbers = done.map((row) => row.lectureNumber);
    const target = action === "complete"
      ? Array.from({ length: chapter.lectureCount }, (_, i) => i + 1)
      : [];
    await applyChapterCompletions(id, target, dayKey());
    await db.update(chapters).set({ updatedAt: new Date() }).where(eq(chapters.id, id));
    await logActivity({
      subjectId: chapter.subjectId,
      chapterId: id,
      kind: action === "complete" ? "completed" : "reopened",
      title: chapter.chapterNumber === null ? chapter.title : `Ch ${chapter.chapterNumber} — ${chapter.title}`,
      detail:
        action === "complete"
          ? `Chapter marked complete (${target.length - numbers.length} lectures finished)`
          : `Chapter progress reset (${numbers.length} lectures reopened)`,
    });
    const fresh = await getChapterOrThrow(id);
    return ok({ chapter: fresh ? mappers.mapChapter(fresh) : null });
  }

  const patch: Partial<typeof chapters.$inferInsert> = { updatedAt: new Date() };
  const title = optionalText(body.title);
  if (title !== undefined) {
    if (!title) return bad("Chapter title cannot be empty");
    patch.title = title;
  }
  if (body.chapterNumber !== undefined) {
    patch.chapterNumber =
      body.chapterNumber === null || body.chapterNumber === ""
        ? null
        : Math.max(0, Math.round(Number(body.chapterNumber)));
  }
  const notes = optionalText(body.notes);
  if (notes !== undefined) patch.notes = notes;

  let notice: string | null = null;
  let lectureCount = chapter.lectureCount;
  let hoursPerLecture = chapter.hoursPerLecture;

  if (body.lectureCount !== undefined) {
    const requested = Math.max(0, Math.min(500, Math.round(num(body.lectureCount, chapter.lectureCount))));
    const completed = await db
      .select()
      .from(lectures)
      .where(and(eq(lectures.chapterId, id), eq(lectures.status, "completed")));
    const maxCompleted = completed.reduce((max, row) => Math.max(max, row.lectureNumber), 0);
    if (requested < maxCompleted) {
      notice = `Kept ${maxCompleted} lectures because lectures up to #${maxCompleted} are already completed.`;
      lectureCount = maxCompleted;
    } else {
      lectureCount = requested;
    }
    patch.lectureCount = lectureCount;
  }

  if (body.hoursPerLecture !== undefined) {
    hoursPerLecture = Math.max(0.25, Math.min(24, num(body.hoursPerLecture, chapter.hoursPerLecture)));
    patch.hoursPerLecture = hoursPerLecture;
  }

  await db.update(chapters).set(patch).where(eq(chapters.id, id));
  await syncLectureRows(id, lectureCount, hoursPerLecture);
  await logActivity({
    subjectId: chapter.subjectId,
    chapterId: id,
    kind: "updated",
    title: patch.title ?? chapter.title,
    detail: `Plan updated · ${lectureCount} lectures · ${hoursPerLecture}h each`,
  });

  const fresh = await getChapterOrThrow(id);
  return ok({ chapter: fresh ? mappers.mapChapter(fresh) : null, notice });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return bad("Invalid chapter id");

  const chapter = await getChapterOrThrow(id);
  if (!chapter) return bad("Chapter not found", 404);

  await logActivity({
    subjectId: chapter.subjectId,
    kind: "deleted",
    title: chapter.chapterNumber === null ? chapter.title : `Ch ${chapter.chapterNumber} — ${chapter.title}`,
    detail: `Chapter deleted (${chapter.lectureCount} lectures planned)`,
  });
  await db.delete(chapters).where(eq(chapters.id, id));
  return ok({ deleted: true });
}
