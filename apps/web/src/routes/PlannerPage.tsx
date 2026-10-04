import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ScreenBackHeader } from "@/components/ScreenBackHeader";
import { daysUntil, formatDday } from "@/features/home/ddayFormat";
import { plannerSubjectItems } from "@/features/planner/subjectItems";
import { plannerTodayKey, shiftPlannerDate } from "@/features/planner/plannerDay";
import { PlannerHead } from "@/features/planner/PlannerHead";
import { PlannerSubjects } from "@/features/planner/PlannerSubjects";
import { PlannerTimetable } from "@/features/planner/PlannerTimetable";
import type { PlannerEntry } from "@/features/planner/useOpenPlanner";
import { usePlannerDay } from "@/features/planner/usePlannerDay";
import { DayPickerSheet } from "@/features/records/PeriodPickerSheet";
import { useSubjects } from "@/features/study-session/useSubjects";
import { trackPlannerDateChanged, trackPlannerOpened } from "@/lib/amplitude";
import { ddayQuery } from "@/lib/ddayQueries";
import { slideNavigate } from "@/lib/pageTransition";
import { showToast } from "@/lib/toast";
import { useUserId } from "@/lib/userId";

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
/** 날짜 넘김 스와이프 임계(px) — 기록 탭 달력의 월 스와이프와 같은 감각이다. */
const SWIPE_THRESHOLD_PX = 48;

/**
 * 플래너(S12) — 하루를 한 장으로 본다.
 *
 * 왼쪽에 과목과 할 일, 오른쪽에 타임테이블을 나란히 두는 2열이고 카드가 없다. 플래너의 하루는
 * 05:00~다음 날 05:00이라, 새벽 0~5시에 여는 "오늘의 플래너"는 전날 플래너다.
 * 과목·할 일 관리는 오늘 플래너에서만 되고(세션 과목 시트와 같은 목록), 지난 날은 보기 전용이다.
 * 탭 바 없는 전체 화면 라우트다(`/planner?date=YYYY-MM-DD`, `lib/nativeTabBar.ts`).
 */
export function PlannerPage() {
  const userId = useUserId();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const todayKey = plannerTodayKey();
  const requested = searchParams.get("date");
  // 형식이 틀리거나 미래 날짜면 오늘 플래너를 연다.
  const dateKey =
    requested !== null && DATE_KEY_PATTERN.test(requested) && requested <= todayKey
      ? requested
      : todayKey;
  const isToday = dateKey === todayKey;

  const entry = (location.state as { via?: PlannerEntry } | null)?.via;
  const openedRef = useRef(false);
  useEffect(() => {
    if (openedRef.current) {
      return;
    }
    openedRef.current = true;
    trackPlannerOpened({ via: entry ?? "unknown", isToday });
  }, [entry, isToday]);

  const state = usePlannerDay(userId, dateKey);
  // 과목 목록은 지난 날에도 쓴다(그날 공부하지 않은 과목도 0분으로 보인다). 관리는 오늘만 된다.
  const subjects = useSubjects(userId !== null, showToast, "planner");
  const dday = useQuery({ ...ddayQuery(userId ?? 0), enabled: userId !== null });

  const changeDate = useCallback(
    (delta: -1 | 1, method: "button" | "swipe") => {
      const next = shiftPlannerDate(dateKey, delta, todayKey);
      if (next === dateKey) {
        return;
      }
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
    },
    [dateKey, location.state, setSearchParams, todayKey],
  );

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

  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
  };
  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start) {
      return;
    }
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    // 세로 위주 움직임은 페이지 스크롤 몫이다 — 가로 우세일 때만 날짜를 넘긴다.
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy)) {
      return;
    }
    changeDate(dx < 0 ? 1 : -1, "swipe");
  };

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
      className="theme-soft-blue min-h-dvh bg-muted pb-[calc(env(safe-area-inset-bottom)+24px)] text-foreground"
    >
      <ScreenBackHeader
        compact
        onBack={() => {
          slideNavigate("back", () => {
            const historyState = window.history.state as { idx?: number } | null;
            if (historyState?.idx) {
              navigate(-1);
              return;
            }
            // 딥링크로 곧장 열렸을 때의 대비 — 스택이 비어 있으면 기록 탭으로 보낸다.
            const params = new URLSearchParams(location.search);
            params.delete("date");
            const search = params.toString();
            navigate(
              { pathname: "/records", search: search === "" ? "" : `?${search}` },
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
        onPick={pickDate}
      />

      <div
        data-testid="planner-swipe-area"
        className="touch-pan-y px-5"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        <PlannerHead
          dateKey={dateKey}
          canGoNext={!isToday}
          onPrev={() => changeDate(-1, "button")}
          onNext={() => changeDate(1, "button")}
          onOpenPicker={() => setPickerOpen(true)}
          dday={ddayLine}
          readOnly={!isToday}
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
                <Skeleton className="h-[18px] w-full rounded-md" />
                <Skeleton className="h-[18px] w-3/4 rounded-md" />
                <Skeleton className="h-[18px] w-full rounded-md" />
              </div>
              <Skeleton className="h-[360px] w-[184px] rounded-lg" />
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
                  isToday,
                )}
                unassignedFocusSec={state.day.unassignedFocusSec}
                emptyMessage={
                  !isToday && state.day.studySec === 0 && state.day.completedTasks.length === 0
                    ? ["이 날은 기록이 없어요", "완료한 할 일도 없어요"]
                    : null
                }
                // 관리는 오늘 플래너에서만 — 과목 목록을 받은 뒤부터다.
                store={isToday && subjects.status === "ready" ? subjects : null}
                onNotice={showToast}
                onRetryLoad={
                  isToday && subjects.status === "error" ? () => void subjects.reload() : undefined
                }
              />
              <PlannerTimetable day={state.day} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
