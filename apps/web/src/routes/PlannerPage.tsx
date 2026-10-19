import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import type { StudySessionSummary } from "@focusmakers/types";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ScreenBackHeader } from "@/components/ScreenBackHeader";
import { daysUntil, formatDday } from "@/features/home/ddayFormat";
import { cellTapTarget } from "@/features/manual-record/manualRecord";
import { useOpenManualRecord } from "@/features/manual-record/useOpenManualRecord";
import { liveSubjectsOf } from "@/features/planner/plannerDay";
import { plannerSubjectItems } from "@/features/planner/subjectItems";
import { PlannerHead } from "@/features/planner/PlannerHead";
import { PlannerSubjects } from "@/features/planner/PlannerSubjects";
import { PlannerTimetable } from "@/features/planner/PlannerTimetable";
import { plannerEntryOf } from "@/features/planner/useOpenPlanner";
import { usePlannerDay } from "@/features/planner/usePlannerDay";
import { PeriodNav, PeriodNavPickerButton } from "@/features/records/PeriodNav";
import { DayPickerSheet } from "@/features/records/PeriodPickerSheet";
import {
  addDaysToDateKey,
  dayTitleWithWeekday,
  kstDateKey,
} from "@/features/records/recordsFormat";
import { useHorizontalSwipe } from "@/features/records/useHorizontalSwipe";
import { useSubjects } from "@/features/study-session/useSubjects";
import { trackPlannerDateChanged, trackPlannerOpened } from "@/lib/amplitude";
import { ddayQuery } from "@/lib/ddayQueries";
import { slideNavigate } from "@/lib/pageTransition";
import { dailyStatsQuery } from "@/lib/statsQueries";
import { listSubjects } from "@/lib/subjectApi";
import { showToast } from "@/lib/toast";
import { hasTokenSource, useUserId } from "@/lib/userId";

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 플래너
 *
 * 왼쪽에 과목과 할 일, 오른쪽에 타임테이블을 나란히 두는 2열이고 카드가 없다. 한 장에 담는 구간은
 * 05:00~다음 날 05:00이지만, 열 때의 "오늘"은 달력 날짜(자정 기준)다 — 기록 탭에서 고른 날짜와
 * 같은 날짜의 플래너가 열린다. 그래서 새벽 0~5시의 오늘 플래너는 타임테이블이 아직 비어 있고,
 * 그 시간의 공부는 전날 플래너에 이어진다.
 * 날짜는 지난 날과 미래로 자유롭게 넘긴다. 과목은 날짜와 무관한 목록이라 어느 날에서나 고치고,
 * 할 일은 오늘 플래너에서만 고친다 — 지난 날은 그날 완료한 것, 미래는 지금 미완료인 것을 보여 준다.
 * 탭 바 없는 전체 화면 라우트다(`/planner?date=YYYY-MM-DD`, `lib/nativeTabBar.ts`).
 */
