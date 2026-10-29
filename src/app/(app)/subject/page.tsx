import { Suspense } from "react";
import SubjectDetailPage from "@/components/pages/subject-detail";

export default function Page() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-slate-200/60" />}>
      <SubjectDetailPage />
    </Suspense>
  );
}
