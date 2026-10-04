import type { DailyStudyStat } from "@focusmakers/types";

import { formatDuration, MONDAY_FIRST_WEEKDAY_LABELS, mondayIndexOfDateKey } from "./recordsFormat";
import {
  averageFocusSecPerStudiedDay,
  MAX_CHART_HOURS,
  relativeWeekLabel,
  weekComparison,
  weekTrendPoints,
  type WeekComparison,
  type WeekTrendPoint,
} from "./recordsPeriod";

/** 플롯 높이(px) — 세로축 맨 위 눈금이 이 높이다. */
const PLOT_HEIGHT_PX = 150;
/**
 * 세로축 상한 후보(시간). 그 주에 보이는 값(두 주의 막대와 평균선)이 다 들어가는 가장 작은 것을 고른다 —
 * 하루 한두 시간 공부하는 주가 8시간 눈금 아래에 납작하게 깔리지 않게 한다. 가장 큰 상한을 넘는 날은
 * 거기서 잘리고 눈금을 `8+`로 적는다.
 */
const CHART_SCALES_HOURS = [2, 4, MAX_CHART_HOURS] as const;

function chartScaleHours(points: readonly WeekTrendPoint[], averageSec: number | null): number {
  const peakSec = Math.max(
    averageSec ?? 0,
    ...points.map((point) => Math.max(point.thisWeekSec ?? 0, point.lastWeekSec ?? 0)),
  );
  return CHART_SCALES_HOURS.find((hours) => peakSec <= hours * 3600) ?? MAX_CHART_HOURS;
}

function heightPercent(focusSec: number, scaleHours: number): number {
  return Math.min(focusSec / 3600 / scaleHours, 1) * 100;
}

/**
 * 추이 카드 — 제목이 지난주와의 비교를 문장으로 말하고, 바로 아래 막대가 그 근거가 된다.
 *
 * 요일마다 앞 주(연한 막대)와 보는 주(진한 막대)를 나란히 두고, 보는 주의 하루 평균을 점선으로 긋는다.
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
  const averageSec = averageFocusSecPerStudiedDay(daily);

  return (
    <div className="flex flex-col gap-1 rounded-[20px] bg-muted px-[18px] pt-[18px] pb-4 shadow-sb-card">
      <p className="text-[17px] leading-6 font-bold text-foreground">
        <CompareSentence comparison={comparison} />
      </p>
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {compareCaption(comparison, todayKey, currentLabel, previousLabel)}
      </p>

      <WeekTrendBars
        points={points}
        todayIndex={todayIndex}
        currentLabel={currentLabel}
        previousLabel={previousLabel}
        averageSec={averageSec}
      />

      <div className="flex flex-wrap items-start gap-x-3.5 gap-y-1 pt-2.5 pl-7 text-xs leading-[14px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-[2px] bg-primary" />
          {currentLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-[2px] bg-chart-prev" />
          {previousLabel}
        </span>
        <span className="flex items-center gap-1.5 tabular-nums">
          <span
            aria-hidden
            className="w-3 border-t-[1.5px] border-dashed border-muted-foreground"
          />
          하루 평균
          <span>{formatDuration(averageSec ?? 0)}</span>
        </span>
      </div>
    </div>
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
  todayKey: string,
  currentLabel: string,
  previousLabel: string,
): string {
  switch (comparison.kind) {
    case "delta":
      return comparison.inProgress
        ? `지난주 ${MONDAY_FIRST_WEEKDAY_LABELS[mondayIndexOfDateKey(todayKey)]!}요일까지와 비교했어요`
        : // 과거 주는 보고 있는 주를 기준으로 말한다(지난주를 보면 `1주 전을 기준으로`).
          `${currentLabel}을 기준으로 비교했어요`;
    case "no-previous":
      return `${previousLabel} 기록이 없어 비교하지 않아요`;
    case "no-current":
      return `${previousLabel} 막대만 보여드려요`;
    case "empty":
      return comparison.inProgress
        ? "집중을 시작하면 요일별로 쌓여요"
        : "이 주와 그 앞 주 모두 기록이 없어요";
  }
}

/**
 * 요일별 막대 — 왼쪽이 앞 주(연한 막대), 오른쪽이 보는 주(진한 막대)다.
 * 한쪽 기록이 없으면 그 자리를 비워 둔다(아직 오지 않은 요일은 앞 주 막대만 남는다).
 * 세로축 상한은 그 주의 값에 맞춰 2·4·8시간 중에서 고르고, 8시간을 넘는 날은 상한에서 잘린다.
 */
