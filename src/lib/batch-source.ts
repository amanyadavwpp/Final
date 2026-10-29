import type { ChapterPlanInput, LectureDef } from "./types";

/**
 * Shared parser for the compact batch-plan format:
 *
 *   ## Chapter title [| total runtime]   -> new chapter
 *   ## ~Title                            -> new chapter without a number
 *   #! free-form note text               -> note attached to the current chapter
 *   @@ Milestone text                    -> tickable milestone item
 *   L12P3 (suffix) 1:24                  -> Lecture 12, Part 3, 1h24m
 *   D12P3a (suffix) 1:24:09              -> Day 12, Part 3a, 1h24m09s
 *   Anything else                        -> item with no known runtime
 */

const TIME_TAIL = /(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/;
const NUMBERED = /^([LD])(\d+)P(\d+)([a-z]?)\s*(?:\(([^)]*)\))?\s*/i;

/** "1:24" -> 1.4, "1:24:09" -> 1.4. */
export function durationToHours(value: string | null | undefined): number | null {
  if (!value) return null;
  const parts = value.trim().split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 3) {
    return Math.round(((parts[0] * 3600 + parts[1] * 60 + parts[2]) / 3600) * 100) / 100;
  }
  if (parts.length === 2) {
    return Math.round(((parts[0] * 60 + parts[1]) / 60) * 100) / 100;
  }
  return null;
}

export function parseBatchSource(source: string): ChapterPlanInput[] {
  const plans: ChapterPlanInput[] = [];
  const chapterNotes: string[][] = [];
  let counter = 0;

  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("##")) {
      const body = line.replace(/^#+\s*/, "");
      const unnumbered = body.startsWith("~");
      const [title, total] = (unnumbered ? body.slice(1) : body)
        .split("|")
        .map((part) => part.trim());
      if (!unnumbered) counter += 1;
      plans.push({
        chapterNumber: unnumbered ? null : counter,
        title,
        lectureCount: 0,
        hoursPerLecture: 0,
        completedLectures: [],
        lectures: [],
        notes: total ? `Batch total runtime ${total}` : null,
      });
      chapterNotes.push([]);
      continue;
    }

    const chapter = plans[plans.length - 1];
    if (!chapter) continue;

    if (line.startsWith("#!")) {
      chapterNotes[chapterNotes.length - 1].push(line.replace(/^#!\s*/, "").trim());
      continue;
    }

    if (line.startsWith("@@")) {
      chapter.lectures?.push({
        label: `Milestone — ${line.replace(/^@@\s*/, "").trim()}`,
        hours: 0,
        kind: "milestone",
      });
      continue;
    }

    let rest = line;
    let hours: number | null = 0;
    const timeMatch = rest.match(TIME_TAIL);
    if (timeMatch) {
      hours = durationToHours(
        [timeMatch[1], timeMatch[2], timeMatch[3]].filter(Boolean).join(":"),
      );
      rest = rest.slice(0, timeMatch.index).trim();
    }

    const numbered = rest.match(NUMBERED);
    if (numbered) {
      const noun = numbered[1].toUpperCase() === "D" ? "Day" : "Lecture";
      const partLabel = `${numbered[3]}${numbered[4] ?? ""}`;
      const suffix = numbered[5] ? numbered[5].trim() : "";
      chapter.lectures?.push({
        label: suffix
          ? `${noun} ${numbered[2]}, Part ${partLabel} — ${suffix}`
          : `${noun} ${numbered[2]}, Part ${partLabel}`,
        sourceNumber: Number(numbered[2]),
        partNumber: Number(numbered[3]),
        hours,
      });
      continue;
    }

    chapter.lectures?.push({ label: rest, hours });
  }

  plans.forEach((chapter, index) => {
    const defs: LectureDef[] = chapter.lectures ?? [];
    chapter.lectureCount = defs.length;
    const timed = defs.filter((def) => (def.hours ?? 0) > 0);
    chapter.hoursPerLecture = timed.length
      ? Math.round((timed.reduce((sum, def) => sum + (def.hours ?? 0), 0) / timed.length) * 100) / 100
      : 0;

    const notes = chapterNotes[index] ?? [];
    if (notes.length) {
      chapter.notes = chapter.notes ? `${chapter.notes}\n${notes.join("\n")}` : notes.join("\n");
    }
  });

  return plans;
}
