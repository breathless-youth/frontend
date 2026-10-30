import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ScreenBackHeader } from "@/components/ScreenBackHeader";
import { daySubjectItems, loadLiveSubjects } from "@/features/home/daySubjects";
import { daysUntil, formatDday } from "@/features/home/ddayFormat";
import { subjectsOnDayQuery } from "@/features/home/subjectCompletion";
import { plannerDateKeyOf } from "@/features/planner/plannerDay";
import { PlannerHead } from "@/features/planner/PlannerHead";
import { PlannerSubjects } from "@/features/planner/PlannerSubjects";
import { PlannerTimetable } from "@/features/planner/PlannerTimetable";
import { plannerEntryOf } from "@/features/planner/useOpenPlanner";
import { usePlannerDay } from "@/features/planner/usePlannerDay";
import { PeriodNav, PeriodNavPickerButton } from "@/features/records/PeriodNav";
import { addDaysToDateKey, dayTitleWithWeekday } from "@/features/records/recordsFormat";
import { useHorizontalSwipe } from "@/features/records/useHorizontalSwipe";
import { trackPlannerDateChanged, trackPlannerOpened } from "@/lib/amplitude";
import { ddayQuery } from "@/lib/ddayQueries";
import { lazyWithPreload } from "@/lib/lazyWithPreload";
import { slideNavigate } from "@/lib/pageTransition";
import { useUserId } from "@/lib/userId";
import { whenIdle } from "@/lib/whenIdle";

/**
 * 날짜 선택 시트는 시트 부품(Base UI)과 함께 따로 받는다.
 * 이 화면은 첫 번들에 들어가므로 화면이 뜬 뒤 한가할 때 미리 받아 둔다.
 */
const { LazySheet: LazyDayPickerSheet, preload: preloadDayPickerSheet } = lazyWithPreload(() =>
  import("@/features/records/PeriodPickerSheet").then((module) => module.DayPickerSheet),
);

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 타임테이블 화면
 *
 * 사용자에게 보이는 이름은 타임테이블이고 코드와 분석 이벤트는 예전 이름인 플래너를 쓴다.
 * 홈 타임테이블 탭과 같은 조회 전용이라 왼쪽에 그날 공부한 과목별 순공, 오른쪽에 타임테이블만 둔다.
 * 수동 기록 추가는 홈 과목 카드와 기록 탭, 수정·삭제는 기록 탭에서 한다.
 * 하루와 오늘은 홈과 같이 05시에 바뀌어, 새벽 0~5시의 공부는 전날에 이어진다.
 * 미래에는 보일 것이 없어 오늘까지만 넘긴다.
 * 탭 바 없는 전체 화면 라우트다(`/planner?date=YYYY-MM-DD`, `lib/nativeTabBar.ts`).
 */
