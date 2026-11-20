import { Check } from "lucide-react";
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { CoinIcon } from "@/features/points/components/shared/CoinIcon";
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

/** 띠가 바뀐 뒤 새 버튼이 탭을 받지 않는 시간 */
const SWAP_GUARD_MS = 500;

/**
 * 띠의 버튼이 하는 일의 이름
 *
 * 같은 띠가 값만 바뀌어 다시 그려질 때와 버튼의 뜻이 바뀔 때를 구분하는 데 쓴다.
 */
function bandAction(band: HomeBand): string {
  if (band.kind === "mission") {
    return `mission-${band.step}-${band.ready ? "complete" : "go"}`;
  }
  return band.kind === "mission-reward" ? "reward" : "goal";
}

/**
 * 띠가 바뀐 직후의 탭 막기
 *
 * 받기나 완료를 연달아 누르면 요청이 끝나 띠가 바뀐 뒤의 두 번째 탭이 같은 자리에 새로 나타난 버튼에 닿는다.
 * 그 탭으로 목표 창이 열리거나 공부가 시작되지 않게, 버튼의 뜻이 바뀐 뒤 잠깐은 탭을 받지 않는다.
 * 화면이 그려진 뒤 탭이 처리되기 전에 시각을 적어야 해서 레이아웃 단계에서 적는다.
 */
function useSwapGuard(action: string): (handler: () => void) => () => void {
  const lastAction = useRef(action);
  const swappedAt = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (lastAction.current !== action) {
      lastAction.current = action;
      swappedAt.current = Date.now();
    }
  }, [action]);
  return (handler) => () => {
    if (swappedAt.current !== null && Date.now() - swappedAt.current < SWAP_GUARD_MS) {
      return;
    }
    handler();
  };
}

export function HomeProgressBand({
  band,
  completing,
  claiming = false,
  starting,
  studying = false,
  error,
  actions,
}: {
  band: HomeBand;
  completing: boolean;
  claiming?: boolean;
  starting: boolean;
  /** 공부 중이면 미션의 가기와 시작을 그리지 않는다. */
  studying?: boolean;
  error?: string;
  actions: HomeV3ContentProps["actions"];
}) {
  const { t } = useTranslation("home");
  const guarded = useSwapGuard(bandAction(band));
  const mission = band.kind === "mission" ? band : null;
  const goal = band.kind === "goal" ? band : null;
  const reward = band.kind === "mission-reward" ? band : null;
  const caption = mission
    ? t("v3.mission.caption")
    : goal
      ? t("v3.goal.caption", { time: homeClock(goal.targetSeconds) })
      : reward
        ? t("v3.reward.caption")
        : t("v3.mission.finished");
  const title = reward ? (
    <Trans
      t={t}
      i18nKey="v3.reward.title"
      values={{ points: `${reward.points.toLocaleString()}P` }}
      components={{ accent: <span className="text-primary" /> }}
    />
  ) : mission ? (
    t(mission.step === 1 ? "v3.mission.subject" : "v3.mission.focus")
  ) : goal ? (
    goal.remainingSeconds === 0 ? (
      t("v3.goal.achieved")
    ) : (
      t("v3.goal.remaining", { time: homeClock(goal.remainingSeconds) })
    )
  ) : (
    t("v3.goal.prompt")
  );
  return (
    <div>
      <section
        className={cn(
          "flex min-h-19 items-center rounded-xl bg-brand-subtle px-4 py-3",
          reward ? "gap-3" : "gap-3.5",
        )}
        aria-label={reward ? t("v3.reward.label") : caption}
      >
        {reward ? (
          <CoinIcon size={44} />
        ) : (
          <ProgressRing
            progress={mission ? mission.progress : goal ? goal.percent / 100 : 1}
            label={
              mission ? t("v3.mission.progress", { step: mission.step }) : t("v3.goal.progress")
            }
          >
            {mission ? (
              `${mission.step}/2`
            ) : goal ? (
              `${goal.percent}%`
            ) : (
              <Check size={14} strokeWidth={3} />
            )}
          </ProgressRing>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="flex items-center gap-1.5 text-xs leading-4 text-brand-subtle-text tabular-nums">
            {caption}
            {mission?.rewardPoints !== undefined && (
              // 이번 단계를 끝내면 받는 포인트이며 금액은 서버가 정한다.
              <span className="inline-flex items-center gap-0.5 rounded-full bg-muted py-px pr-1.75 pl-0.75 text-[11px] leading-3.25 font-extrabold text-primary normal-nums">
                <CoinIcon size={12} />+{mission.rewardPoints.toLocaleString()}P
              </span>
            )}
          </p>
          <p
            className={cn(
              "break-keep text-foreground tabular-nums",
              reward
                ? "text-base leading-6 font-extrabold"
                : band.kind === "goal-empty"
                  ? "text-sm leading-5 font-medium"
                  : "text-lg leading-6.5 font-bold",
            )}
          >
            {title}
          </p>
        </div>
        {reward ? (
          // 보이는 알약은 낮게 두고 누르는 범위만 위아래로 넓혀 44px을 맞춘다.
          <Button
            variant="unstyled"
            className="relative h-8 shrink-0 rounded-full bg-primary/10 px-4 text-[13px] font-bold text-brand-subtle-text before:absolute before:inset-x-0 before:-inset-y-1.5"
            disabled={claiming}
            onClick={guarded(() => actions.claimMissionReward?.())}
          >
            {t(claiming ? "v3.reward.claiming" : "v3.reward.claim")}
          </Button>
        ) : mission?.ready ? (
          <Button
            className={cn(
              "min-h-11 min-w-18 shrink-0 gap-1 rounded-full px-4 text-sm leading-5 font-semibold shadow-sb-cta",
              !completing && "motion-safe:animate-[home-mission-ready_2.4s_ease-out_infinite]",
            )}
            disabled={completing}
            onClick={guarded(() => actions.completeMission(mission.step))}
          >
            {!completing && <Check size={14} strokeWidth={2.4} aria-hidden="true" />}
            {t(completing ? "v3.mission.completing" : "v3.mission.complete")}
          </Button>
        ) : studying && mission ? null : (
          // 글자 링크는 여백 없이 띠 안쪽 끝에 붙이고, 짧은 영어 문구도 누르기 쉽게 누르는 범위만 좌우로 넓힌다.
          <Button
            variant="unstyled"
            className="relative min-h-11 shrink-0 gap-1 p-0 text-sm leading-5 font-medium text-brand-subtle-text before:absolute before:inset-y-0 before:-inset-x-2.5"
            disabled={starting && mission?.step === 2}
            onClick={guarded(
              mission
                ? mission.step === 1
                  ? actions.openPlanner
                  : actions.startStudy
                : actions.editGoal,
            )}
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
            <HomeDesignIcon name="chevron" />
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
