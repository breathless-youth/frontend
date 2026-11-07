import { QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { hasTokenSource } from "@/lib/userId";
import { queryClient } from "@/lib/queryClient";
import { useUserId } from "@/lib/userId";
import { SubjectPanel, type SubjectPanelProps } from "./SubjectPanel";
const PlannerPanel = lazy(() =>
  import("@/features/planner/PlannerSessionSubjectPanel").then((module) => ({
    default: module.PlannerSessionSubjectPanel,
  })),
);
export function SessionSubjectPanel(props: SubjectPanelProps) {
  const userId = useUserId();
  if (!hasTokenSource() || userId === null) return <SubjectPanel {...props} />;
  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <PlannerPanel {...props} userId={userId} />
      </Suspense>
    </QueryClientProvider>
  );
}
