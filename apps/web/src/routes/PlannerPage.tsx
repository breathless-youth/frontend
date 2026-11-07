import { hasTokenSource } from "@/lib/userId";
import { LegacyPlannerPage } from "./LegacyPlannerPage";
import { PlannerPlanPage } from "./PlannerPlanPage";

export function PlannerPage() {
  return hasTokenSource() ? <PlannerPlanPage /> : <LegacyPlannerPage />;
}
