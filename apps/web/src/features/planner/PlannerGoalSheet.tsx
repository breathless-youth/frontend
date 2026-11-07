import type { PlannerGoalResponse } from "@focusmakers/types";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { durationParts, formatDuration, formatMonthDay } from "@/features/records/recordsFormat";
import { cn } from "@/lib/utils";
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
  const [seconds, setSeconds] = useState(goal.goalSec ?? 0),
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
          <div className="flex items-center justify-between gap-2 px-2">
            <Button
              data-base-ui-swipe-ignore=""
              variant="secondary"
              className="size-12 shrink-0 rounded-full p-0"
              aria-label={t("goal.decrease")}
              disabled={mutation.isPending || seconds === 0}
              onClick={() => setSeconds(Math.max(0, seconds - 1800))}
            >
              <Minus aria-hidden size={22} strokeWidth={2.4} />
            </Button>
            <output
              aria-label={formatDuration(seconds)}
              className="flex flex-wrap items-baseline justify-center gap-x-1 text-[40px] leading-12 font-extrabold tracking-[1px] tabular-nums"
            >
              {durationParts(seconds).map((part) => (
                <span key={part.unit}>
                  {part.value}
                  <span className="text-[21px] font-bold tracking-normal">{part.unit}</span>
                </span>
              ))}
            </output>
            <Button
              data-base-ui-swipe-ignore=""
              variant="secondary"
              className="size-12 shrink-0 rounded-full p-0"
              aria-label={t("goal.increase")}
              disabled={mutation.isPending || seconds >= 86400}
              onClick={() => setSeconds(Math.min(86400, seconds + 1800))}
            >
              <Plus aria-hidden size={22} strokeWidth={2.4} />
            </Button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[4, 6, 8, 10].map((hours) => (
              <Button
                key={hours}
                data-base-ui-swipe-ignore=""
                variant="unstyled"
                disabled={mutation.isPending}
                aria-pressed={seconds === hours * 3600}
                onClick={() => setSeconds(hours * 3600)}
                className={cn(
                  "relative h-10 rounded-full border-[1.5px] border-border bg-muted px-1 py-0 text-sm leading-5 font-semibold before:absolute before:-inset-y-0.5",
                  seconds === hours * 3600 &&
                    "border-primary bg-brand-subtle font-bold text-primary",
                )}
              >
                {formatDuration(hours * 3600)}
              </Button>
            ))}
          </div>
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
