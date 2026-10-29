"use client";

export default function OfflinePage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-2xl">
        📴
      </div>
      <h1 className="text-lg font-semibold tracking-tight text-slate-900">You&apos;re offline</h1>
      <p className="max-w-sm text-sm text-slate-500">
        Your tracker keeps working — progress is saved on this device and syncs when you reconnect.
      </p>
    </div>
  );
}
