import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { chapters, lectures } from "@/db/schema";
import { bad, num, ok, readJson } from "@/lib/api";
import { getChapterOrThrow, logActivity, mappers } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Appends one or more lecture slots to a chapter. */
export async function POST(request: Request) {
  const body = await readJson<Record<string, unknown>>(request);
  const chapterId = Math.round(num(body.chapterId, 0));
  if (!chapterId) return bad("chapterId is required");

  const chapter = await getChapterOrThrow(chapterId);
  if (!chapter) return bad("Chapter not found", 404);

  const count = Math.max(1, Math.min(50, Math.round(num(body.count, 1))));
  const [last] = await db
    .select()
    .from(lectures)
    .where(eq(lectures.chapterId, chapterId))
    .orderBy(desc(lectures.lectureNumber))
    .limit(1);

  const start = (last?.lectureNumber ?? 0) + 1;
  const label = typeof body.label === "string" && body.label.trim() ? body.label.trim() : null;
  const hours = Math.max(0, Math.min(24, num(body.hours, chapter.hoursPerLecture)));
  const values = Array.from({ length: count }, (_, i) => ({
    chapterId,
    lectureNumber: start + i,
    hours,
    label,
    status: "pending",
  }));
  const inserted = await db.insert(lectures).values(values).returning();
  await db
    .update(chapters)
    .set({ lectureCount: start + count - 1, updatedAt: new Date() })
    .where(eq(chapters.id, chapterId));

  await logActivity({
    subjectId: chapter.subjectId,
    chapterId,
    kind: "created",
    title: chapter.chapterNumber === null ? chapter.title : `Ch ${chapter.chapterNumber} — ${chapter.title}`,
    detail: `${count} lecture slot${count > 1 ? "s" : ""} added`,
  });

  const fresh = await getChapterOrThrow(chapterId);
  return ok(
    {
      chapter: fresh ? mappers.mapChapter(fresh) : null,
      lectures: inserted.map(mappers.mapLecture),
    },
    { status: 201 },
  );
}
