import { eq } from "drizzle-orm";
import { db } from "@/db";
import { subjects } from "@/db/schema";
import { bad, num, ok, optionalText, parseId, readJson } from "@/lib/api";
import { logActivity, mappers } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return bad("Invalid subject id");

  const body = await readJson<Record<string, unknown>>(request);
  const [existing] = await db.select().from(subjects).where(eq(subjects.id, id)).limit(1);
  if (!existing) return bad("Subject not found", 404);

  const patch: Partial<typeof subjects.$inferInsert> = { updatedAt: new Date() };
  const name = optionalText(body.name);
  if (name !== undefined) {
    if (!name) return bad("Subject name cannot be empty");
    patch.name = name;
  }
  const teacher = optionalText(body.teacher);
  if (teacher !== undefined) patch.teacher = teacher;
  const color = optionalText(body.color);
  if (color) patch.color = color;
  if (body.defaultHoursPerLecture !== undefined) {
    patch.defaultHoursPerLecture = Math.max(
      0.25,
      Math.min(24, num(body.defaultHoursPerLecture, existing.defaultHoursPerLecture)),
    );
  }

  const [row] = await db.update(subjects).set(patch).where(eq(subjects.id, id)).returning();
  await logActivity({
    subjectId: id,
    kind: "updated",
    title: row.name,
    detail: "Subject details updated",
  });
  return ok({ subject: mappers.mapSubject(row) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return bad("Invalid subject id");

  const [existing] = await db.select().from(subjects).where(eq(subjects.id, id)).limit(1);
  if (!existing) return bad("Subject not found", 404);

  await logActivity({
    kind: "deleted",
    title: existing.name,
    detail: "Subject and all its chapters removed",
  });
  await db.delete(subjects).where(eq(subjects.id, id));
  return ok({ deleted: true });
}
