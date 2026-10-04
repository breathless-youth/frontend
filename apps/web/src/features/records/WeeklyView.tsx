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

import { WeekPickerSheet } from "./PeriodPickerSheet";
import { RhythmCard } from "./RhythmCard";
import { WeekCards } from "./WeekCards";
import { WeekHeader } from "./WeekHeader";
import { WeekTrendCard } from "./WeekTrendCard";
import { addDaysToDateKey } from "./recordsFormat";
import { isFutureWeek } from "./recordsPeriod";
import { useWeeklyData } from "./useWeeklyData";

/**
 * 기록 주간 탭
 *
 * 위에서부터 주 이동 → 주 요약 → 추이 카드 → 주 카드 → 나의 공부 리듬(예상 화면).
 * 실데이터가 있는 카드가 안내만 있는 카드보다 위에 온다.
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
  const goNextWeek = () => {
    if (!canGoNext) {
      return;
    }
    trackRecordsWeekChanged(1);
    setWeekAnchorKey((key) => addDaysToDateKey(key, 7));
  };
  const goPrevWeek = () => {
    trackRecordsWeekChanged(-1);
    setWeekAnchorKey((key) => addDaysToDateKey(key, -7));
  };

  return (
    <div>
      <WeekHeader
        weekAnchorKey={weekAnchorKey}
        metricsStatus={week.status}
        daily={week.status === "success" ? week.daily : undefined}
        canGoNext={canGoNext}
        onPrevWeek={goPrevWeek}
        onNextWeek={goNextWeek}
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
          setWeekAnchorKey(dateKey);
          setPickerOpen(false);
        }}
      />

      <div className="mt-[18px]">
        {week.status === "pending" && (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-[240px] w-full rounded-[20px]" />
            <Skeleton className="h-[95px] w-full rounded-[20px]" />
          </div>
        )}
        {week.status === "error" && (
          <ErrorState
            message="주간 추이를 불러오지 못했어요"
            onRetry={retryPeriod}
            screen="records"
          />
        )}
        {week.status === "success" && (
          <div className="flex flex-col gap-[18px]">
            <WeekTrendCard
              daily={week.daily}
              compareDaily={week.compareDaily}
              weekAnchorKey={weekAnchorKey}
              todayKey={todayKey}
            />
            <WeekCards daily={week.daily} />
          </div>
        )}
      </div>

      <div className="mt-6">
        <RhythmCard />
      </div>
    </div>
  );
}
