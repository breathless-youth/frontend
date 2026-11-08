import type { PlannerGoalResponse } from "@focusmakers/types";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { formatMonthDay } from "@/features/records/recordsFormat";
import { GoalDurationInput } from "./GoalDurationInput";
import { clampGoalSeconds } from "./goalDuration";
import { usePlannerPlanMutation } from "./usePlannerPlanMutation";
export interface PlannerGoalSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: number | null;
  dateKey: string;
  goal: PlannerGoalResponse;
}
export function PlannerGoalSheet({
  open,
  onOpenChange,
  userId,
  dateKey,
  goal,
}: PlannerGoalSheetProps) {
  const { t } = useTranslation(["planner", "common"]);
  const [seconds, setSeconds] = useState(() => clampGoalSeconds(goal.goalSec ?? 0)),
    [asDefault, setAsDefault] = useState(false),
    [failed, setFailed] = useState(false);
  const mutation = usePlannerPlanMutation(userId);
  return (
    <Drawer
      open={open}
      onOpenChange={(next, details) => {
        if (mutation.isPending) {
          details.cancel();
          return;
        }
        onOpenChange(next);
      }}
    >
      <DrawerContent
        variant="planner"
        className="theme-soft-blue"
        initialFocus={false}
        finalFocus={false}
      >
        <div className="flex flex-col gap-5.5 pt-5.5">
          <div className="flex items-center justify-between">
            <DrawerTitle className="text-lg leading-6.5 font-bold">{t("goal.title")}</DrawerTitle>
            <span className="text-sm leading-5 font-semibold text-muted-foreground">
              {formatMonthDay(dateKey)}
            </span>
          </div>
          <GoalDurationInput
            seconds={seconds}
            onChange={setSeconds}
            disabled={mutation.isPending}
          />
          <label
            data-base-ui-swipe-ignore=""
            className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-[15px] leading-5.5 font-semibold"
          >
            {t("goal.asDefault")}
            <input
              type="checkbox"
              checked={asDefault}
              disabled={mutation.isPending}
              onChange={(event) => setAsDefault(event.target.checked)}
              className="peer sr-only"
            />
            <span
              aria-hidden
              className="relative h-7.5 w-12.5 shrink-0 rounded-full bg-bg-control-track after:absolute after:top-0.75 after:left-0.75 after:size-6 after:rounded-full after:bg-primary-foreground after:shadow-sm after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-5 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary peer-disabled:opacity-50"
            />
          </label>
          {failed && (
            <p role="alert" className="text-sm text-state-distract-text">
              {t("common:errors.retryLater")}
            </p>
          )}
          <Button
            data-base-ui-swipe-ignore=""
            disabled={userId === null || mutation.isPending}
            className="h-13 w-full rounded-xl text-base leading-6 font-bold shadow-sb-cta"
            onClick={() => {
              if (userId === null || mutation.isPending) return;
              setFailed(false);
              void (async () => {
                await mutation.mutateAsync({
                  kind: "setGoal",
                  ownerId: userId,
                  date: dateKey,
                  body: { goalSec: seconds },
                });
                if (asDefault)
                  await mutation.mutateAsync({
                    kind: "setDefaultGoal",
                    ownerId: userId,
                    body: { goalSec: seconds },
                  });
                onOpenChange(false);
              })().catch(() => setFailed(true));
            }}
          >
            {t("record.save")}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
