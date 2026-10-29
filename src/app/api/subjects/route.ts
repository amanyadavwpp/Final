import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { chapters, subjects } from "@/db/schema";
import { bad, num, ok, optionalText, readJson } from "@/lib/api";
import { logActivity, mappers, syncLectureRows } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(subjects).orderBy(asc(subjects.id));
  return ok({ subjects: rows.map(mappers.mapSubject) });
}

export async function POST(request: Request) {
  const body = await readJson<Record<string, unknown>>(request);
  const name = optionalText(body.name);
  if (!name) return bad("Subject name is required");

  const color = optionalText(body.color) ?? "indigo";
  const defaultHours = Math.max(0.25, Math.min(24, num(body.defaultHoursPerLecture, 3)));

  const [row] = await db
    .insert(subjects)
    .values({
      name,
      teacher: optionalText(body.teacher) ?? null,
      color,
      defaultHoursPerLecture: defaultHours,
    })
    .returning();

  await logActivity({
    subjectId: row.id,
    kind: "created",
    title: row.name,
    detail: `New subject added${row.teacher ? ` (${row.teacher})` : ""}`,
  });

  // Optional starter chapter so a brand new subject is not empty.
  const starterCount = Math.max(0, Math.min(200, Math.round(num(body.starterChapters, 0))));
  for (let i = 0; i < starterCount; i += 1) {
    const [chapter] = await db
      .insert(chapters)
      .values({
        subjectId: row.id,
        chapterNumber: i + 1,
        title: `Chapter ${i + 1}`,
        lectureCount: 0,
        hoursPerLecture: defaultHours,
        position: i,
      })
      .returning();
    await syncLectureRows(chapter.id, 0, defaultHours);
  }

  const created = await db.select().from(subjects).where(eq(subjects.id, row.id)).limit(1);
  const total = await db.select({ count: sql<number>`count(*)::int` }).from(subjects);
  return ok({ subject: created.length ? mappers.mapSubject(created[0]) : mappers.mapSubject(row), total: total[0]?.count ?? 0 }, { status: 201 });
}
