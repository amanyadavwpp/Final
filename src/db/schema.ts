import {
  doublePrecision,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** A course / paper being tracked, e.g. "Direct Tax". */
export const subjects = pgTable("subjects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  teacher: text("teacher"),
  color: text("color").notNull().default("indigo"),
  defaultHoursPerLecture: doublePrecision("default_hours_per_lecture")
    .notNull()
    .default(3),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** A chapter inside a subject. `chapterNumber` is null for buckets like "Live Lectures". */
export const chapters = pgTable(
  "chapters",
  {
    id: serial("id").primaryKey(),
    subjectId: integer("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    chapterNumber: integer("chapter_number"),
    title: text("title").notNull(),
    lectureCount: integer("lecture_count").notNull().default(0),
    hoursPerLecture: doublePrecision("hours_per_lecture").notNull().default(3),
    position: integer("position").notNull().default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("chapters_subject_idx").on(table.subjectId, table.position)],
);

/** One lecture slot inside a chapter. Rows are created to match `chapterCount`. */
export const lectures = pgTable(
  "lectures",
  {
    id: serial("id").primaryKey(),
    chapterId: integer("chapter_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "cascade" }),
    lectureNumber: integer("lecture_number").notNull(),
    status: text("status").notNull().default("pending"), // pending | completed
    hours: doublePrecision("hours").notNull().default(3),
    // Optional detail for batches that split lectures into parts with exact runtimes.
    label: text("label"),
    sourceNumber: integer("source_number"),
    partNumber: integer("part_number"),
    kind: text("kind").notNull().default("lecture"), // lecture | milestone
    completedAt: timestamp("completed_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("lectures_chapter_number_key").on(
      table.chapterId,
      table.lectureNumber,
    ),
  ],
);

/** Study log — every completed lecture plus manual revision / practice entries. */
export const studySessions = pgTable(
  "study_sessions",
  {
    id: serial("id").primaryKey(),
    subjectId: integer("subject_id").references(() => subjects.id, {
      onDelete: "set null",
    }),
    chapterId: integer("chapter_id").references(() => chapters.id, {
      onDelete: "set null",
    }),
    lectureId: integer("lecture_id").references(() => lectures.id, {
      onDelete: "set null",
    }),
    subjectName: text("subject_name").notNull(),
    chapterTitle: text("chapter_title"),
    lectureLabel: text("lecture_label"),
    kind: text("kind").notNull().default("lecture"), // lecture | revision | practice | test
    hours: doublePrecision("hours").notNull().default(0),
    studiedOn: text("studied_on").notNull(), // YYYY-MM-DD
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("study_sessions_day_idx").on(table.studiedOn)],
);

/** Append-only audit trail so nothing is ever lost silently. */
export const activityLog = pgTable(
  "activity_log",
  {
    id: serial("id").primaryKey(),
    subjectId: integer("subject_id").references(() => subjects.id, {
      onDelete: "set null",
    }),
    chapterId: integer("chapter_id").references(() => chapters.id, {
      onDelete: "set null",
    }),
    lectureId: integer("lecture_id").references(() => lectures.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull(), // created | updated | deleted | completed | reopened | imported | ...
    title: text("title").notNull(),
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("activity_created_idx").on(table.createdAt)],
);