function WeekTrendBars({
  points,
  todayIndex,
  currentLabel,
  previousLabel,
  averageSec,
}: {
  points: readonly WeekTrendPoint[];
  todayIndex: number | null;
  currentLabel: string;
  previousLabel: string;
  /** 보는 주의 하루 평균 순공(초) — 점선으로 긋는다. 공부한 날이 없으면 `null`. */
  averageSec: number | null;
}) {
  // 한 주 통째로 기록이 없는 쪽은 자리도 잡지 않는다 — 남은 쪽 막대가 요일 가운데에 선다.
  const hasPrevious = points.some((point) => (point.lastWeekSec ?? 0) > 0);
  const hasCurrent = points.some((point) => (point.thisWeekSec ?? 0) > 0);
  const scaleHours = chartScaleHours(points, averageSec);
  // 눈금은 상한을 4등분한다(8 → 8+·6·4·2·0, 4 → 4·3·2·1·0, 2 → 2·1.5·1·0.5·0).
  const ticks = [4, 3, 2, 1, 0].map((step) => (scaleHours / 4) * step);
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
      className="flex w-full items-start gap-1.5 pt-3.5"
    >
      <div
        aria-hidden
        className="relative w-[22px] shrink-0 text-[11px] leading-3 text-text-tertiary tabular-nums"
        style={{ height: PLOT_HEIGHT_PX }}
      >
        {ticks.map((tick) => (
          <span
            key={tick}
            className="absolute right-0"
            style={{ top: ((scaleHours - tick) / scaleHours) * PLOT_HEIGHT_PX - 6 }}
          >
            {tick === MAX_CHART_HOURS ? `${String(tick)}+` : tick}
          </span>
        ))}
      </div>

      <div aria-hidden className="flex min-w-0 flex-1 flex-col">
        <div
          className="relative flex items-start border-b border-border pb-px"
          style={{ height: PLOT_HEIGHT_PX }}
        >
          {points.map((point) => (
            <div
              key={point.day}
              className="flex h-full min-w-0 flex-1 items-end justify-center gap-0.5"
            >
              {hasPrevious && (
                <TrendBar
                  testId={`trend-prev-${point.day}`}
                  focusSec={point.lastWeekSec}
                  scaleHours={scaleHours}
                  className="bg-chart-prev"
                />
              )}
              {hasCurrent && (
                <TrendBar
                  testId={`trend-current-${point.day}`}
                  focusSec={point.thisWeekSec}
                  scaleHours={scaleHours}
                  className="bg-primary"
                />
              )}
            </div>
          ))}
          {/* 공부한 날이 없으면 평균선은 바닥(0)에 붙는다. */}
          <span
            data-testid={averageSec === null ? undefined : "trend-average-line"}
            className="absolute inset-x-0 border-t-[1.5px] border-dashed border-muted-foreground"
            style={{
              bottom: `${String(averageSec === null ? 0 : heightPercent(averageSec, scaleHours))}%`,
            }}
          />
        </div>
        <div className="flex pt-1.5 text-center text-xs leading-[14px]">
          {points.map((point, index) => (
            <span
              key={point.day}
              className={
                index === todayIndex
                  ? "min-w-0 flex-1 font-bold text-foreground"
                  : "min-w-0 flex-1 text-muted-foreground"
              }
            >
              {point.day}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 막대 한 개 — 기록이 없으면 자리만 차지한다(두 막대의 위치가 요일마다 같게). */
function TrendBar({
  testId,
  focusSec,
  scaleHours,
  className,
}: {
  testId: string;
  focusSec: number | null;
  scaleHours: number;
  className: string;
}) {
  if (focusSec === null || focusSec <= 0) {
    return <span className="w-4 shrink-0" />;
  }
  return (
    <span
      data-testid={testId}
      className={`min-h-0.5 w-4 shrink-0 rounded-t-[4px] ${className}`}
      style={{ height: `${String(heightPercent(focusSec, scaleHours))}%` }}
    />
  );
}
