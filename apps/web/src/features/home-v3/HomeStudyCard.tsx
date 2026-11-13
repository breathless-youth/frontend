import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import clock from "@/assets/home-v3/mascot-clock.png";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { HomeInlineError } from "./HomeInlineError";
import { homeClock } from "./homeV3Model";
import type { HomeLoadState, HomeTodayStats } from "./homeV3ContentTypes";

function ClockValue({ seconds }: { seconds: number }) {
  const parts = homeClock(seconds).split(":");
  return (
    <>
      {parts.map((part, index) => (
        <span key={index}>
          {index > 0 && <span className="px-[0.06em]">:</span>}
          {part}
        </span>
      ))}
    </>
  );
}

function StudyMetric({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div>
      <dt className="text-xs leading-3.75 text-muted-foreground">{label}</dt>
      <dd className={cn("pt-1 text-[17px] leading-5.25 font-extrabold tabular-nums", className)}>
        {value}
      </dd>
    </div>
  );
}

export function HomeStudyCard({
  stats,
  children,
}: {
  stats: HomeLoadState<HomeTodayStats>;
  children: ReactNode;
}) {
  const { t } = useTranslation("home");
  return (
    <Card
      role="region"
      className="home-v3-study-card relative overflow-hidden rounded-xl border-0 bg-muted px-5.5 pt-5.5 pb-5 shadow-sb-card"
      aria-label={t("v3.stats.title")}
    >
      <img
        src={clock}
        alt=""
        width={190}
        height={190}
        className="home-v3-clock pointer-events-none absolute -right-7 scale-80 select-none"
      />
      <div className="relative z-1 flex flex-col gap-3.5">
        {stats.status === "pending" ? (
          <Skeleton className="h-31.75 w-48 rounded-md" />
        ) : stats.status === "error" ? (
          <div className="min-h-31.75 max-w-60">
            <HomeInlineError label={t("stats.loadFailed")} retry={stats.retry} />
          </div>
        ) : (
          <div className="min-h-31.75">
            <h2 className="text-sm leading-4.25 font-bold text-muted-foreground">
              {t("v3.stats.title")}
            </h2>
            <p
              className="pt-2 pb-1.5 text-[44px] leading-13 font-bold tracking-[-0.5px] text-foreground tabular-nums"
              aria-label={t("v3.stats.total", { time: homeClock(stats.value.studySeconds) })}
            >
              <span aria-hidden="true">
                <ClockValue seconds={stats.value.studySeconds} />
              </span>
            </p>
            <dl className="flex w-fit gap-3.5 pt-1">
              <StudyMetric
                label={t("v3.stats.focus")}
                value={homeClock(stats.value.focusSeconds)}
              />
              <Separator className="h-9 w-px self-center" />
              <StudyMetric
                label={t("stats.focusRate")}
                value={`${Math.round(Math.min(100, Math.max(0, stats.value.focusRate)))}%`}
                className="text-primary"
              />
            </dl>
          </div>
        )}
        {children}
      </div>
    </Card>
  );
}
