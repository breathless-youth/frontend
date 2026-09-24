import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";

import { MonthTiles } from "./MonthTiles";
import { RhythmCard } from "./RhythmCard";
import { WeekHeader } from "./WeekHeader";
import { WeekTrendChart } from "./WeekTrendChart";
import { addDaysToDateKey, kstDateKey, monthOfDateKey } from "./recordsFormat";
import { useWeeklyData } from "./useWeeklyData";

/**
 * 기록 주간 탭
 *
 * 데이터 배선은 `useWeeklyData`가 소유하고 여기서는 상태만 분리해 그린다.
 * - 주 이동은 `weekAnchorKey`(초기 오늘)를 ±7일씩 옮긴다.
 * - "이 달" 카드는 주 이동과 무관하게 오늘이 속한 달 고정이라 `month`는 오늘 기준으로만 계산한다.
 * - 주 데이터가 pending/error여도 헤더의 네비·범위 라벨은 항상 보인다. 순공·증감 숫자는
 *   `WeekHeader`가 `metricsStatus`로 갈라 pending이면 Skeleton, error면 감춘다(빈 배열을
 *   확정값처럼 그리지 않는다).
 * - period 조회 상태는 retry 함수를 노출하지 않으므로(RecordsPeriodState) refetch로 되돌린다.
 * TODO: `RhythmCard`는 준비 중 고정이라 데이터와 무관하게 항상 표시한다.
 */

export function WeeklyView({ userId }: { userId: number }) {
  const todayKey = kstDateKey();
  const [weekAnchorKey, setWeekAnchorKey] = useState(todayKey);
  const month = monthOfDateKey(todayKey);
  const queryClient = useQueryClient();

  const { week, month: monthState } = useWeeklyData(userId, weekAnchorKey, month);

  const retryPeriod = () => {
    void queryClient.refetchQueries({ queryKey: ["stats", "period"] });
  };

  return (
    <div>
      <WeekHeader
        weekAnchorKey={weekAnchorKey}
        metricsStatus={week.status}
        daily={week.status === "success" ? week.daily : undefined}
        compareDaily={week.status === "success" ? week.compareDaily : undefined}
        onPrevWeek={() => setWeekAnchorKey((key) => addDaysToDateKey(key, -7))}
        onNextWeek={() => setWeekAnchorKey((key) => addDaysToDateKey(key, 7))}
      />

      <div className="mt-6">
        {week.status === "pending" && <Skeleton className="h-[180px] w-full rounded-[20px]" />}
        {week.status === "error" && (
          <ErrorState
            message="주간 추이를 불러오지 못했어요"
            onRetry={retryPeriod}
            screen="records"
          />
        )}
        {week.status === "success" && (
          <WeekTrendChart daily={week.daily} compareDaily={week.compareDaily} todayKey={todayKey} />
        )}
      </div>

      <div className="mt-6">
        <RhythmCard />
      </div>

      <div className="mt-6">
        {monthState.status === "pending" && <Skeleton className="h-[104px] rounded-[20px]" />}
        {monthState.status === "error" && (
          <ErrorState
            message="이 달 기록을 불러오지 못했어요"
            onRetry={retryPeriod}
            screen="records"
          />
        )}
        {monthState.status === "success" && (
          <MonthTiles daily={monthState.daily} month={month} todayKey={todayKey} />
        )}
      </div>
    </div>
  );
}
