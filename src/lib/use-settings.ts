"use client";

import { useCallback, useState } from "react";

export type Settings = {
  /** Hours you aim to study per day. Drives the Today ring and pace maths. */
  dailyTargetHours: number;
  /** ISO date (YYYY-MM-DD) of the first exam paper. Drives the countdown. */
  examDate: string | null;
};

const KEY = "ca-final-tracker-settings";

export const DEFAULT_SETTINGS: Settings = {
  dailyTargetHours: 4,
  examDate: null,
};

function read(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const target = Number(parsed.dailyTargetHours);
    return {
      dailyTargetHours:
        Number.isFinite(target) && target > 0 ? Math.min(24, target) : DEFAULT_SETTINGS.dailyTargetHours,
      examDate: typeof parsed.examDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.examDate)
        ? parsed.examDate
        : null,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Local, device-level preferences. Study history itself lives in PostgreSQL. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(read);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return { settings, update };
}

export function daysUntil(dateKey: string | null): number | null {
  if (!dateKey) return null;
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1, d).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / 86_400_000);
}