export function PlannerPage() {
  const userId = useUserId();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const todayKey = plannerDateKeyOf(new Date());
  const requested = searchParams.get("date");
  // 날짜가 없거나 형식이 틀리거나 미래면 오늘을 연다. 모양만 맞고 달력에 없는 날짜(2020-13-45)는
  // 날짜 계산을 한 바퀴 돌리면 다른 날짜가 되므로 그것으로 걸러 낸다.
  const dateKey =
    requested !== null &&
    DATE_KEY_PATTERN.test(requested) &&
    addDaysToDateKey(requested, 0) === requested &&
    requested <= todayKey
      ? requested
      : todayKey;
  const isToday = dateKey === todayKey;

  const entry = plannerEntryOf(location);
  const openedRef = useRef(false);
  useEffect(() => {
    if (openedRef.current) {
      return;
    }
    openedRef.current = true;
    trackPlannerOpened({ via: entry ?? "unknown", isToday });
  }, [entry, isToday]);

  const state = usePlannerDay(userId, dateKey);
  // 홈 타임테이블 탭과 같은 과목을 보이려고 홈과 같은 지금 과목 목록과 그날 과목 조회를 받는다.
  // 과목은 홈과 세션 화면이 react-query 밖에서 바꿔서 열 때마다 새로 받는다.
  const queryClient = useQueryClient();
  const liveSubjects = useQuery({
    queryKey: ["subjects", "live", userId],
    queryFn: () => loadLiveSubjects(queryClient, userId ?? 0),
    enabled: userId !== null,
    staleTime: 0,
  });
  const subjectsOnDay = useQuery({
    ...subjectsOnDayQuery(userId ?? 0, dateKey),
    enabled: userId !== null && !isToday,
    staleTime: 0,
  });
  // 캐시에 남은 목록은 이전에 열었을 때의 것이라 이번에 다시 받기 전에는 그리지 않는다.
  // 홈처럼 지난 날은 지금 과목을 그렸다가 줄어들지 않게 그날 과목도 기다린다.
  const subjectsPending =
    !liveSubjects.isFetchedAfterMount || (!isToday && !subjectsOnDay.isFetchedAfterMount);
  const dday = useQuery({ ...ddayQuery(userId ?? 0), enabled: userId !== null });

  const changeDate = (delta: -1 | 1, method: "button" | "swipe") => {
    if (delta === 1 && isToday) {
      return;
    }
    const next = addDaysToDateKey(dateKey, delta);
    trackPlannerDateChanged({ delta, method });
    setSearchParams(
      (previous) => {
        // 셸이 붙인 쿼리(구 앱의 신원 등)는 지우지 않고 날짜만 바꾼다.
        const params = new URLSearchParams(previous);
        params.set("date", next);
        return params;
      },
      { replace: true, state: location.state },
    );
  };

  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => {
    whenIdle(preloadDayPickerSheet);
  }, []);
  /** 날짜 선택 시트에서 고른 날로 옮긴다. 같은 날이면 닫기만 한다. */
  const pickDate = (picked: string) => {
    setPickerOpen(false);
    if (picked === dateKey) {
      return;
    }
    const dayMs = 24 * 60 * 60 * 1000;
    trackPlannerDateChanged({
      delta: Math.round((Date.parse(picked) - Date.parse(dateKey)) / dayMs),
      method: "picker",
    });
    setSearchParams(
      (previous) => {
        const params = new URLSearchParams(previous);
        params.set("date", picked);
        return params;
      },
      { replace: true, state: location.state },
    );
  };

  // 기록 탭 달력·주간과 같은 판정으로 날짜를 넘긴다.
  const swipe = useHorizontalSwipe((delta) => changeDate(delta, "swipe"));

  const ddayData = dday.data ?? null;
  const [year, month, dayOfMonth] = dateKey.split("-").map(Number);
  const ddayLine =
    ddayData === null
      ? null
      : {
          // D-Day 일수는 플래너 날짜 기준으로 센다.
          label: formatDday(
            daysUntil(ddayData.targetDate, new Date(year!, month! - 1, dayOfMonth)),
          ),
          title: ddayData.title,
        };

  return (
    <main
      data-testid="planner-page"
      className="theme-soft-blue min-h-dvh bg-muted [--glass-fade-top:var(--muted)] page-column pb-[calc(env(safe-area-inset-bottom)+24px)] text-foreground"
    >
      <ScreenBackHeader
        center={
          // 꺾쇠(36px)와 날짜 글자가 상단 바 가운데에 온다. 날짜를 누르면 날짜 선택 시트가 열린다.
          <PeriodNav
            compact
            prevLabel="전날"
            nextLabel="다음 날"
            canGoNext={!isToday}
            onPrev={() => changeDate(-1, "button")}
            onNext={() => changeDate(1, "button")}
          >
            <h1 className="text-[18px] leading-5.5 font-bold text-foreground tabular-nums">
              <PeriodNavPickerButton
                onClick={() => setPickerOpen(true)}
                className="h-9 gap-1.5 p-0 text-[length:inherit] leading-[inherit] font-[inherit]"
              >
                {dayTitleWithWeekday(dateKey, true)}
              </PeriodNavPickerButton>
            </h1>
          </PeriodNav>
        }
        onBack={() => {
          slideNavigate("back", () => {
            const historyState = window.history.state as { idx?: number } | null;
            if (historyState?.idx) {
              navigate(-1);
              return;
            }
            // 스택이 비어 있으면 딥링크로 곧장 열렸거나 셸이 웹뷰를 다시 띄워 이 화면으로 복원한 것이다.
            // 입구는 기록 탭 하나라 기록 탭으로 돌려보낸다.
            const params = new URLSearchParams(location.search);
            params.delete("date");
            params.delete("from");
            const search = params.toString();
            navigate(
              {
                pathname: "/records",
                search: search === "" ? "" : `?${search}`,
              },
              { replace: true },
            );
          });
        }}
      />

      <LazyDayPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        dateKey={dateKey}
        todayKey={todayKey}
        onPick={pickDate}
      />

      <div data-testid="planner-swipe-area" className="touch-pan-y px-5" {...swipe}>
        <PlannerHead
          dday={ddayLine}
          totals={
            state.status === "success"
              ? { focusSec: state.day.focusSec, studySec: state.day.studySec }
              : state.status
          }
        />

        <div className="pt-3.5">
          {userId === null ? (
            <p className="text-sm text-muted-foreground">
              기기 등록 전이에요. 앱에서 열면 기록이 저장돼요
            </p>
          ) : state.status === "pending" || (state.status === "success" && subjectsPending) ? (
            <div className="flex gap-3.5">
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <Skeleton className="h-4.5 w-full rounded-md" />
                <Skeleton className="h-4.5 w-3/4 rounded-md" />
                <Skeleton className="h-4.5 w-full rounded-md" />
              </div>
              <Skeleton className="h-113 w-58 min-w-46 rounded-lg" />
            </div>
          ) : state.status === "error" ? (
            <ErrorState
              message="타임테이블을 불러오지 못했어요"
              onRetry={state.retry}
              screen="planner"
            />
          ) : (
            <div className="flex items-start gap-3.5">
              <PlannerSubjects
                items={daySubjectItems(
                  state.day,
                  liveSubjects.data ?? null,
                  isToday ? undefined : subjectsOnDay.data,
                  isToday,
                )}
                unassignedFocusSec={state.day.unassignedFocusSec}
                studied={state.day.paints.length > 0}
              />
              <PlannerTimetable day={state.day} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
