import type { DailyStudyStat } from "@focusmakers/types";

import { IconChevronDown, IconChevronLeft, IconChevronRight } from "./icons";
import { PeriodHeadline } from "./PeriodHeadline";
import { sumFocusSec, sumStudySec, weekRangeLabel } from "./recordsPeriod";

/**
 * 주간 뷰 헤더 — 주 이동과 그 주의 순공시간·총 공부시간.
 *
 * 머리는 일간 탭과 같은 꼴(`PeriodHeadline`)이고 과거 주를 봐도 라벨이 바뀌지 않는다.
 * 지난주와의 비교는 여기 두지 않는다 — 추이 카드 제목이 문장으로 말한다.
 */
export function WeekHeader({
  weekAnchorKey,
  metricsStatus,
  daily,
  canGoNext,
  onPrevWeek,
  onNextWeek,
  onOpenPicker,
}: {
  weekAnchorKey: string;
  /** 숫자 영역의 상태. success일 때만 daily로 숫자를 그린다. */
  metricsStatus: "pending" | "error" | "success";
  daily?: readonly DailyStudyStat[];
  /** 오늘이 속한 주가 끝이다 — 그 주에서는 다음 주 버튼이 비활성이다. */
  canGoNext: boolean;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  /** 주 범위 라벨을 탭했다 — 기간 선택 시트를 연다. */
  onOpenPicker: () => void;
}) {
  return (
    <div className="flex flex-col items-center">
      {/* 버튼의 탭 영역은 44px이고, 음수 여백으로 자리만 시안 크기(꺾쇠 20 · 라벨 28)로 줄인다. */}
      <div className="flex items-center justify-center gap-1.5 pt-4">
        <button
          type="button"
          aria-label="이전 주"
          onClick={onPrevWeek}
          className="-mx-3 -my-2 flex size-11 items-center justify-center"
        >
          <IconChevronLeft size={13} color="var(--color-foreground)" />
        </button>
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={onOpenPicker}
          className="-my-2 flex h-11 items-center gap-[5px] px-2.5 text-[15px] font-bold text-foreground"
        >
          {weekRangeLabel(weekAnchorKey)}
          <IconChevronDown color="var(--color-foreground)" />
        </button>
        <button
          type="button"
          aria-label="다음 주"
          disabled={!canGoNext}
          onClick={onNextWeek}
          className="-mx-3 -my-2 flex size-11 items-center justify-center disabled:cursor-not-allowed"
        >
          <IconChevronRight
            size={13}
            color={canGoNext ? "var(--color-foreground)" : "var(--color-text-tertiary)"}
          />
        </button>
      </div>

      {/* 오류 시 확정값처럼 보일 숫자를 아예 안 그린다(범위·네비만 남는다). */}
      {metricsStatus !== "error" && (
        <PeriodHeadline
          label="주간 순공시간"
          totals={
            metricsStatus === "success"
              ? { focusSec: sumFocusSec(daily ?? []), studySec: sumStudySec(daily ?? []) }
              : "pending"
          }
        />
      )}
    </div>
  );
}
