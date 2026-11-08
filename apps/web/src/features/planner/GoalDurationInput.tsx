import { Minus, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { durationParts, formatDuration } from "@/features/records/recordsFormat";
import { cn } from "@/lib/utils";

import {
  GOAL_PRESET_HOURS,
  GOAL_STEP_SECONDS,
  MAX_GOAL_SECONDS,
  clampGoalSeconds,
} from "./goalDuration";

/** 홈·플래너가 같은 목표 입력과 시간 표기를 사용한다. 저장 정책은 각 화면이 맡는다. */
export function GoalDurationInput({
  seconds,
  onChange,
  disabled = false,
}: {
  seconds: number;
  onChange: (seconds: number) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("planner");
  return (
    <>
      <div className="flex items-center justify-between gap-2 px-2">
        <Button
          data-base-ui-swipe-ignore=""
          variant="secondary"
          className="size-12 shrink-0 rounded-full p-0"
          aria-label={t("goal.decrease")}
          disabled={disabled || seconds === 0}
          onClick={() => onChange(clampGoalSeconds(seconds - GOAL_STEP_SECONDS))}
        >
          <Minus aria-hidden size={22} strokeWidth={2.4} />
        </Button>
        <output
          aria-label={formatDuration(seconds)}
          aria-live="polite"
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
          disabled={disabled || seconds >= MAX_GOAL_SECONDS}
          onClick={() => onChange(clampGoalSeconds(seconds + GOAL_STEP_SECONDS))}
        >
          <Plus aria-hidden size={22} strokeWidth={2.4} />
        </Button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {GOAL_PRESET_HOURS.map((hours) => (
          <Button
            key={hours}
            data-base-ui-swipe-ignore=""
            variant="unstyled"
            disabled={disabled}
            aria-pressed={seconds === hours * 3600}
            onClick={() => onChange(hours * 3600)}
            className={cn(
              "relative h-10 rounded-full border-[1.5px] border-border bg-muted px-1 py-0 text-sm leading-5 font-semibold before:absolute before:-inset-y-0.5",
              seconds === hours * 3600 && "border-primary bg-brand-subtle font-bold text-primary",
            )}
          >
            {formatDuration(hours * 3600)}
          </Button>
        ))}
      </div>
    </>
  );
}
