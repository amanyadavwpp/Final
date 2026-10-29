"use client";

import { useMemo, useState } from "react";
import { useStudy } from "@/components/study-provider";
import { Button, Card, EmptyState, Skeleton } from "@/components/ui";
import { ACTIVITY_META, cn, relativeTime } from "@/lib/format";

const KINDS = ["all", "completed", "created", "updated", "deleted", "imported", "reopened"] as const;

export default function ActivityPage() {
  const { loading, activity } = useStudy();
  const [kind, setKind] = useState<(typeof KINDS)[number]>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return activity.filter((item) => {
      const matchesKind = kind === "all" || item.kind === kind;
      const haystack = `${item.title} ${item.detail ?? ""}`.toLowerCase();
      return matchesKind && (!term || haystack.includes(term));
    });
  }, [activity, kind, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const item of filtered) {
      const day = item.createdAt.slice(0, 10);
      const list = map.get(day) ?? [];
      list.push(item);
      map.set(day, list);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">Activity</h2>
        <p className="text-sm text-slate-500">
          An append-only audit trail: every chapter, lecture and study-log change is recorded here forever.
        </p>
      </div>

      <Card className="p-4">
        <div className="space-y-3">
        <div className="nowrap-scroll -mx-4 flex items-center gap-2 px-4">
          {KINDS.map((option) => (
            <button
              key={option}
              onClick={() => setKind(option)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition",
                kind === option
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-400",
              )}
            >
              {option === "all" ? "Everything" : option}
            </button>
          ))}
        </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search activity…"
            className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none sm:w-56 sm:justify-self-end"
          />
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Showing {filtered.length} of {activity.length} recorded events
        </p>
      </Card>

      {grouped.length ? (
        <div className="space-y-5">
          {grouped.map(([day, items]) => (
            <div key={day}>
              <h3 className="mb-2 px-1 text-sm font-semibold tracking-tight text-slate-900">
                {new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </h3>
              <Card className="divide-y divide-slate-100 overflow-hidden">
                {items.map((item) => {
                  const meta = ACTIVITY_META[item.kind] ?? ACTIVITY_META.updated;
                  return (
                    <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm",
                          meta.className,
                        )}
                      >
                        {meta.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{item.title}</p>
                        <p className="text-xs text-slate-500">{item.detail ?? item.kind}</p>
                      </div>
                      <span className="shrink-0 text-[11px] font-medium text-slate-400">
                        {relativeTime(item.createdAt)}
                      </span>
                    </div>
                  );
                })}
              </Card>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          emoji="⚡"
          title={activity.length ? "No events match" : "No activity yet"}
          description={
            activity.length
              ? "Try a different filter or search term."
              : "Start ticking off lectures and the audit trail will fill up."
          }
          action={
            activity.length ? (
              <Button size="sm" onClick={() => setKind("all")}>
                Reset filters
              </Button>
            ) : undefined
          }
        />
      )}

    </div>
  );
}
