import type { DailyStudyStat } from "@focusmakers/types";

import {
  addDaysToDateKey,
  formatDuration,
  MONDAY_FIRST_WEEKDAY_LABELS,
  mondayIndexOfDateKey,
} from "./recordsFormat";
import {
  MAX_CHART_HOURS,
  relativeWeekLabel,
  weekComparison,
  weekRangeLabel,
  weekTrendPoints,
  type WeekComparison,
  type WeekTrendPoint,
} from "./recordsPeriod";

/** 세로축 눈금(시간) — 고정이라 주끼리 비교된다. 맨 위는 `8+`로 적는다. */
const Y_TICKS = [8, 6, 4, 2, 0] as const;
/** 플롯 높이(px) — 8시간이 이 높이다(Figma 시안 98px). */
const PLOT_HEIGHT_PX = 98;
/** 플롯 위 여백(px) — 맨 위 눈금 글자가 잘리지 않을 만큼. */
const PLOT_TOP_PX = 14;

function barHeightPercent(focusSec: number): number {
  return Math.min(focusSec / 3600 / MAX_CHART_HOURS, 1) * 100;
}

/**
 * 추이 카드 — 제목이 지난주와의 비교를 문장으로 말하고, 바로 아래 막대가 그 근거가 된다.
 *
 * 차트 안에서는 탭·선택이 없다(툴팁 없음). 값은 대체 텍스트가 읽어 준다.
 */
export function WeekTrendCard({
  daily,
  compareDaily,
  weekAnchorKey,
  todayKey,
}: {
  daily: readonly DailyStudyStat[];
  compareDaily: readonly DailyStudyStat[];
  weekAnchorKey: string;
  todayKey: string;
}) {
  const comparison = weekComparison(daily, compareDaily, weekAnchorKey, todayKey);
  const points = weekTrendPoints(daily, compareDaily, todayKey);
  const todayIndex = comparison.inProgress ? mondayIndexOfDateKey(todayKey) : null;
  const currentLabel = relativeWeekLabel(weekAnchorKey, todayKey);
  const previousLabel = relativeWeekLabel(weekAnchorKey, todayKey, 1);

  return (
    <div className="rounded-[20px] bg-muted px-[18px] pt-[18px] pb-3.5 shadow-sb-card">
      <p className="text-base leading-[21px] font-bold text-foreground">
        <CompareSentence comparison={comparison} />
      </p>
      <p className="text-[11.5px] leading-[15px] text-text-tertiary">
        {compareCaption(comparison, weekAnchorKey, todayKey)}
      </p>

      <WeekTrendBars
        points={points}
        todayIndex={todayIndex}
        currentLabel={currentLabel}
        previousLabel={previousLabel}
      />

      <div className="flex items-center justify-end gap-3.5 pt-1.5">
        <LegendItem swatchClassName="bg-primary" label={currentLabel} />
        <LegendItem swatchClassName="bg-chart-prev" label={previousLabel} />
      </div>
    </div>
  );
}

function LegendItem({ swatchClassName, label }: { swatchClassName: string; label: string }) {
  return (
    <span className="flex items-center gap-[5px]">
      <span className={`size-2.5 rounded-[3px] ${swatchClassName}`} aria-hidden />
      <span className="text-[11px] leading-[14px] text-muted-foreground">{label}</span>
    </span>
  );
}

/**
 * 비교 문장 — 문장의 "지난주"는 보는 주의 바로 앞 주를 뜻한다(과거 주에서도 문장은 고정).
 * 덜 공부한 주는 델타를 비집중 주황으로 칠한다. 차이가 없을 때의 별도 문구는 두지 않는다.
 */
function CompareSentence({ comparison }: { comparison: WeekComparison }) {
  switch (comparison.kind) {
    case "delta": {
      const less = comparison.deltaSec < 0;
      const verb = comparison.inProgress ? "공부하는 중" : "공부했어요";
      return (
        <>
          지난주보다{" "}
          <span className={less ? "text-state-distract" : "text-primary"}>
            {formatDuration(Math.abs(comparison.deltaSec))}
          </span>{" "}
          {less ? "덜" : "더"} {verb}
        </>
      );
    }
    case "no-previous":
      return comparison.inProgress ? (
        <>
          이번 주 <span className="text-primary">{formatDuration(comparison.totalSec)}</span>{" "}
          공부하는 중
        </>
      ) : (
        <>
          이 주에 <span className="text-primary">{formatDuration(comparison.totalSec)}</span>{" "}
          공부했어요
        </>
      );
    case "no-current":
      return comparison.inProgress ? "이번 주 기록이 아직 없어요" : "이 주는 기록이 없어요";
    case "empty":
      return "아직 기록이 없어요";
  }
}

