export type LectureStatus = "pending" | "completed";

export type Subject = {
  id: number;
  name: string;
  teacher: string | null;
  color: string;
  defaultHoursPerLecture: number;
  createdAt: string;
  updatedAt: string;
};

export type Chapter = {
  id: number;
  subjectId: number;
  chapterNumber: number | null;
  title: string;
  lectureCount: number;
  hoursPerLecture: number;
  position: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Lecture = {
  id: number;
  chapterId: number;
  lectureNumber: number;
  status: LectureStatus;
  hours: number;
  label: string | null;
  sourceNumber: number | null;
  partNumber: number | null;
  kind: string;
  completedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

/** A single lecture slot, either plain (counted) or fully described. */
export type LectureDef = {
  label?: string | null;
  sourceNumber?: number | null;
  partNumber?: number | null;
  hours?: number | null;
  duration?: string | null;
  kind?: string | null;
  completed?: boolean;
};

export type SessionKind = "lecture" | "revision" | "practice" | "test";

export type StudySession = {
  id: number;
  subjectId: number | null;
  chapterId: number | null;
  lectureId: number | null;
  subjectName: string;
  chapterTitle: string | null;
  lectureLabel: string | null;
  kind: SessionKind;
  hours: number;
  studiedOn: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ActivityItem = {
  id: number;
  subjectId: number | null;
  chapterId: number | null;
  lectureId: number | null;
  kind: string;
  title: string;
  detail: string | null;
  createdAt: string;
};

export type BootstrapPayload = {
  subjects: Subject[];
  chapters: Chapter[];
  lectures: Lecture[];
  sessions: StudySession[];
  activity: ActivityItem[];
};

export type ChapterPlanInput = {
  chapterNumber: number | null;
  title: string;
  lectureCount: number;
  hoursPerLecture: number;
  completedLectures: number[];
  lectures?: LectureDef[];
  notes?: string | null;
  updatedAt?: string | null;
};

export type ImportPayload = {
  app?: string;
  defaultHours?: number;
  chapters?: ChapterPlanInput[];
};

export type ExportStats = {
  plannedChapters: number;
  completedChapters: number;
  totalLectures: number;
  completedLectures: number;
  plannedHours: number;
  studiedHours: number;
  remainingHours: number;
  progress: number;
};
