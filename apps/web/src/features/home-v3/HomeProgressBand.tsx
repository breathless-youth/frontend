import { Check } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HomeDesignIcon } from "./HomeDesignIcon";
import { homeClock, type HomeBand } from "./homeV3Model";
import type { HomeV3ContentProps } from "./homeV3ContentTypes";

function ProgressRing({
  progress,
  label,
  children,
}: {
  progress: number;
  label: string;
  children: ReactNode;
}) {
  return (
    <span
      className="home-v3-ring"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
    >
      <span className="home-v3-ring-track" aria-hidden="true" />
      <span
        className="home-v3-ring-fill"
        style={{ "--home-v3-ring-angle": `${progress * 360}deg` } as CSSProperties}
        aria-hidden="true"
      />
      <span
        className="home-v3-ring-cap"
        style={{ opacity: progress > 0 ? 1 : 0 }}
        aria-hidden="true"
      />
      <span
        className="home-v3-ring-cap"
        style={{ transform: `rotate(${progress * 360}deg)`, opacity: progress > 0 ? 1 : 0 }}
        aria-hidden="true"
      />
      <span
        className="relative flex size-full items-center justify-center text-xs leading-4 font-extrabold text-brand-subtle-text tabular-nums"
        aria-hidden="true"
      >
        {children}
      </span>
    </span>
  );
}

export function HomeProgressBand({
  band,
  completing,
  starting,
  error,
  actions,
}: {
  band: HomeBand;
  completing: boolean;
  starting: boolean;
  error?: string;
  actions: HomeV3ContentProps["actions"];
}) {
  const { t } = useTranslation("home");
  const mission = band.kind === "mission" ? band : null;
  const goal = band.kind === "goal" ? band : null;
  const caption = mission
    ? t("v3.mission.caption")
    : goal
      ? t("v3.goal.caption", { time: homeClock(goal.targetSeconds) })
      : t("v3.mission.finished");
  const title = mission
    ? t(mission.step === 1 ? "v3.mission.subject" : "v3.mission.focus")
    : goal
      ? goal.remainingSeconds === 0
        ? t("v3.goal.achieved")
        : t("v3.goal.remaining", { time: homeClock(goal.remainingSeconds) })
      : t("v3.goal.prompt");
  return (
    <div>
      <section
        className="flex min-h-19 items-center gap-3.5 rounded-xl bg-brand-subtle px-4 py-3"
        aria-label={caption}
      >
        <ProgressRing
          progress={mission ? mission.progress : goal ? goal.percent / 100 : 1}
          label={mission ? t("v3.mission.progress", { step: mission.step }) : t("v3.goal.progress")}
        >
          {mission ? (
            `${mission.step}/2`
          ) : goal ? (
            `${goal.percent}%`
          ) : (
            <Check size={20} strokeWidth={2.4} />
          )}
        </ProgressRing>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-xs leading-4 text-brand-subtle-text tabular-nums">{caption}</p>
          <p
            className={cn(
              "break-keep text-foreground tabular-nums",
              band.kind === "goal-empty"
                ? "text-sm leading-5 font-medium"
                : "text-lg leading-6.5 font-bold",
            )}
          >
            {title}
          </p>
        </div>
        {mission?.ready ? (
          <Button
            className={cn(
              "min-h-11 min-w-18 shrink-0 gap-1.5 rounded-full px-4 text-sm leading-5 font-medium shadow-sb-cta",
              !completing && "motion-safe:animate-[home-mission-ready_2.4s_ease-out_infinite]",
            )}
            disabled={completing}
            onClick={() => actions.completeMission(mission.step)}
          >
            {!completing && <Check size={14} strokeWidth={2.4} aria-hidden="true" />}
            {t(completing ? "v3.mission.completing" : "v3.mission.complete")}
          </Button>
        ) : (
          <Button
            variant="unstyled"
            className="min-h-11 shrink-0 gap-1 py-0 pr-1 pl-2 text-sm leading-5 font-medium text-brand-subtle-text"
            disabled={starting && mission?.step === 2}
            onClick={
              mission
                ? mission.step === 1
                  ? actions.openPlanner
                  : actions.startStudy
                : actions.editGoal
            }
          >
            {t(
              mission
                ? mission.step === 1
                  ? "v3.mission.go"
                  : "v3.mission.start"
                : goal
                  ? "v3.goal.change"
                  : "v3.goal.set",
            )}
            <HomeDesignIcon name="chevron" className="text-primary" />
          </Button>
        )}
      </section>
      {error && (
        <p role="alert" className="px-4 pt-2 text-sm text-feedback-danger">
          {error}
        </p>
      )}
    </div>
  );
}
