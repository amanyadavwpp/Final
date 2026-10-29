import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { StudyProvider } from "@/components/study-provider";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <StudyProvider>
      <AppShell>{children}</AppShell>
    </StudyProvider>
  );
}
