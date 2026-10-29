"use client";

import { useMemo, useState } from "react";
import { useStudy } from "@/components/study-provider";
import { cn, formatHours, prettyDay, shiftDayKey } from "@/lib/format";

const WEEKS = 14;
const LEVELS = [
  "bg-slate-100",
  "bg-emerald-200",
  "bg-emerald-300",
  "bg-emerald-400",
  "bg-emerald-500",
];

function levelFor(hours: number): number {
  if (hours <= 0) return 0;
  if (hours < 1) return 1;
  if (hours < 2.5) return 2;
  if (hours < 4.5) return 3;
  return 4;
}

type Cell = { key: string; hours: number };

/**
 * GitHub-style consistency grid for study hours. Cells are a fixed size so the
 * layout never shifts while data loads, and the whole strip scrolls sideways
 * with momentum on a phone.
 */
export function StudyHeatmap({ weeks = WEEKS }: { weeks?: number }) {
  const { sessions } = useStudy();
  const [selected, setSelected] = useState<Cell | null>(null);

  const { columns, monthLabels, totalHours, activeDays, best } = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const session of sessions) {
      byDay.set(session.studiedOn, (byDay.get(session.studiedOn) ?? 0) + session.hours);
    }

    const today = new Date();
    // End the grid on the current week.
    const end = new Date(today);
    end.setDate(end.getDate() + (6 - end.getDay()));
    const start = new Date(end);
    start.setDate(start.getDate() - (weeks * 7 - 1));

    const cols: Cell[][] = [];
    const labels: { index: number; label: string }[] = [];
    const cursor = new Date(start);
    let lastMonth = -1;

    for (let w = 0; w < weeks; w += 1) {
      const column: Cell[] = [];
      for (let d = 0; d < 7; d += 1) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
        column.push({ key, hours: Math.round((byDay.get(key) ?? 0) * 10) / 10 });
        if (d === 0 && cursor.getMonth() !== lastMonth) {
          lastMonth = cursor.getMonth();
          labels.push({
            index: w,
            label: cursor.toLocaleDateString(undefined, { month: "short" }),
          });
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      cols.push(column);
    }

    const cells = cols.flat();
    let sum = 0;
    let active = 0;
    let bestDay = 0;
    for (const cell of cells) {
      if (cell.hours > 0) {
        sum += cell.hours;
        active += 1;
        bestDay = Math.max(bestDay, cell.hours);
      }
    }

    return {
      columns: cols,
      monthLabels: labels,
      totalHours: Math.round(sum * 10) / 10,
      activeDays: active,
      best: Math.round(bestDay * 10) / 10,
    };
  }, [sessions, weeks]);

  const detail = selected ?? null;

  return (
    <div>
      <div className="nowrap-scroll -mx-1 px-1">
        <div className="inline-flex flex-col gap-1">
          <div className="flex gap-1 pl-6">
            {columns.map((_, index) => {
              const label = monthLabels.find((entry) => entry.index === index);
              return (
                <div key={index} className="w-[15px] shrink-0">
                  {label ? (
                    <span className="block text-[9px] font-semibold text-slate-400">{label.label}</span>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="flex gap-1">
            <div className="flex w-5 shrink-0 flex-col gap-1">
              {["M", "", "W", "", "F", "", "S"].map((day, index) => (
                <span
                  key={index}
                  className="flex h-[15px] items-center text-[9px] font-semibold leading-none text-slate-300"
                >
                  {day}
                </span>
              ))}
            </div>
            {columns.map((column, index) => (
              <div key={index} className="flex shrink-0 flex-col gap-1">
                {column.map((cell) => {
                  const isToday = cell.key === shiftDayKey(0);
                  const level = levelFor(cell.hours);
                  return (
                    <button
                      key={cell.key}
                      onClick={() => setSelected(cell.hours > 0 ? cell : cell)}
                      aria-label={`${cell.key}: ${formatHours(cell.hours)}`}
                      className={cn(
                        "h-[15px] w-[15px] rounded-[4px] transition active:scale-90",
                        LEVELS[level],
                        cell.hours > 0 ? "" : "bg-slate-100",
                        isToday && "ring-2 ring-slate-900/70 ring-offset-1 ring-offset-white",
                        detail?.key === cell.key && "ring-2 ring-slate-900 ring-offset-1 ring-offset-white",
                      )}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="tnum text-[11px] font-medium text-slate-500">
          {detail ? (
            <>
              <span className="font-semibold text-slate-800">{prettyDay(detail.key)}</span> ·{" "}
              {formatHours(detail.hours)}
            </>
          ) : (
            <>
              {activeDays} active days · {formatHours(totalHours)} logged
            </>
          )}
        </p>
        <div className="flex items-center gap-1">
          <span className="text-[9px] font-semibold text-slate-400">less</span>
          {LEVELS.map((level) => (
            <span key={level} className={cn("h-[10px] w-[10px] rounded-[3px]", level)} />
          ))}
          <span className="text-[9px] font-semibold text-slate-400">more</span>
        </div>
      </div>
      {best > 0 ? (
        <p className="mt-1 text-[11px] text-slate-400">Best day: {formatHours(best)}</p>
      ) : null}
    </div>
  );
}
