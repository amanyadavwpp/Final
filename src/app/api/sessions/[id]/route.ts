import { eq } from "drizzle-orm";
import { db } from "@/db";
import { studySessions } from "@/db/schema";
import { bad, num, ok, optionalText, parseId, readJson } from "@/lib/api";
import { logActivity, mappers } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return bad("Invalid session id");

  const [existing] = await db.select().from(studySessions).where(eq(studySessions.id, id)).limit(1);
  if (!existing) return bad("Session not found", 404);

  const body = await readJson<Record<string, unknown>>(request);
  const patch: Partial<typeof studySessions.$inferInsert> = { updatedAt: new Date() };

  if (body.hours !== undefined) {
    const hours = num(body.hours, existing.hours);
    if (hours <= 0) return bad("Hours must be greater than zero");
    patch.hours = Math.min(24, hours);
  }
  const studiedOn = optionalText(body.studiedOn);
  if (studiedOn) patch.studiedOn = studiedOn;
  const note = optionalText(body.note);
  if (note !== undefined) patch.note = note;
  const kind = optionalText(body.kind);
  if (kind) patch.kind = kind;

  const [row] = await db
    .update(studySessions)
    .set(patch)
    .where(eq(studySessions.id, id))
    .returning();

  await logActivity({
    subjectId: row.subjectId,
    chapterId: row.chapterId,
    kind: "updated",
    title: row.lectureLabel ?? row.chapterTitle ?? row.subjectName,
    detail: "Study log entry updated",
  });

  return ok({ session: mappers.mapSession(row) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return bad("Invalid session id");

  const [existing] = await db.select().from(studySessions).where(eq(studySessions.id, id)).limit(1);
  if (!existing) return bad("Session not found", 404);

  await logActivity({
    subjectId: existing.subjectId,
    chapterId: existing.chapterId,
    kind: "deleted",
    title: existing.lectureLabel ?? existing.chapterTitle ?? existing.subjectName,
    detail: `${existing.hours}h entry removed from the log`,
  });

  await db.delete(studySessions).where(eq(studySessions.id, id));
  return ok({ deleted: true });
}
