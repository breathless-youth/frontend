import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

import { hasAppLockCapability } from "@/features/app-lock/appLockCapability";
import { readAppLockEnabled } from "@/features/app-lock/appLockSettings";
import { formatAppLockRowValue } from "@/features/app-lock/appLockSummary";
import { queryAppLock } from "@/features/app-lock/nativeAppLock";
import { DdaySection } from "@/features/home/DdaySection";
import { useHomeStudyStatusProperties } from "@/features/home/useHomeStudyStatusProperties";
import { useOpenPlanner } from "@/features/planner/useOpenPlanner";
import { recentTimelapsesQuery } from "@/features/timelapse/timelapseQueries";
import { getTimelapseStore } from "@/features/timelapse/timelapseStore";
import { PointsBalancePill } from "@/features/points/components/shared/PointsBalancePill";
import { usePointsBalance } from "@/features/points/components/shop/usePointsBalance";
import { pointsSearch } from "@/features/points/pointsSearch";
import { setHasTimelapseUserProperty } from "@/lib/amplitude";
import { isPointsEnabled } from "@/lib/pointsCapability";
import { hasTokenSource } from "@/lib/userId";
import { lazyWithPreload } from "@/lib/lazyWithPreload";
import { slideNavigate } from "@/lib/pageTransition";
import { listSubjects } from "@/lib/subjectApi";
import { useFocusStart } from "@/lib/useFocusStart";
import { SubjectStartUnavailableError } from "@/lib/sessionStart";
import { prefetchVisionAssets } from "@/features/study-session/vision/prefetchVisionAssets";
import { prefetchTimelapsesPage } from "@/routes/lazyRoutes";

import { HomeV3Content, type HomeLoadState, type HomeTodayStats } from "./HomeV3Content";
import type { HomeDay, HomeV3Gateway } from "./HomeV3Gateway";
import { readHomeSubject, reconcileHomeSubject, useHomeSubject } from "./subjectSelection";
import { useHomeDay } from "./useHomeDay";
import { useHomeV3Progress } from "./useHomeV3Progress";
import { homeDateLabel } from "./homeV3Model";
import { homeV3StatsQuery, homeV3StreakQuery } from "./homeV3Queries";
import { createHomeV3Gateway } from "./createHomeV3Gateway";

const { LazySheet: LazyGoalSheet, preload: preloadGoalSheet } = lazyWithPreload(() =>
  import("./HomeGoalSheet").then((module) => module.HomeGoalSheet),
);

