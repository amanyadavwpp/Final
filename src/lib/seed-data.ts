import type { ChapterPlanInput } from "./types";

export const DIRECT_TAX_APP_TITLE = "JK Shah Classes — Direct Taxation Lecture Tracker";

type SeedChapter = [
  number | null,
  string,
  number,
  number,
];

// [chapterNumber, title, lectureCount, completedCount]
const SEED: SeedChapter[] = [
  [1, "Introduction to DT", 3, 3],
  [2, "Capital Gains", 13, 5],
  [3, "Profit & Gain From Business Profession", 13, 0],
  [4, "Income from Other Sources", 5, 0],
  [5, "Assessment of HUF", 1, 0],
  [6, "Assessment of Firm", 3, 0],
  [7, "Taxation of AOP - BOI", 1, 0],
  [8, "Clubbing of Income", 3, 0],
  [9, "Section 144, 202 and AMT", 3, 0],
  [10, "Assessment of Co-Op, Society", 2, 0],
  [11, "Concept of Mutual Concern", 1, 0],
  [12, "Business Trust and Other Similar Entities", 2, 0],
  [13, "Tonnage Taxation Scheme", 1, 0],
  [14, "Various Topics of Assessment of Various Entities", 2, 0],
  [15, "Assessment of Companies", 3, 0],
  [16, "Taxation of Trust", 4, 0],
  [17, "Set Off & Carry Forward", 2, 0],
  [18, "Exempt Income", 3, 0],
  [19, "Income Computation & Disclosure Standards (ICDS)", 1, 0],
  [20, "General Anti - Avoidance Rules (GAAR)", 1, 0],
  [21, "Taxability of Life Insurance Policy", 2, 0],
  [22, "Taxability of Virtual Digital Asset (VDA)", 1, 0],
  [23, "Deductions under Chapter VIII (123 to 154)", 6, 0],
  [24, "Tax Deduction & Collection at Source", 7, 0],
  [25, "Assessment Procedure", 4, 0],
  [26, "Appeals", 2, 0],
  [27, "Income-Tax Authority", 3, 0],
  [28, "Advance Tax, Interest and Recovery", 4, 0],
  [29, "Liability in Certain Cases", 1, 0],
  [30, "Dispute Resolution Committee (DRC)", 1, 0],
  [31, "Refunds", 1, 0],
  [32, "Miscellaneous Provisions", 2, 0],
  [33, "Late Fees, Penalties and Offences", 2, 0],
  [
    34,
    "Black Money (Undisclosed Foreign Income & Assets) and Imposition of Tax Act, 2015",
    1,
    0,
  ],
  [35, "Tax Audit and Ethical Compliances", 2, 0],
  [36, "Transfer Pricing", 10, 0],
  [37, "Non Resident", 11, 0],
  [38, "Double Taxation Avoidance Agreement", 2, 0],
  [39, "Advance Rulings", 2, 0],
  [40, "Application & Interpretation of Tax Treaties", 1, 0],
  [41, "Fundamentals of BEPS", 2, 0],
  [42, "Overview of Model Tax Convention", 2, 0],
  [43, "Latest Developments in International Taxation", 2, 0],
  [null, "Live Lectures", 23, 0],
];

export const DIRECT_TAX_SEED: ChapterPlanInput[] = SEED.map(
  ([chapterNumber, title, lectureCount, completedCount]) => ({
    chapterNumber,
    title,
    lectureCount,
    hoursPerLecture: 3,
    completedLectures: Array.from({ length: completedCount }, (_, i) => i + 1),
  }),
);

/** Extra manual study-log entries so the history page feels alive on first load. */
export const SEED_EXTRA_SESSIONS: {
  kind: "revision" | "practice" | "test";
  hours: number;
  daysAgo: number;
  chapterTitle: string;
  note: string;
}[] = [
  {
    kind: "revision",
    hours: 1.5,
    daysAgo: 4,
    chapterTitle: "Capital Gains",
    note: "Revised indexation + 112A workings",
  },
  {
    kind: "practice",
    hours: 2,
    daysAgo: 2,
    chapterTitle: "Introduction to DT",
    note: "MCQs on basic concepts & previous year paper",
  },
  {
    kind: "test",
    hours: 1,
    daysAgo: 1,
    chapterTitle: "Capital Gains",
    note: "Chapter test — scored 62%",
  },
];