function compareCaption(
  comparison: WeekComparison,
  weekAnchorKey: string,
  todayKey: string,
): string {
  const previousRange = weekRangeLabel(addDaysToDateKey(weekAnchorKey, -7));
  switch (comparison.kind) {
    case "delta":
      return comparison.inProgress
        ? `지난주 ${MONDAY_FIRST_WEEKDAY_LABELS[mondayIndexOfDateKey(todayKey)]!}요일까지와 비교했어요`
        : `바로 앞 주(${previousRange})와 한 주 전체끼리 비교했어요`;
    case "no-previous":
      return comparison.inProgress
        ? "지난주 기록이 없어 비교하지 않아요"
        : "바로 앞 주 기록이 없어 비교하지 않아요";
    case "no-current":
      return comparison.inProgress
        ? "지난주 막대만 보여요 · 공부를 시작하면 비교가 시작돼요"
        : `바로 앞 주(${previousRange}) 막대만 보여요`;
    case "empty":
      return comparison.inProgress
        ? "첫 공부를 시작하면 이번 주 추이가 그려져요"
        : "이 주와 바로 앞 주 모두 기록이 없어요";
  }
}

/**
 * 요일별 막대 — 지난주는 넓고 연한 막대, 이번 주는 그 위에 겹친 좁은 막대.
 * 아직 오지 않은 요일은 지난주 막대만 남는다. 8시간을 넘는 날은 상한에서 잘린다.
 */
function WeekTrendBars({
  points,
  todayIndex,
  currentLabel,
  previousLabel,
}: {
  points: readonly WeekTrendPoint[];
  todayIndex: number | null;
  currentLabel: string;
  previousLabel: string;
}) {
  const summary = points
    .map((point) => {
      const current =
        point.thisWeekSec === null ? "" : ` ${currentLabel} ${formatDuration(point.thisWeekSec)}`;
      const previous =
        point.lastWeekSec === null ? "" : ` ${previousLabel} ${formatDuration(point.lastWeekSec)}`;
      return `${point.day}${current}${previous}`;
    })
    .join(", ");

  return (
    <div
      role="img"
      aria-label={`요일별 순공시간. ${summary}`}
      className="relative h-[152px] w-full"
    >
      {Y_TICKS.map((tick) => (
        <span
          key={tick}
          aria-hidden
          className="absolute left-0 w-[18px] text-right text-[10px] leading-3 text-text-tertiary tabular-nums"
          style={{
            top: PLOT_TOP_PX + ((MAX_CHART_HOURS - tick) / MAX_CHART_HOURS) * PLOT_HEIGHT_PX - 6,
          }}
        >
          {tick === MAX_CHART_HOURS ? `${String(tick)}+` : tick}
        </span>
      ))}
      <div
        aria-hidden
        className="absolute right-[3px] left-[27px] h-px bg-border"
        style={{ top: PLOT_TOP_PX + PLOT_HEIGHT_PX }}
      />
      <div
        aria-hidden
        className="absolute right-[3px] left-[27px] grid grid-cols-7"
        style={{ top: PLOT_TOP_PX, height: PLOT_HEIGHT_PX }}
      >
        {points.map((point) => (
          <div key={point.day} className="relative">
            {point.lastWeekSec !== null && point.lastWeekSec > 0 && (
              <span
                data-testid={`trend-prev-${point.day}`}
                className="absolute bottom-0 left-1/2 min-h-0.5 w-[30px] max-w-[72%] -translate-x-1/2 rounded-t-[5px] bg-chart-prev"
                style={{ height: `${String(barHeightPercent(point.lastWeekSec))}%` }}
              />
            )}
            {point.thisWeekSec !== null && point.thisWeekSec > 0 && (
              <span
                data-testid={`trend-current-${point.day}`}
                className="absolute bottom-0 left-1/2 min-h-0.5 w-5 max-w-[48%] -translate-x-1/2 rounded-t-xs bg-primary"
                style={{ height: `${String(barHeightPercent(point.thisWeekSec))}%` }}
              />
            )}
          </div>
        ))}
      </div>
      <div
        aria-hidden
        className="absolute top-[130px] right-[3px] left-[27px] grid grid-cols-7 text-center text-[11px] leading-[14px]"
      >
        {points.map((point, index) => (
          <span
            key={point.day}
            className={
              index === todayIndex
                ? "font-bold text-primary"
                : todayIndex !== null && index > todayIndex
                  ? "font-medium text-text-tertiary"
                  : "font-medium text-muted-foreground"
            }
          >
            {point.day}
          </span>
        ))}
      </div>
    </div>
  );
}