export function PlannerPage() {
  const userId = useUserId();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const todayKey = kstDateKey();
  const requested = searchParams.get("date");
  // 날짜가 없거나 형식이 틀리면 오늘 플래너를 연다. 모양만 맞고 달력에 없는 날짜(2020-13-45)는
  // 날짜 계산을 한 바퀴 돌리면 다른 날짜가 되므로 그것으로 걸러 낸다.
  const dateKey =
    requested !== null &&
    DATE_KEY_PATTERN.test(requested) &&
    addDaysToDateKey(requested, 0) === requested
      ? requested
      : todayKey;
  const isToday = dateKey === todayKey;
  const taskMode = isToday ? "live" : dateKey < todayKey ? "completed" : "upcoming";

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
  // 과목 목록은 어느 날에서나 쓰고 고친다(그날 공부하지 않은 과목도 0분으로 보인다).
  // 목록과 오늘의 할 일은 오늘의 일간 조회에 실려 온다. 플래너를 열 때마다 새로 받는다 — 방금 고친 것이
  // 캐시된 응답에는 없다. 오늘 플래너라면 화면이 받는 그 조회 한 번을 같이 쓴다.
  const queryClient = useQueryClient();
  // useSubjects가 최신 함수를 ref로 읽어 매 렌더 새 함수여도 다시 받지 않는다.
  const loadSubjects = async () => {
    const today = await queryClient
      .fetchQuery({ ...dailyStatsQuery(userId ?? 0, todayKey), staleTime: 0 })
      .catch(() => null);
    // 대체 경로 — 일간 조회가 실패했거나 과목별 할 일을 싣지 않는 서버면 과목 목록 API로 대신한다.
    // 서버가 전부 새 응답을 주게 되면 지운다.
    return (today && liveSubjectsOf(today)) ?? listSubjects();
  };
  const subjects = useSubjects(userId !== null, showToast, "planner", loadSubjects);
  const dday = useQuery({ ...ddayQuery(userId ?? 0), enabled: userId !== null });

  // 수동 기록 API는 토큰이 있어야 해서 토큰 없는 문서에서는 입구를 모두 숨긴다.
  const canWrite = userId !== null && hasTokenSource();
  const dayIsFuture = dateKey > todayKey;
  const openManualRecord = useOpenManualRecord();

  /** 묶음 첫 조각이 시작한 날과 그 id로 연다. 앞뒤 날 조각은 입력 화면이 받아 묶음 전체를 찾는다. */
  const editBundle = (bundle: readonly StudySessionSummary[]) => {
    const first = bundle[0];
    if (first !== undefined) {
      openManualRecord({
        kind: "edit",
        dateKey: kstDateKey(new Date(first.startedAt)),
        entry: "planner_cell",
        id: first.id,
      });
    }
  };

  /** 칸 시작 시각이 속한 곳으로 정한다. 빈 칸은 추가, 수동 기록은 수정, 측정 기록과 지금 이후는 무시한다. */
  const tapCell = (cellStartMs: number) => {
    if (state.status !== "success") {
      return;
    }
    const target = cellTapTarget(cellStartMs, state.day.sessions, Date.now());
    if (target === null) {
      return;
    }
    if (target.kind === "edit") {
      editBundle(target.bundle);
      return;
    }
    // 한 장이 05시~다음 날 05시라 새벽 줄은 다음 달력 날짜의 기록이다.
    openManualRecord({
      kind: "add",
      dateKey: kstDateKey(new Date(cellStartMs)),
      entry: "planner_cell",
      startMs: cellStartMs,
    });
  };

  const changeDate = (delta: -1 | 1, method: "button" | "swipe") => {
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
      className="theme-soft-blue min-h-dvh bg-muted page-column pb-[calc(env(safe-area-inset-bottom)+24px)] text-foreground"
    >
      <ScreenBackHeader
        compact
        center={
          // 꺾쇠(36px)와 날짜 글자가 상단 바 가운데에 온다. 날짜를 누르면 날짜 선택 시트가 열린다.
          <PeriodNav
            compact
            prevLabel="전날"
            nextLabel="다음 날"
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
            // 스택이 비어 있다 — 딥링크로 곧장 열렸거나, 셸이 웹뷰를 다시 띄워 플래너로 복원했다.
            // 들어온 탭으로 돌려보낸다(홈 탭 웹뷰에서 기록 화면으로 보내면 탭과 화면이 어긋난다).
            // 어디서 왔는지 모르면 기록 탭이다.
            const params = new URLSearchParams(location.search);
            params.delete("date");
            params.delete("from");
            const search = params.toString();
            navigate(
              {
                pathname: entry === "home" ? "/home" : "/records",
                search: search === "" ? "" : `?${search}`,
              },
              { replace: true },
            );
          });
        }}
      />

      <DayPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        dateKey={dateKey}
        todayKey={todayKey}
        allowFuture
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
          ) : state.status === "pending" ? (
            <div className="flex gap-3.5">
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <Skeleton className="h-4.5 w-full rounded-md" />
                <Skeleton className="h-4.5 w-3/4 rounded-md" />
                <Skeleton className="h-4.5 w-full rounded-md" />
              </div>
              <Skeleton className="h-90 w-46 rounded-lg" />
            </div>
          ) : state.status === "error" ? (
            <ErrorState
              message="플래너를 불러오지 못했어요"
              onRetry={state.retry}
              screen="planner"
            />
          ) : (
            <div className="flex items-start gap-3.5">
              <PlannerSubjects
                items={plannerSubjectItems(
                  state.day,
                  subjects.status === "ready" ? subjects.subjects : null,
                  taskMode,
                )}
                unassignedFocusSec={state.day.unassignedFocusSec}
                studied={state.day.paints.length > 0}
                // 과목 목록을 받은 뒤부터 관리할 수 있다. 할 일은 오늘 플래너에서만 고친다.
                store={subjects.status === "ready" ? subjects : null}
                tasksEditable={isToday}
                suggestSubjects={taskMode !== "completed"}
                onNotice={showToast}
                onRetryLoad={subjects.status === "error" ? () => void subjects.reload() : undefined}
              />
              <div className="flex shrink-0 flex-col items-end gap-3">
                <PlannerTimetable
                  day={state.day}
                  onCellTap={canWrite ? tapCell : undefined}
                  onEditBundle={canWrite ? editBundle : undefined}
                />
                {canWrite && !dayIsFuture && (
                  <Button
                    variant="link"
                    onClick={() =>
                      openManualRecord({ kind: "add", dateKey, entry: "planner_button" })
                    }
                    className="h-11 gap-1.5 px-4 text-[15px] leading-4.75"
                  >
                    <Pencil aria-hidden size={16} />
                    시간 직접 입력
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
