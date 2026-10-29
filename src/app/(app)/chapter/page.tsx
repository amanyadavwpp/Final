import { Suspense } from "react";
import ChapterDetailPage from "@/components/pages/chapter-detail";

export default function Page() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-slate-200/60" />}>
      <ChapterDetailPage />
    </Suspense>
  );
}
