import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/Skeleton";
import { HomeContactFooter } from "./HomeContactFooter";
import { HomeInlineError } from "./HomeInlineError";
import { HomeProgressBand } from "./HomeProgressBand";
import { HomeStartButtons } from "./HomeStartButtons";
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

/**
 * 진행 띠 자리
 *
 * 불러오는 중이면 뼈대, 실패하면 다시 시도를 보인다.
 * 공부 중에는 미션의 가기와 시작을 숨긴다.
 * 가기는 플래너로 홈을 떠나 세션이 끝나고, 시작은 세션 요청을 새로 보낸다.
 */
export function HomeBandBlock({
  band,
  completingMission = false,
  claimingReward = false,
  startingStudy = false,
  studying = false,
  missionError,
  actions,
}: Pick<
  HomeV3ContentProps,
  "band" | "completingMission" | "claimingReward" | "startingStudy" | "missionError" | "actions"
> & { studying?: boolean }) {
  const { t } = useTranslation("home");
  if (band.status === "pending") return <Skeleton className="h-19 rounded-xl" />;
  if (band.status === "error") {
    return <HomeInlineError label={t("v3.progressFailed")} retry={band.retry} />;
  }
  return (
    <HomeProgressBand
      band={band.value}
      completing={completingMission}
      claiming={claimingReward}
      starting={startingStudy}
      studying={studying}
      error={missionError}
      actions={actions}
    />
  );
}

/**
 * 진행 띠·공부 카드·시작 버튼 묶음
 *
 * 폰 홈과 PC 공부시간 패널이 같은 부품을 같은 순서로 그려야 동작이 어긋나지 않아 한 곳에 둔다.
 */
export function HomeStudyBlocks({
  band,
  stats,
  subjects,
  selectedSubjectId,
  completingMission = false,
  claimingReward = false,
  startingStudy = false,
  startError,
  missionError,
  menuOpen,
  onMenuOpenChange,
  actions,
}: HomeV3ContentProps) {
  return (
    <>
      <HomeBandBlock
        band={band}
        completingMission={completingMission}
        claimingReward={claimingReward}
        startingStudy={startingStudy}
        missionError={missionError}
        actions={actions}
      />
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
      <HomeStartButtons starting={startingStudy} onStart={actions.startStudy} />
      {startError && (
        <p role="alert" className="px-1 text-sm text-feedback-danger">
          {startError}
        </p>
      )}
    </>
  );
}

export function HomeV3Content(props: HomeV3ContentProps) {
  const { timelapseCount, plannerTaskCount, appLockLabel, actions } = props;
  return (
    <div className="home-v3-content flex flex-1 flex-col gap-3">
      <HomeStudyBlocks {...props} />
      <HomePlannerShortcut plannerTaskCount={plannerTaskCount} onOpen={actions.openPlanner} />
      <HomeUtilityShortcuts
        timelapseCount={timelapseCount}
        appLockLabel={appLockLabel}
        actions={actions}
      />
      <HomeContactFooter onOpen={actions.openContact} />
    </div>
  );
}
