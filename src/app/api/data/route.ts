import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { chapters, subjects } from "@/db/schema";
import { bad, num, ok, optionalText, readJson } from "@/lib/api";
import { parseImportPayload } from "@/lib/import-parse";
import {
  applyChapterCompletions,
  buildExport,
  createChapterAuto,
  dayKey,
  ensureSeeded,
  getSubjectOrThrow,
  logActivity,
  normalisePlan,
  resetToSeed,
  syncLectureRows,
} from "@/lib/store";
import type { ChapterPlanInput } from "@/lib/types";

export const dynamic = "force-dynamic";

function dayKeyFromIso(value: string | null | undefined): string {
  if (!value) return dayKey();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return dayKey();
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function GET(request: Request) {
  await ensureSeeded();
  const url = new URL(request.url);
  const requested = url.searchParams.get("subjectId");
  let subjectId = requested ? Number(requested) : NaN;

  if (!Number.isInteger(subjectId) || subjectId <= 0) {
    const [first] = await db.select().from(subjects).orderBy(asc(subjects.id)).limit(1);
    if (!first) return bad("No subjects available", 404);
    subjectId = first.id;
  }

  const payload = await buildExport(subjectId);
  if (!payload) return bad("Subject not found", 404);
  return ok(payload);
}

export async function POST(request: Request) {
  const body = await readJson<Record<string, unknown>>(request);
  const action = optionalText(body.action) ?? "import";

  if (action === "reset") {
    await resetToSeed();
    return ok({ reset: true });
  }

  if (action !== "import") return bad(`Unknown action "${action}"`);

  const parsed = parseImportPayload(body.payload);
  if (!parsed.plans.length) {
    return bad("No chapters found in the pasted JSON. Expected a { chapters: [...] } payload.");
  }

  const mode = optionalText(body.mode) ?? "new";
  const defaultHours = Math.max(0.25, Math.min(24, num(body.defaultHours, parsed.defaultHours)));

  let subjectId = body.subjectId ? Math.round(num(body.subjectId, 0)) : 0;
  let subjectName = optionalText(body.subjectName) ?? "";
  let teacher = optionalText(body.teacher) ?? "";

  if (mode === "new" || !subjectId) {
    if (!subjectName) {
      const [first, ...rest] = parsed.appName.split(/[—–-]{1}/).map((part: string) => part.trim());
      subjectName = rest.length ? rest[rest.length - 1] : parsed.appName;
      if (!teacher && rest.length) teacher = first;
    }
    const [subject] = await db
      .insert(subjects)
      .values({
        name: subjectName || "Imported subject",
        teacher: teacher || null,
        color: "indigo",
        defaultHoursPerLecture: defaultHours,
      })
      .returning();
    subjectId = subject.id;
    for (let i = 0; i < parsed.plans.length; i += 1) {
      const plan: ChapterPlanInput = parsed.plans[i];
      await createChapterAuto(subjectId, plan, i, dayKeyFromIso(plan.updatedAt));
    }
    await logActivity({
      subjectId,
      kind: "imported",
      title: subject.name,
      detail: `${parsed.plans.length} chapters imported as a new subject`,
    });
    return ok({ subjectId, created: parsed.plans.length, mode: "new" });
  }

  const subject = await getSubjectOrThrow(subjectId);
  if (!subject) return bad("Subject not found", 404);

  if (mode === "replace") {
    await db.delete(chapters).where(eq(chapters.subjectId, subjectId));
    for (let i = 0; i < parsed.plans.length; i += 1) {
      await createChapterAuto(subjectId, parsed.plans[i], i, dayKeyFromIso(parsed.plans[i].updatedAt));
    }
    await logActivity({
      subjectId,
      kind: "imported",
      title: subject.name,
      detail: `Replaced plan with ${parsed.plans.length} imported chapters`,
    });
    return ok({ subjectId, created: parsed.plans.length, mode: "replace" });
  }

  // merge: upsert chapters by number/title
  const existing = await db
    .select()
    .from(chapters)
    .where(eq(chapters.subjectId, subjectId))
    .orderBy(asc(chapters.position));

  let created = 0;
  let updated = 0;
  let nextPosition = existing.reduce((max, row) => Math.max(max, row.position), -1) + 1;

  for (const raw of parsed.plans as ChapterPlanInput[]) {
    const plan = normalisePlan(raw);
    const match =
      existing.find(
        (row) =>
          (plan.chapterNumber !== null && row.chapterNumber === plan.chapterNumber) ||
          row.title.toLowerCase() === plan.title.toLowerCase(),
      ) ?? null;

    if (!match) {
      await createChapterAuto(subjectId, plan, nextPosition, dayKeyFromIso(plan.updatedAt));
      nextPosition += 1;
      created += 1;
      continue;
    }

    const completed = await db.select().from(chapters).where(eq(chapters.id, match.id)).limit(1);
    if (!completed.length) continue;
    await db
      .update(chapters)
      .set({
        title: plan.title,
        chapterNumber: plan.chapterNumber,
        lectureCount: plan.lectureCount,
        hoursPerLecture: plan.hoursPerLecture,
        updatedAt: new Date(),
      })
      .where(eq(chapters.id, match.id));
    await syncLectureRows(match.id, plan.lectureCount, plan.hoursPerLecture);
    await applyChapterCompletions(match.id, plan.completedLectures, dayKeyFromIso(plan.updatedAt), {
      log: false,
    });
    updated += 1;
  }

  await logActivity({
    subjectId,
    kind: "imported",
    title: subject.name,
    detail: `Merged import — ${created} new chapters, ${updated} updated`,
  });

  return ok({ subjectId, created, updated, mode: "merge" });
}
