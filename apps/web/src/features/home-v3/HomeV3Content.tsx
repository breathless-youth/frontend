import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/Skeleton";
import { HomeContactBubble } from "./HomeContactBubble";
import { HomeDesignIcon } from "./HomeDesignIcon";
import { HomeInlineError } from "./HomeInlineError";
import { HomeProgressBand } from "./HomeProgressBand";
import { HomeStudyCard } from "./HomeStudyCard";
import { HomeSubjectSelect } from "./HomeSubjectSelect";
import { HomePlannerShortcut, HomeUtilityShortcuts } from "./HomeShortcuts";
import type { HomeV3ContentProps } from "./homeV3ContentTypes";
import "./home-v3.css";

export type {
  HomeLoadState,
  HomeSubject,
  HomeTodayStats,
  HomeV3ContentProps,
} from "./homeV3ContentTypes";

export function HomeV3Content({
  band,
  stats,
  subjects,
  selectedSubjectId,
  completingMission = false,
  startingStudy = false,
  startError,
  missionError,
  timelapseCount,
  plannerTaskCount,
  appLockLabel,
  menuOpen,
  onMenuOpenChange,
  actions,
}: HomeV3ContentProps) {
  const { t } = useTranslation("home");
  return (
    <div className="home-v3-content flex flex-col gap-3">
      {band.status === "pending" && <Skeleton className="h-19 rounded-xl" />}
      {band.status === "error" && (
        <HomeInlineError label={t("v3.progressFailed")} retry={band.retry} />
      )}
      {band.status === "success" && (
        <HomeProgressBand
          band={band.value}
          completing={completingMission}
          starting={startingStudy}
          error={missionError}
          actions={actions}
        />
      )}
      <HomeStudyCard stats={stats}>
        <HomeSubjectSelect
          subjects={subjects}
          subjectId={selectedSubjectId}
          starting={startingStudy}
          menuOpen={menuOpen}
          onMenuOpenChange={onMenuOpenChange}
          onSelect={actions.selectSubject}
          onAdd={actions.openPlanner}
        />
      </HomeStudyCard>
      <Button
        className="min-h-18 w-full gap-2.5 rounded-[22px] text-xl leading-6 font-bold tracking-[0.9px] shadow-sb-cta"
        disabled={startingStudy}
        aria-busy={startingStudy}
        onClick={actions.startStudy}
      >
        <HomeDesignIcon name="play" />
        {t(startingStudy ? "v3.startingStudy" : "v3.startStudy")}
      </Button>
      {startError && (
        <p role="alert" className="px-1 text-sm text-feedback-danger">
          {startError}
        </p>
      )}
      <HomePlannerShortcut plannerTaskCount={plannerTaskCount} onOpen={actions.openPlanner} />
      <HomeUtilityShortcuts
        timelapseCount={timelapseCount}
        appLockLabel={appLockLabel}
        actions={actions}
      />
      <HomeContactBubble onOpen={actions.openContact} />
    </div>
  );
}
