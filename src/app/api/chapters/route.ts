import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { chapters } from "@/db/schema";
import { bad, num, ok, optionalText, readJson } from "@/lib/api";
import {
  createChapterFromPlan,
  dayKey,
  getSubjectOrThrow,
  mappers,
  normalisePlan,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readJson<Record<string, unknown>>(request);
  const subjectId = Math.round(num(body.subjectId, 0));
  if (!subjectId) return bad("subjectId is required");

  const subject = await getSubjectOrThrow(subjectId);
  if (!subject) return bad("Subject not found", 404);

  const title = optionalText(body.title);
  if (!title) return bad("Chapter title is required");

  const plan = normalisePlan({
    chapterNumber:
      body.chapterNumber === undefined || body.chapterNumber === null || body.chapterNumber === ""
        ? null
        : Number(body.chapterNumber),
    title,
    lectureCount: Math.round(num(body.lectureCount, 0)),
    hoursPerLecture: num(body.hoursPerLecture, subject.defaultHoursPerLecture),
    completedLectures: [],
  });

  const [last] = await db
    .select()
    .from(chapters)
    .where(eq(chapters.subjectId, subjectId))
    .orderBy(desc(chapters.position))
    .limit(1);

  const chapterId = await createChapterFromPlan(
    subjectId,
    plan,
    (last?.position ?? -1) + 1,
    dayKey(),
  );

  const [row] = await db.select().from(chapters).where(eq(chapters.id, chapterId)).limit(1);
  return ok({ chapter: mappers.mapChapter(row) }, { status: 201 });
}
