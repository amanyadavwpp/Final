"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStudy } from "@/components/study-provider";
import { useFocusTimer } from "@/components/focus-timer";
import { cn, dayKeyOf } from "@/lib/format";

type Item = {
  id: string;
  label: string;
  hint?: string;
  icon: string;
  group: "Jump to" | "Subjects" | "Chapters" | "Actions";
  run: () => void;
};

/**
 * ⌘K / Ctrl-K command palette. Jump to any subject or chapter, start a focus
 * session, or log study time without touching the mouse.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { subjects, chapters, lectures, createSession, toggleLecture } = useStudy();
  const { setOpen: setFocusOpen } = useFocusTimer();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, [open]);

  const go = (href: string) => {
    router.push(href);
    onClose();
  };

  const items = useMemo<Item[]>(() => {
    const list: Item[] = [
      { id: "nav-today", label: "Today", icon: "📊", group: "Jump to", run: () => go("/") },
      { id: "nav-subjects", label: "Subjects & chapters", icon: "📚", group: "Jump to", run: () => go("/subjects") },
      { id: "nav-tests", label: "Tests & milestones", icon: "🎯", group: "Jump to", run: () => go("/tests") },
      { id: "nav-log", label: "Study log", icon: "🕘", group: "Jump to", run: () => go("/history") },
      { id: "nav-activity", label: "Activity trail", icon: "⚡", group: "Jump to", run: () => go("/activity") },
      { id: "nav-data", label: "Import & export", icon: "🔄", group: "Jump to", run: () => go("/data") },
    ];

    for (const subject of subjects) {
      list.push({
        id: `subject-${subject.id}`,
        label: subject.name,
        hint: subject.teacher ?? undefined,
        icon: "📘",
        group: "Subjects",
        run: () => go(`/subject?id=${subject.id}`),
      });
    }

    for (const chapter of chapters) {
      const subject = subjects.find((row) => row.id === chapter.subjectId);
      const rows = lectures.filter((lecture) => lecture.chapterId === chapter.id);
      const done = rows.filter((lecture) => lecture.status === "completed").length;
      list.push({
        id: `chapter-${chapter.id}`,
        label: chapter.chapterNumber === null ? chapter.title : `Ch ${chapter.chapterNumber} · ${chapter.title}`,
        hint: `${subject?.name ?? ""} · ${done}/${rows.length}`,
        icon: "🎬",
        group: "Chapters",
        run: () => go(`/chapter?id=${chapter.id}`),
      });
    }

    list.push({
      id: "action-focus",
      label: "Start a focus session",
      hint: "Run a live timer",
      icon: "⏱️",
      group: "Actions",
      run: () => {
        setFocusOpen(true);
        onClose();
      },
    });

    list.push({
      id: "action-log",
      label: "Log 1h of revision today",
      hint: "Quick entry",
      icon: "＋",
      group: "Actions",
      run: () => {
        void createSession({
          subjectId: subjects[0]?.id ?? null,
          chapterId: null,
          kind: "revision",
          hours: 1,
          studiedOn: dayKeyOf(),
          note: "Quick entry via ⌘K",
        });
        onClose();
      },
    });

    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjects, chapters, lectures, setFocusOpen, createSession]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items.slice(0, 12);
    return items
      .filter((item) => `${item.label} ${item.hint ?? ""}`.toLowerCase().includes(term))
      .slice(0, 20);
  }, [items, query]);

  useEffect(() => {
    setCursor(0);
  }, [query, open]);

  if (!open) return null;

  const grouped = filtered.reduce<Record<string, Item[]>>((acc, item) => {
    acc[item.group] = acc[item.group] ?? [];
    acc[item.group].push(item);
    return acc;
  }, {});
  const flat = Object.values(grouped).flat();

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((prev) => (prev + 1) % Math.max(1, flat.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((prev) => (prev - 1 + flat.length) % Math.max(1, flat.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      flat[cursor]?.run();
    } else if (event.key === "Escape") {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[max(3rem,var(--safe-top))]">
      <div className="absolute inset-0 bg-slate-900/45 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="animate-pop relative z-10 w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-4">
          <span className="text-sm text-slate-400">⌘</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search chapters, subjects, actions…"
            className="h-13 w-full bg-transparent py-3.5 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="hidden shrink-0 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 sm:block">
            ESC
          </kbd>
        </div>

        <div className="ios-scroll max-h-[55vh] overflow-y-auto overscroll-contain py-2">
          {flat.length ? (
            Object.entries(grouped).map(([group, groupItems]) => (
              <div key={group} className="mb-1">
                <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {group}
                </p>
                {groupItems.map((item) => {
                  const index = flat.indexOf(item);
                  const active = index === cursor;
                  return (
                    <button
                      key={item.id}
                      onMouseEnter={() => setCursor(index)}
                      onClick={item.run}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-2.5 text-left transition",
                        active ? "bg-slate-900 text-white" : "text-slate-700",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs",
                          active ? "bg-white/15" : "bg-slate-100",
                        )}
                      >
                        {item.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{item.label}</span>
                        {item.hint ? (
                          <span
                            className={cn(
                              "block truncate text-[11px]",
                              active ? "text-white/60" : "text-slate-400",
                            )}
                          >
                            {item.hint}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          ) : (
            <p className="px-4 py-8 text-center text-sm text-slate-400">
              Nothing matches “{query}”
            </p>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-4 py-2">
          <span className="text-[10px] font-medium text-slate-400">
            ↑↓ navigate · ⏎ open · esc close
          </span>
          <Link href="/data" onClick={onClose} className="text-[10px] font-semibold text-slate-500">
            Export data →
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Registers the global ⌘K shortcut and mounts the palette. */
export function CommandPaletteRoot() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return <CommandPalette open={open} onClose={() => setOpen(false)} />;
}

/** Registers the offline service worker (static builds only). */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") return;

    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const path = `${base ? `/${base.replace(/^\/+|\/+$/g, "")}` : ""}/sw.js`;
    const timer = window.setTimeout(() => {
      void navigator.serviceWorker.register(path).catch(() => {
        /* offline support is a bonus — never block the app */
      });
    }, 1200);

    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
