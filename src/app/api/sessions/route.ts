import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { studySessions } from "@/db/schema";
import { bad, num, ok, optionalText, readJson } from "@/lib/api";
import {
  dayKey,
  getChapterOrThrow,
  getSubjectOrThrow,
  logActivity,
  mappers,
} from "@/lib/store";

export const dynamic = "force-dynamic";

const KINDS = ["lecture", "revision", "practice", "test"] as const;

export async function GET() {
  const rows = await db
    .select()
    .from(studySessions)
    .orderBy(desc(studySessions.studiedOn), desc(studySessions.id))
    .limit(400);
  return ok({ sessions: rows.map(mappers.mapSession) });
}

export async function POST(request: Request) {
  const body = await readJson<Record<string, unknown>>(request);
  const hours = num(body.hours, 0);
  if (!hours || hours <= 0) return bad("Hours must be greater than zero");

  const kindRaw = optionalText(body.kind) ?? "revision";
  const kind = (KINDS as readonly string[]).includes(kindRaw) ? kindRaw : "revision";

  const subjectId = body.subjectId ? Math.round(num(body.subjectId, 0)) : null;
  const chapterId = body.chapterId ? Math.round(num(body.chapterId, 0)) : null;

  let subjectName = optionalText(body.subjectName) ?? "General study";
  let chapterTitle: string | null = optionalText(body.chapterTitle) ?? null;

  if (chapterId) {
    const chapter = await getChapterOrThrow(chapterId);
    if (chapter) {
      chapterTitle = chapter.title;
      const subject = await getSubjectOrThrow(chapter.subjectId);
      subjectName = subject?.name ?? subjectName;
    }
  } else if (subjectId) {
    const subject = await getSubjectOrThrow(subjectId);
    if (subject) subjectName = subject.name;
  }

  const studiedOn = optionalText(body.studiedOn) ?? dayKey();

  const [row] = await db
    .insert(studySessions)
    .values({
      subjectId,
      chapterId,
      lectureId: null,
      subjectName,
      chapterTitle,
      lectureLabel: null,
      kind,
      hours,
      studiedOn,
      note: optionalText(body.note) ?? null,
    })
    .returning();

  await logActivity({
    subjectId,
    chapterId,
    kind: "created",
    title: chapterTitle ? `${chapterTitle} — ${kind}` : `${subjectName} — ${kind}`,
    detail: `${hours}h logged for ${studiedOn}`,
  });

  return ok({ session: mappers.mapSession(row) }, { status: 201 });
}
