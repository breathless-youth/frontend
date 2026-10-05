import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import {
  trackRecordsPeriodPicked,
  trackRecordsPeriodPickerOpened,
  trackRecordsWeekChanged,
} from "@/lib/amplitude";

import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

import { WeekPickerSheet } from "./PeriodPickerSheet";
import { RhythmCard } from "./RhythmCard";
import { WeekHeader } from "./WeekHeader";
import { WeekTrendCard } from "./WeekTrendCard";
import { useHorizontalSwipe } from "./useHorizontalSwipe";
import { addDaysToDateKey } from "./recordsFormat";
import { isFutureWeek } from "./recordsPeriod";
import { useWeeklyData } from "./useWeeklyData";

/**
 * 기록 주간 탭
 *
 * 위에서부터 주 이동 → 주 요약 → 추이 카드 → 나의 공부 리듬(예상 화면).
 *
 * 데이터 배선은 `useWeeklyData`가 소유하고 여기서는 상태만 분리해 그린다.
 * - 주 이동은 `weekAnchorKey`(초기 오늘)를 ±7일씩 옮긴다. 오늘이 속한 주가 끝이다.
 * - 주 데이터가 pending/error여도 헤더의 네비·범위 라벨은 항상 보인다. 숫자는 pending이면
 *   자리표시, error면 감춘다(빈 배열을 확정값처럼 그리지 않는다).
 * - period 조회 상태는 retry 함수를 노출하지 않으므로(RecordsPeriodState) refetch로 되돌린다.
 */
export function WeeklyView({
  userId,
  todayKey,
  weekAnchorKey,
  setWeekAnchorKey,
}: {
  userId: number;
  todayKey: string;
  // 보고 있는 주는 탭을 왕복해도 유지되도록 RecordsPage가 소유하고 내려준다.
  weekAnchorKey: string;
  setWeekAnchorKey: Dispatch<SetStateAction<string>>;
}) {
  const queryClient = useQueryClient();
  const { week } = useWeeklyData(userId, weekAnchorKey);
  const [pickerOpen, setPickerOpen] = useState(false);

  const retryPeriod = () => {
    void queryClient.refetchQueries({ queryKey: ["stats", "period"] });
  };

  // 다음 주가 미래(그 주 월요일이 오늘 이후)면 더 넘어가지 않는다 — 일간 달력이 미래 달을 막는 것과 같은 취지.
  const canGoNext = !isFutureWeek(addDaysToDateKey(weekAnchorKey, 7), todayKey);
  // 마지막 주 이동 방향 — 추이 카드가 그 방향에서 밀려 들어온다(일간 달력과 같은 모션). 첫 진입과
  // 시트로 건너뛴 이동에는 움직이지 않는다.
  const [slideFrom, setSlideFrom] = useState<"left" | "right" | null>(null);
  // 화살표와 카드 스와이프가 같은 경로를 타야 모션·계측이 갈라지지 않는다.
  const changeWeek = (delta: -1 | 1, method: "button" | "swipe") => {
    if (delta === 1 && !canGoNext) {
      return;
    }
    trackRecordsWeekChanged(delta, method);
    setSlideFrom(delta < 0 ? "left" : "right");
    setWeekAnchorKey((key) => addDaysToDateKey(key, delta * 7));
  };
  const swipe = useHorizontalSwipe((delta) => changeWeek(delta, "swipe"));

  return (
    <div>
      <WeekHeader
        weekAnchorKey={weekAnchorKey}
        metricsStatus={week.status}
        daily={week.status === "success" ? week.daily : undefined}
        canGoNext={canGoNext}
        onPrevWeek={() => changeWeek(-1, "button")}
        onNextWeek={() => changeWeek(1, "button")}
        onOpenPicker={() => {
          trackRecordsPeriodPickerOpened("weekly");
          setPickerOpen(true);
        }}
      />

      <WeekPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        weekAnchorKey={weekAnchorKey}
        todayKey={todayKey}
        onPick={(dateKey, toToday) => {
          trackRecordsPeriodPicked({ view: "weekly", toToday });
          setSlideFrom(null);
          setWeekAnchorKey(dateKey);
          setPickerOpen(false);
        }}
      />

      <div className="mt-5">
        {week.status === "pending" && <Skeleton className="h-[296px] w-full rounded-[20px]" />}
        {week.status === "error" && (
          <ErrorState
            message="주간 추이를 불러오지 못했어요"
            onRetry={retryPeriod}
            screen="records"
          />
        )}
        {week.status === "success" && (
          // 좌우로 밀면 주를 넘긴다(일간 달력과 같은 판정). 주가 바뀔 때마다 리마운트해 밀려 들어오는
          // 모션을 재생하고, 열려 있던 요일 말풍선도 닫는다.
          <div
            key={weekAnchorKey}
            data-testid="week-trend-swipe-area"
            className={cn(
              "touch-pan-y",
              slideFrom === "right" &&
                "animate-[month-slide-from-right_200ms_ease-out] motion-reduce:animate-none",
              slideFrom === "left" &&
                "animate-[month-slide-from-left_200ms_ease-out] motion-reduce:animate-none",
            )}
            {...swipe}
          >
            <WeekTrendCard
              daily={week.daily}
              compareDaily={week.compareDaily}
              weekAnchorKey={weekAnchorKey}
              todayKey={todayKey}
            />
          </div>
        )}
      </div>

      <RhythmCard />
    </div>
  );
}
