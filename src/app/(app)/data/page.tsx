"use client";

import { useEffect, useMemo, useState } from "react";
import { useStudy } from "@/components/study-provider";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { cn, formatHours, plural } from "@/lib/format";
import { IS_STATIC, localFetch } from "@/lib/local-engine";

const SAMPLE = `{
  "app": "JK Shah Classes — Direct Taxation Lecture Tracker",
  "defaultHours": 3,
  "chapters": [
    {
      "chapterNumber": 1,
      "title": "Introduction to DT",
      "plan": {
        "lectureCount": 3,
        "hoursPerLecture": 3,
        "completedLectures": [1, 2, 3]
      }
    }
  ]
}`;

export default function DataPage() {
  const { subjects, chapters, lectures, importData, resetDemo } = useStudy();
  const [raw, setRaw] = useState("");
  const [mode, setMode] = useState("new");
  const [subjectId, setSubjectId] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [teacher, setTeacher] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const [exportSubject, setExportSubject] = useState("");
  const [exportJson, setExportJson] = useState("");
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    const fromQuery = new URLSearchParams(window.location.search).get("subjectId");
    if (fromQuery) {
      setExportSubject(fromQuery);
      setSubjectId(fromQuery);
      setMode("merge");
    } else if (subjects[0]) {
      setExportSubject(String(subjects[0].id));
      setSubjectId(String(subjects[0].id));
    }
  }, [subjects]);

  const parsedPreview = useMemo(() => {
    if (!raw.trim()) return null;
    try {
      const value = JSON.parse(raw) as { app?: string; chapters?: unknown[] };
      const list = Array.isArray(value.chapters) ? value.chapters : [];
      return { app: value.app ?? "Unknown source", count: list.length };
    } catch {
      return null;
    }
  }, [raw]);

  const loadExport = async () => {
    if (!exportSubject) return;
    setExporting(true);
    try {
      const url = `/api/data?subjectId=${exportSubject}`;
      const response = IS_STATIC
        ? await localFetch(url)
        : await fetch(url, { cache: "no-store" });
      const payload = await response.json();
      setExportJson(JSON.stringify(payload, null, 2));
    } catch {
      setExportJson("// export failed");
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (exportSubject && !exportJson) void loadExport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportSubject, exportJson]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">Import &amp; export</h2>
        <p className="text-sm text-slate-500">
          Move your tracker around freely — paste a JSON export, or download everything as a backup.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="text-sm font-semibold tracking-tight text-slate-900">Import chapters</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Accepts the exported format: <code className="rounded bg-slate-100 px-1">{`{ chapters: [{ chapterNumber, title, plan }] }`}</code>
          </p>

          <div className="mt-4 space-y-4">
            <Field label="JSON payload" hint={parsedPreview ? `${parsedPreview.count} chapters detected` : "paste or type"}>
              <Textarea
                value={raw}
                onChange={(event) => setRaw(event.target.value)}
                placeholder={SAMPLE}
                className="min-h-56 font-mono text-xs"
              />
            </Field>

            <div className="flex flex-wrap gap-2 text-xs">
              <button
                onClick={() => setRaw(SAMPLE)}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold text-slate-600 hover:border-slate-400"
              >
                Insert sample
              </button>
              <button
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    if (text) setRaw(text);
                  } catch {
                    setMessage({ tone: "error", text: "Clipboard access denied — paste manually." });
                  }
                }}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold text-slate-600 hover:border-slate-400"
              >
                Paste from clipboard
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Mode">
                <Select value={mode} onChange={(event) => setMode(event.target.value)}>
                  <option value="new">Create a new subject</option>
                  <option value="merge">Merge into existing subject</option>
                  <option value="replace">Replace existing subject</option>
                </Select>
              </Field>
              {mode === "new" ? (
                <>
                  <Field label="Subject name" hint="optional">
                    <Input
                      value={subjectName}
                      onChange={(event) => setSubjectName(event.target.value)}
                      placeholder="Direct Tax"
                    />
                  </Field>
                  <Field label="Faculty / source" hint="optional" className="sm:col-span-2">
                    <Input
                      value={teacher}
                      onChange={(event) => setTeacher(event.target.value)}
                      placeholder="JK Shah Classes"
                    />
                  </Field>
                </>
              ) : (
                <Field label="Target subject" className="sm:col-span-2">
                  <Select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
                    {subjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name} ({chapters.filter((chapter) => chapter.subjectId === subject.id).length}{" "}
                        chapters)
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </div>

            {message ? (
              <p
                className={cn(
                  "rounded-xl px-3 py-2 text-xs font-medium",
                  message.tone === "ok"
                    ? "bg-emerald-50 text-emerald-800"
                    : "bg-rose-50 text-rose-800",
                )}
              >
                {message.text}
              </p>
            ) : null}

            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                if (!raw.trim()) {
                  setMessage({ tone: "error", text: "Paste some JSON first." });
                  return;
                }
                setBusy(true);
                const result = await importData({
                  action: "import",
                  payload: raw,
                  mode,
                  subjectId: subjectId ? Number(subjectId) : undefined,
                  subjectName: subjectName || undefined,
                  teacher: teacher || undefined,
                });
                setBusy(false);
                if (result.ok) {
                  setMessage({ tone: "ok", text: result.summary ?? "Import complete" });
                  setRaw("");
                } else {
                  setMessage({ tone: "error", text: "Import failed — check the JSON syntax." });
                }
              }}
            >
              Run import
            </Button>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="text-sm font-semibold tracking-tight text-slate-900">Export backup</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Same shape as the JSON you pasted — chapter plans, completions and stats.
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <Field label="Subject" className="min-w-48 flex-1">
                <Select value={exportSubject} onChange={(event) => setExportSubject(event.target.value)}>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button loading={exporting} onClick={() => void loadExport()}>
                Refresh
              </Button>
            </div>

            {exportJson ? (
              <>
                <pre className="momentum mt-4 max-h-72 overflow-auto rounded-xl bg-slate-900 p-4 text-[11px] leading-relaxed text-slate-100">
                  {exportJson}
                </pre>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(exportJson);
                        setCopied(true);
                        window.setTimeout(() => setCopied(false), 1800);
                      } catch {
                        setCopied(false);
                      }
                    }}
                  >
                    {copied ? "✓ Copied" : "Copy JSON"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const blob = new Blob([exportJson], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const anchor = document.createElement("a");
                      anchor.href = url;
                      anchor.download = `lecture-tracker-${new Date().toISOString().slice(0, 10)}.json`;
                      anchor.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    ⬇ Download
                  </Button>
                </div>
              </>
            ) : (
              <p className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                Pick a subject and hit refresh to preview the export.
              </p>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-semibold tracking-tight text-slate-900">Storage summary</h3>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-[11px] font-semibold uppercase text-slate-400">Subjects</dt>
                <dd className="font-semibold text-slate-900">{subjects.length}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-[11px] font-semibold uppercase text-slate-400">Chapters</dt>
                <dd className="font-semibold text-slate-900">{chapters.length}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-[11px] font-semibold uppercase text-slate-400">Lecture records</dt>
                <dd className="font-semibold text-slate-900">{lectures.length}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-[11px] font-semibold uppercase text-slate-400">Planned hours</dt>
                <dd className="font-semibold text-slate-900">
                  {formatHours(chapters.reduce((sum, chapter) => sum + chapter.lectureCount * chapter.hoursPerLecture, 0))}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-slate-500">
              Stored in PostgreSQL via Drizzle ORM — {plural(lectures.length, "row")} of lecture history.
            </p>
          </Card>

          <Card className="border-rose-200 p-5">
            <h3 className="text-sm font-semibold tracking-tight text-rose-700">Danger zone</h3>
            <p className="mt-1 text-xs text-slate-500">
              Wipes every subject, chapter, lecture, log entry and activity record, then re-seeds the original
              Direct Tax plan.
            </p>
            {confirmReset ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-rose-700">Are you sure?</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmReset(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={async () => {
                    await resetDemo();
                    setConfirmReset(false);
                    setExportJson("");
                  }}
                >
                  Yes, reset everything
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="danger" className="mt-3" onClick={() => setConfirmReset(true)}>
                Reset to demo data
              </Button>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
