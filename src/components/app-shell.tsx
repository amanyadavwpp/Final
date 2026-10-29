"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { FocusTimerChip, FocusTimerProvider } from "@/components/focus-timer";
import {
  CommandPalette,
  CommandPaletteRoot,
  ServiceWorkerRegistrar,
} from "@/components/command-palette";
import { useStudy } from "@/components/study-provider";
import { Button, Field, Input, Modal, Select, Textarea } from "@/components/ui";
import { cn, dayKeyOf, formatHours, statsForChapters } from "@/lib/format";
import { useSettings } from "@/lib/use-settings";

const NAV = [
  { href: "/", label: "Today", short: "Today", icon: "📊", exact: true },
  { href: "/subjects", label: "Subjects & chapters", short: "Subjects", icon: "📚" },
  { href: "/tests", label: "Tests & milestones", short: "Tests", icon: "🎯" },
  { href: "/history", label: "Study log", short: "Log", icon: "🕘" },
];

const MORE_LINKS = [
  { href: "/activity", label: "Activity trail", short: "Activity", icon: "⚡", hint: "Every change, forever" },
  { href: "/data", label: "Import & export", short: "Data", icon: "🔄", hint: "Backups and JSON" },
];

/* -------------------------------------------------------------------------- */
/* Desktop sidebar                                                            */
/* -------------------------------------------------------------------------- */

function SidebarProgress() {
  const { chapters, lectures, sessions, subjects } = useStudy();
  const stats = statsForChapters(chapters, lectures);
  const logged = sessions.reduce((sum, session) => sum + session.hours, 0);

  return (
    <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 p-4 text-white">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
        Overall progress
      </p>
      <p className="tnum mt-1 text-2xl font-semibold tracking-tight">{stats.percent}%</p>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/20">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-300 to-sky-300 transition-[width] duration-500"
          style={{ width: `${stats.percent}%` }}
        />
      </div>
      <dl className="tnum mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <dt className="text-white/50">Sessions</dt>
          <dd className="font-semibold">
            {stats.completed}/{stats.total}
          </dd>
        </div>
        <div>
          <dt className="text-white/50">Hours left</dt>
          <dd className="font-semibold">{formatHours(stats.remainingHours)}</dd>
        </div>
        <div>
          <dt className="text-white/50">Subjects</dt>
          <dd className="font-semibold">{subjects.length}</dd>
        </div>
        <div>
          <dt className="text-white/50">Logged</dt>
          <dd className="font-semibold">{formatHours(logged)}</dd>
        </div>
      </dl>
    </div>
  );
}

function DesktopNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {[...NAV, ...MORE_LINKS].map((item) => {
        const active = "exact" in item && item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
              active
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            <span
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-lg text-sm",
                active ? "bg-white/15" : "bg-slate-100 group-hover:bg-white",
              )}
            >
              {item.icon}
            </span>
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/* -------------------------------------------------------------------------- */
/* Mobile "More" sheet (settings lives here)                                  */
/* -------------------------------------------------------------------------- */

function QuickLogModal({ onClose }: { onClose: () => void }) {
  const { subjects, chapters, createSession } = useStudy();
  const [studiedOn, setStudiedOn] = useState(dayKeyOf());
  const [hours, setHours] = useState("1.5");
  const [kind, setKind] = useState("revision");
  const [subjectId, setSubjectId] = useState<string>(() => (subjects[0] ? String(subjects[0].id) : ""));
  const [chapterId, setChapterId] = useState<string>("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const options = chapters.filter((chapter) => String(chapter.subjectId) === subjectId);

  return (
    <Modal
      open
      onClose={onClose}
      title="Log study time"
      description="Revision, practice or a test — it all lands in your history."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={saving}
            onClick={async () => {
              const value = Number(hours);
              if (!value || value <= 0) return;
              setSaving(true);
              const done = await createSession({
                subjectId: subjectId ? Number(subjectId) : null,
                chapterId: chapterId ? Number(chapterId) : null,
                kind,
                hours: value,
                studiedOn,
                note: note.trim() || null,
              });
              setSaving(false);
              if (done) onClose();
            }}
          >
            Save entry
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date">
          <Input type="date" value={studiedOn} onChange={(event) => setStudiedOn(event.target.value)} />
        </Field>
        <Field label="Hours" hint="e.g. 1.5">
          <Input
            type="number"
            min="0.25"
            step="0.25"
            value={hours}
            onChange={(event) => setHours(event.target.value)}
          />
        </Field>
        <Field label="Type">
          <Select value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="revision">Revision</option>
            <option value="practice">Practice</option>
            <option value="test">Test</option>
            <option value="lecture">Lecture</option>
          </Select>
        </Field>
        <Field label="Subject">
          <Select
            value={subjectId}
            onChange={(event) => {
              setSubjectId(event.target.value);
              setChapterId("");
            }}
          >
            <option value="">General study</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Chapter" hint="optional" className="sm:col-span-2">
          <Select value={chapterId} onChange={(event) => setChapterId(event.target.value)}>
            <option value="">No specific chapter</option>
            {options.map((chapter) => (
              <option key={chapter.id} value={chapter.id}>
                {chapter.chapterNumber === null
                  ? chapter.title
                  : `Ch ${chapter.chapterNumber} · ${chapter.title}`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notes" hint="optional" className="sm:col-span-2">
          <Textarea
            value={note}
            placeholder="What did you cover?"
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

function MoreSheet({
  open,
  onClose,
  onLog,
}: {
  open: boolean;
  onClose: () => void;
  onLog: () => void;
}) {
  const { settings, update } = useSettings();
  const { refreshing } = useStudy();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="More"
      description="Preferences live on this device; study history stays in your database."
    >
      <div className="space-y-5">
        <button
          onClick={() => {
            onClose();
            onLog();
          }}
          className="flex w-full items-center gap-3 rounded-xl border border-slate-900 bg-slate-900 px-3 py-3 text-left text-white active:scale-[0.99]"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-sm">
            ＋
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Log study time</span>
            <span className="block text-xs text-white/60">Add revision, practice or a test</span>
          </span>
        </button>

        <div className="grid gap-2">
          {MORE_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 active:scale-[0.99]"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-sm">
                {item.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900">{item.label}</span>
                <span className="block text-xs text-slate-500">{item.hint}</span>
              </span>
              <span className="text-slate-300">›</span>
            </Link>
          ))}
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Study preferences
          </p>
          <Field label="Daily target" hint="hours per day">
            <Select
              value={String(settings.dailyTargetHours)}
              onChange={(event) => update({ dailyTargetHours: Number(event.target.value) })}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12].map((value) => (
                <option key={value} value={value}>
                  {value}h per day
                </option>
              ))}
            </Select>
          </Field>
          <Field label="First exam paper" hint="for the countdown">
            <Input
              type="date"
              value={settings.examDate ?? ""}
              onChange={(event) => update({ examDate: event.target.value || null })}
            />
          </Field>
          <p className="text-[11px] leading-relaxed text-slate-400">
            {refreshing ? "Syncing…" : "Everything is saved automatically."}
          </p>
        </div>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Mobile bottom tab bar                                                      */
/* -------------------------------------------------------------------------- */

function BottomTabs({ onMore }: { onMore: () => void }) {
  const pathname = usePathname();
  const { sessions } = useStudy();

  return (
    <nav className="fixed-safe-bottom inset-x-0 z-30 border-t border-slate-200 bg-white/92 backdrop-blur-xl lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5 px-1 pt-1.5">
        {NAV.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 transition active:scale-95"
            >
              <span
                className={cn(
                  "flex h-7 w-9 items-center justify-center rounded-lg text-base transition",
                  active ? "bg-slate-900 text-white" : "text-slate-400",
                )}
              >
                {item.icon}
              </span>
              <span
                className={cn(
                  "text-[10px] font-semibold leading-none",
                  active ? "text-slate-900" : "text-slate-400",
                )}
              >
                {item.short}
              </span>
            </Link>
          );
        })}
        <button
          onClick={onMore}
          className="flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 transition active:scale-95"
        >
          <span
            className={cn(
              "flex h-7 w-9 items-center justify-center rounded-lg text-base",
              sessions.length ? "text-slate-400" : "text-slate-400",
            )}
          >
            ⋯
          </span>
          <span className="text-[10px] font-semibold leading-none text-slate-400">More</span>
        </button>
      </div>
    </nav>
  );
}

/** Lets the header button open the same palette the ⌘K shortcut uses. */
function PaletteBridge({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <CommandPalette open onClose={onClose} />;
}

/* -------------------------------------------------------------------------- */
/* Shell                                                                      */
/* -------------------------------------------------------------------------- */

export function AppShell({ children }: { children: ReactNode }) {
  const { refresh, refreshing, error, chapters, lectures } = useStudy();
  const [moreOpen, setMoreOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const pathname = usePathname();
  const stats = statsForChapters(chapters, lectures);
  const current = [...NAV, ...MORE_LINKS].find((item) =>
    "exact" in item && item.exact ? pathname === item.href : pathname.startsWith(item.href),
  );

  return (
    <FocusTimerProvider>
      <div className="min-h-dvh bg-slate-50">
        {/* Desktop sidebar */}
        <aside className="safe-top fixed inset-y-0 left-0 z-30 hidden w-72 flex-col justify-between border-r border-slate-200 bg-white px-4 pb-5 lg:flex">
          <div>
            <Link href="/" className="mb-6 flex items-center gap-3 px-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-500 text-lg text-white shadow-sm">
                ⚖️
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold tracking-tight text-slate-900">
                  Lecture Tracker
                </span>
                <span className="block truncate text-[11px] font-medium text-slate-400">
                  CA Final · 3 subjects
                </span>
              </span>
            </Link>
            <DesktopNav />
          </div>
          <div className="space-y-3">
            <SidebarProgress />
            <p className="px-2 text-[11px] leading-relaxed text-slate-400">
              Stored in PostgreSQL — progress, history and activity survive every refresh.
            </p>
          </div>
        </aside>

        <div className="lg:pl-72">
          {/* Sticky header, clear of the Dynamic Island */}
          <header className="fixed-safe-top safe-x sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur-xl">
            <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 lg:px-8">
              <Link href="/" className="flex items-center gap-2 lg:hidden">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 text-sm text-white">
                  ⚖️
                </span>
              </Link>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-[15px] font-semibold leading-tight tracking-tight text-slate-900">
                  {current?.short ?? current?.label ?? "Lecture Tracker"}
                </h1>
                <p className="tnum truncate text-[11px] leading-tight text-slate-400">
                  {error
                    ? "Offline — showing saved data"
                    : `${stats.completed}/${stats.total} sessions · ${formatHours(stats.remainingHours)} left`}
                </p>
              </div>
              <button
                onClick={() => setPaletteOpen(true)}
                aria-label="Search (Command K)"
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition active:scale-90"
              >
                <span className="text-base">⌕</span>
              </button>
              <button
                onClick={() => void refresh()}
                aria-label="Refresh"
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition active:scale-90"
              >
                <span className={cn("inline-block text-base", refreshing && "animate-spin")}>↻</span>
              </button>
              <FocusTimerChip />
            </div>
          </header>

          <main className="safe-x tabbar-offset mx-auto w-full max-w-6xl pt-4 lg:px-8 lg:pt-6">
            {children}
          </main>
        </div>

        <CommandPaletteRoot />
        <ServiceWorkerRegistrar />
        <PaletteBridge open={paletteOpen} onClose={() => setPaletteOpen(false)} />
        <BottomTabs onMore={() => setMoreOpen(true)} />
        <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} onLog={() => setLogOpen(true)} />
        {logOpen ? <QuickLogModal onClose={() => setLogOpen(false)} /> : null}
      </div>
    </FocusTimerProvider>
  );
}