/** 실제 서버 어댑터를 연결한 뒤에만 HomeTabPage에서 선택하는 새 본문. */
export function HomeV3Entry({
  userId,
  gateway: suppliedGateway,
  onOverlayChange,
}: {
  userId: number;
  gateway?: HomeV3Gateway;
  onOverlayChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation(["home", "planner"]);
  const startFocus = useFocusStart(userId);
  const gateway =
    suppliedGateway ??
    createHomeV3Gateway(userId, async (subjectId) => {
      const failure = await startFocus("home", subjectId === null ? undefined : { subjectId });
      if (failure) throw failure;
    });
  const day = useHomeDay();
  const navigate = useNavigate();
  const location = useLocation();
  const openPlanner = useOpenPlanner("home");
  const points = usePointsBalance(userId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState<{
    day: HomeDay;
    seconds: number | null;
    key: number;
    open: boolean;
  } | null>(null);
  const editorKey = useRef(0);
  const startRequest = useRef(0);
  const verifyingRef = useRef(false);
  const [verifyingSubject, setVerifyingSubject] = useState(false);
  const [startError, setStartError] = useState<"verify" | "unsupported" | "start" | null>(null);
  const prefetched = useRef(false);
  useEffect(
    () => () => {
      startRequest.current++;
    },
    [],
  );
  const statsQuery = useQuery(homeV3StatsQuery(userId, day));
  const streakQuery = useQuery(homeV3StreakQuery(userId, day));
  // 스트릭이 실패해도 오늘 통계는 표시한다. 기존 사용자 속성은 두 조회가 성공한 뒤 보낸다.
  useHomeStudyStatusProperties(
    statsQuery.data,
    streakQuery.data,
    statsQuery.dataUpdatedAt,
    streakQuery.dataUpdatedAt,
  );
  const subjects = useQuery({
    queryKey: ["subjects", "list", userId],
    queryFn: listSubjects,
    staleTime: 0,
  });
  const [subjectId, selectSubject] = useHomeSubject(userId, subjects.data);
  if (startError === "verify" && subjects.isSuccess) {
    setStartError(null);
  }
  const timelapses = useQuery({
    ...recentTimelapsesQuery(getTimelapseStore()),
    networkMode: "always",
  });
  const appLockSupported = hasAppLockCapability();
  const appLock = useQuery({
    queryKey: ["app-lock", "home-summary"],
    queryFn: queryAppLock,
    enabled: appLockSupported,
    networkMode: "always",
    staleTime: 0,
  });
  const stats: HomeLoadState<HomeTodayStats> = statsQuery.data
    ? {
        status: "success",
        value: {
          studySeconds: statsQuery.data.totalStudySec,
          focusSeconds: statsQuery.data.totalFocusSec,
          focusRate: statsQuery.data.focusRate,
        },
      }
    : statsQuery.isError
      ? {
          status: "error",
          retry: () => {
            void statsQuery.refetch();
          },
        }
      : { status: "pending" };
  const progress = useHomeV3Progress(gateway, userId, day, stats);
  useEffect(() => {
    if (stats.status !== "success" || prefetched.current) return;
    prefetched.current = true;
    prefetchVisionAssets();
    void prefetchTimelapsesPage();
  }, [stats.status]);

  const timelapseData = timelapses.data;
  useEffect(() => {
    if (timelapseData !== undefined) setHasTimelapseUserProperty(timelapseData.length > 0);
  }, [timelapseData]);
  if (
    editing?.open &&
    (editing.day.dateKey !== day.dateKey || editing.day.timeZone !== day.timeZone)
  ) {
    // 지난 날짜 폼을 새 날짜에 저장하지 않도록 날짜가 바뀐 렌더에서 바로 닫는다.
    setEditing({ ...editing, open: false });
  }
  const overlayOpen = menuOpen || editing?.open === true;
  useEffect(() => {
    onOverlayChange(overlayOpen);
    return () => onOverlayChange(false);
  }, [onOverlayChange, overlayOpen]);

  function openPage(pathname: string) {
    slideNavigate("forward", () => {
      void navigate({ pathname, search: location.search });
    });
  }
  async function startStudy() {
    if (verifyingRef.current) return;
    verifyingRef.current = true;
    setVerifyingSubject(true);
    const request = ++startRequest.current;
    let verifiedId = subjectId;
    try {
      if (subjectId !== null && subjects.data === undefined) {
        const result = await subjects.refetch();
        if (startRequest.current !== request) return;
        if (result.data === undefined || result.isError) {
          setStartError("verify");
          return;
        }
        verifiedId = reconcileHomeSubject(readHomeSubject(userId), result.data);
        selectSubject(verifiedId);
      }
      if (startRequest.current !== request) return;
      setStartError(null);
      await gateway.startStudy(verifiedId);
    } catch (error) {
      if (
        startRequest.current === request &&
        !(error instanceof DOMException && error.name === "AbortError")
      )
        setStartError(error instanceof SubjectStartUnavailableError ? "unsupported" : "start");
    } finally {
      verifyingRef.current = false;
      if (startRequest.current === request) setVerifyingSubject(false);
    }
  }
  const lockLabel = !appLockSupported
    ? t("v3.appLock.unsupported")
    : appLock.data === undefined || appLock.data === null
      ? t("v3.appLock.unknown")
      : formatAppLockRowValue(
          readAppLockEnabled() && appLock.data.authorized && !appLock.data.revoked,
          appLock.data.appCount,
          appLock.data.categoryCount,
        );

  return (
    <>
      <header className="flex min-h-14.5 items-end justify-between gap-4 pb-1">
        <h1 className="sr-only">{t("header.title")}</h1>
        {hasTokenSource() ? (
          <DdaySection userId={userId} layout="home-v3" />
        ) : (
          <span className="text-2xl font-bold">FocusMakers</span>
        )}
        {isPointsEnabled() && !points.memberOnly ? (
          <div className="shrink-0 pb-1.5">
            <PointsBalancePill
              size="home"
              balance={points.balance}
              onPress={() =>
                slideNavigate("forward", () =>
                  navigate({ pathname: "/points", search: pointsSearch(location.search) }),
                )
              }
            />
          </div>
        ) : (
          <p className="shrink-0 pb-1.5 text-sm leading-4.5 font-medium text-muted-foreground">
            {homeDateLabel(day.dateKey, i18n.language)}
          </p>
        )}
      </header>
      <HomeV3Content
        band={progress.band}
        stats={stats}
        subjects={
          subjects.data !== undefined
            ? { status: "success", value: subjects.data }
            : subjects.isError
              ? {
                  status: "error",
                  retry: () => {
                    void subjects.refetch();
                  },
                }
              : { status: "pending" }
        }
        selectedSubjectId={subjectId}
        onMenuOpenChange={setMenuOpen}
        completingMission={progress.completingMission}
        missionError={progress.missionError ? t("v3.mission.failed") : undefined}
        startingStudy={verifyingSubject}
        startError={
          startError === "verify"
            ? t("v3.subject.verifyFailed")
            : startError === "unsupported"
              ? t("studyStart.updateApp", { ns: "planner" })
              : startError === "start"
                ? t("v3.startFailed")
                : undefined
        }
        timelapseCount={timelapses.data?.length}
        plannerTaskCount={progress.goal?.remainingTasks}
        appLockLabel={lockLabel}
        actions={{
          selectSubject: (id) => {
            selectSubject(id);
            setStartError(null);
          },
          startStudy: () => {
            void startStudy();
          },
          openPlanner: () => openPlanner(day.dateKey),
          completeMission: progress.completeMission,
          editGoal: () => {
            void preloadGoalSheet();
            setEditing({
              day,
              seconds: progress.goal?.seconds ?? null,
              key: ++editorKey.current,
              open: true,
            });
          },
          openTimelapses: () => openPage("/timelapses"),
          openTimelapseSettings: () => openPage("/timelapse-settings"),
          openAppLock: () => openPage("/app-lock-settings"),
        }}
      />
      {editing && (
        <LazyGoalSheet
          key={editing.key}
          open={editing.open}
          onOpenChange={(open) =>
            setEditing((previous) =>
              previous?.key === editing.key ? { ...previous, open } : previous,
            )
          }
          initialSeconds={editing.seconds}
          dateLabel={homeDateLabel(editing.day.dateKey, i18n.language)}
          onSave={(input) => progress.saveGoal(editing.day, input)}
        />
      )}
    </>
  );
}
