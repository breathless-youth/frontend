import { useEffect, useRef, useState } from "react";

import type { DailyStudyStat } from "@focusmakers/types";
import { Bar, BarChart, Cell, ReferenceLine, XAxis, YAxis } from "recharts";

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

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
import { Card } from "@/components/ui/card";

/** 세로축 눈금 글자가 들어갈 폭(px) — 범례의 왼쪽 여백(`pl-8`)과 맞춘다. */
const Y_AXIS_WIDTH_PX = 32;
/** 차트 높이와 위 여백·요일 줄 높이(px) — 말풍선을 막대 바로 위에 놓을 때 막대 꼭대기 위치를 여기서 셈한다. */
const CHART_HEIGHT_PX = 176;
const CHART_MARGIN_TOP_PX = 6;
const X_AXIS_HEIGHT_PX = 20;
/** 막대 폭과 한 요일 안 두 막대 사이 간격(px) — 말풍선 꼬리가 가리킬 막대 위치도 여기서 셈한다. */
const BAR_SIZE_PX = 16;
const BAR_GAP_PX = 2;
/** 말풍선 꼬리가 말풍선 양끝에서 떨어질 최소 거리(px) — 둥근 모서리(10px)에 걸리지 않게 한다. */
const TOOLTIP_TAIL_INSET_PX = 14;
/** 말풍선 아랫변과 막대 꼭대기 사이 간격(px) — 그 사이에 꼬리가 들어간다. */
const TOOLTIP_GAP_PX = 10;
/** 누르지 않은 요일을 흐리게 하는 정도 */
const DIMMED_OPACITY = 0.35;
/**
 * 세로축 상한 후보(시간). 그 주에 보이는 값(두 주의 막대와 평균선)이 다 들어가는 가장 작은 것을 고른다 —
 * 하루 한두 시간 공부하는 주가 8시간 눈금 아래에 납작하게 깔리지 않게 한다. 가장 큰 상한을 넘는 날은
 * 거기서 잘리고 눈금을 `8h+`로 적는다.
 */
const CHART_SCALES_HOURS = [2, 4, MAX_CHART_HOURS] as const;

function chartScaleHours(points: readonly WeekTrendPoint[], averageSec: number | null): number {
  const peakSec = Math.max(
    averageSec ?? 0,
    ...points.map((point) => Math.max(point.thisWeekSec ?? 0, point.lastWeekSec ?? 0)),
  );
  return CHART_SCALES_HOURS.find((hours) => peakSec <= hours * 3600) ?? MAX_CHART_HOURS;
}

/** 막대·평균선의 높이(시간). 상한을 넘으면 상한에서 자른다. */
function clampedHours(focusSec: number, scaleHours: number): number {
  return Math.min(focusSec / 3600, scaleHours);
}

/**
 * 추이 카드 — 제목이 지난주와의 비교를 문장으로 말하고, 바로 아래 막대가 그 근거가 된다.
 *
 * 요일마다 앞 주(연한 막대)와 보는 주(진한 막대)를 나란히 두고, 보는 주의 하루 평균을 점선으로 긋는다.
 * 요일을 누르면 그 요일의 두 값이 막대 위 말풍선으로 뜬다.
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
    <Card className="flex flex-col gap-1 rounded-[20px] border-0 shadow-sb-card px-[18px] pt-[18px] pb-4">
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

      <div className="flex flex-wrap items-start gap-x-3.5 gap-y-1 pt-2.5 pl-8 text-xs leading-[14px] text-muted-foreground">
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
    </Card>
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

/** 차트 한 요일의 값 — 막대 높이는 상한에서 자른 시간이고, 말풍선은 원래 초를 적는다. */
interface TrendRow extends WeekTrendPoint {
  thisWeek: number | null;
  lastWeek: number | null;
}

/**
 * 요일별 막대 — 왼쪽이 앞 주(연한 막대), 오른쪽이 보는 주(진한 막대)다.
 * 한쪽 기록이 없으면 그 자리를 비워 둔다(아직 오지 않은 요일은 앞 주 막대만 남는다).
 * 세로축 상한은 그 주의 값에 맞춰 2·4·8시간 중에서 고르고, 8시간을 넘는 날은 상한에서 잘린다.
 *
 * 요일을 누르면 그 요일만 진하게 남고 말풍선이 두 주의 실제 값을 적는다(상한에서 잘린 날도 원래
 * 값이다). 같은 요일을 다시 누르거나 차트 밖을 누르면 닫힌다. 말풍선을 여닫는 것은 여기서 정하고
 * (`pickedIndex`), 어느 요일인지는 차트가 마지막으로 눌린 요일을 기억한다.
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
  const [pickedIndex, setPickedIndex] = useState<number | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (pickedIndex === null) {
      return;
    }
    const closeOnOutside = (event: PointerEvent) => {
      if (!chartRef.current?.contains(event.target as Node)) {
        setPickedIndex(null);
      }
    };
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, [pickedIndex]);

  // 한 주 통째로 기록이 없는 쪽은 자리도 잡지 않는다 — 남은 쪽 막대가 요일 가운데에 선다.
  const hasPrevious = points.some((point) => (point.lastWeekSec ?? 0) > 0);
  const hasCurrent = points.some((point) => (point.thisWeekSec ?? 0) > 0);
  const scaleHours = chartScaleHours(points, averageSec);
  // 눈금은 상한을 4등분한다(8 → 8h+·6h·4h·2h·0, 4 → 4h·3h·2h·1h·0, 2 → 2h·1.5h·1h·0.5h·0).
  const ticks = [0, 1, 2, 3, 4].map((step) => (scaleHours / 4) * step);
  const rows: TrendRow[] = points.map((point) => ({
    ...point,
    thisWeek: point.thisWeekSec === null ? null : clampedHours(point.thisWeekSec, scaleHours),
    lastWeek: point.lastWeekSec === null ? null : clampedHours(point.lastWeekSec, scaleHours),
  }));
  const config = {
    thisWeek: { label: currentLabel, color: "var(--primary)" },
    lastWeek: { label: previousLabel, color: "var(--chart-prev)" },
  } satisfies ChartConfig;
  /** 그 요일에 적을 값이 있는지 — 기록이 통째로 없는 주와 아직 오지 않은 요일의 보는 주는 뺀다. */
  const hasValue = (row: TrendRow) =>
    (hasCurrent && row.thisWeekSec !== null) || (hasPrevious && row.lastWeekSec !== null);
  const opacityOf = (index: number) =>
    pickedIndex !== null && pickedIndex !== index ? DIMMED_OPACITY : 1;
  // 누른 요일의 가장 높은 막대 꼭대기(차트 위쪽에서 잰 px) — 말풍선이 그 바로 위에 앉는다.
  const pickedRow = pickedIndex === null ? undefined : rows[pickedIndex];
  const pickedBarTopPx =
    CHART_MARGIN_TOP_PX +
    (CHART_HEIGHT_PX - CHART_MARGIN_TOP_PX - X_AXIS_HEIGHT_PX) *
      (1 - Math.max(pickedRow?.thisWeek ?? 0, pickedRow?.lastWeek ?? 0) / scaleHours);
  // 꼬리가 가리킬 막대 — 말풍선이 앉은 가장 높은 막대의 가운데. 두 주가 나란히 서면 막대 폭의 반과
  // 막대 사이 간격의 반만큼 요일 가운데에서 비켜 있다(앞 주는 왼쪽, 보는 주는 오른쪽).
  const pickedTallerIsPrevious = (pickedRow?.lastWeek ?? 0) > (pickedRow?.thisWeek ?? 0);
  /** 누른 요일 가운데가 말풍선 폭에서 차지하는 자리(%) — 양끝 요일일수록 말풍선이 안쪽으로 당겨진다. */
  const tailRatioPercent = (((pickedIndex ?? 0) + 0.5) / rows.length) * 100;
  const tailOffsetPx =
    hasPrevious && hasCurrent
      ? ((pickedTallerIsPrevious ? -1 : 1) * (BAR_SIZE_PX + BAR_GAP_PX)) / 2
      : 0;

  return (
    <div ref={chartRef} role="group" aria-label="요일별 순공시간" className="pt-2">
      <ChartContainer
        config={config}
        className="aspect-auto w-full"
        style={{ height: CHART_HEIGHT_PX }}
      >
        <BarChart
          accessibilityLayer
          data={rows}
          barGap={BAR_GAP_PX}
          margin={{ top: CHART_MARGIN_TOP_PX, right: 0, bottom: 0, left: 0 }}
          onClick={({ activeTooltipIndex }) => {
            const row = activeTooltipIndex === undefined ? undefined : rows[activeTooltipIndex];
            // 적을 값이 없는 요일은 눌러도 보여 줄 것이 없다.
            if (activeTooltipIndex === undefined || row === undefined || !hasValue(row)) {
              setPickedIndex(null);
              return;
            }
            setPickedIndex(pickedIndex === activeTooltipIndex ? null : activeTooltipIndex);
          }}
        >
          <YAxis
            domain={[0, scaleHours]}
            ticks={ticks}
            interval={0}
            width={Y_AXIS_WIDTH_PX}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, style: { fill: "var(--text-tertiary)" } }}
            // 상한이 주마다 달라져 단위를 붙인다(0은 단위 없이). 8시간을 넘는 날은 잘리므로 `8h+`.
            tickFormatter={(tick: number) =>
              tick === 0 ? "0" : `${String(tick)}h${tick === MAX_CHART_HOURS ? "+" : ""}`
            }
          />
          <XAxis
            dataKey="day"
            interval={0}
            height={X_AXIS_HEIGHT_PX}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tick={(tick: DayTickProps) => (
              <DayTick {...tick} pickedIndex={pickedIndex} todayIndex={todayIndex} />
            )}
          />
          <ChartTooltip
            trigger="click"
            // 다시 누르거나 밖을 눌러 닫은 뒤에는 차트가 기억하는 요일이 남아 있어도 띄우지 않는다.
            active={pickedIndex !== null}
            cursor={false}
            // 누른 요일의 가장 높은 막대 바로 위에 띄운다 — 값과 막대가 떨어져 보이지 않게 한다.
            // 가로는 차트가 누른 요일의 가운데를 주고(offset 0), 세로만 여기서 정한다. 높은 막대에서는
            // 말풍선이 차트 위로 올라가므로 차트 밖으로 나가는 것을 허용한다.
            position={{ y: pickedBarTopPx - TOOLTIP_GAP_PX }}
            offset={0}
            allowEscapeViewBox={{ x: true, y: true }}
            isAnimationActive={false}
            wrapperStyle={{ zIndex: 10 }}
            // 막대는 앞 주를 먼저 그리지만 말풍선은 범례와 같이 보는 주를 먼저 적는다.
            content={({ active, label, payload }) => (
              <div
                className="relative"
                style={{
                  // 말풍선의 아랫변을 막대 위에 맞추고, 가로는 요일 위치만큼만 당긴다 — 가운데 요일은
                  // 막대 중심에 오고 양끝 요일은 플롯 가장자리에 붙어 카드 밖으로 나가지 않는다.
                  // 꼬리가 둥근 모서리에 걸리지 않게, 꼬리 자리가 말풍선 끝에서 TOOLTIP_TAIL_INSET_PX
                  // 안쪽에 오도록 그만큼만 더 민다(아래 꼬리의 clamp와 같은 식).
                  transform: `translate(clamp(${String(tailOffsetPx + TOOLTIP_TAIL_INSET_PX)}px - 100%, ${String(-tailRatioPercent)}%, ${String(tailOffsetPx - TOOLTIP_TAIL_INSET_PX)}px), -100%)`,
                }}
              >
                {/* 꼬리 — 말풍선을 당긴 만큼 반대로 놓이고, 말풍선이 앉은 막대의 가운데를 가리킨다. */}
                <span
                  aria-hidden
                  className="absolute -bottom-1 size-2 -translate-x-1/2 rotate-45 rounded-[1px] bg-foreground"
                  style={{
                    left: `clamp(${String(TOOLTIP_TAIL_INSET_PX)}px, calc(${String(tailRatioPercent)}% + ${String(tailOffsetPx)}px), calc(100% - ${String(TOOLTIP_TAIL_INSET_PX)}px))`,
                  }}
                />
                <ChartTooltipContent
                  active={active}
                  label={label as string}
                  // 공용 말풍선을 앱의 어두운 말풍선으로 덮어쓴다(배경·글자색 반전, 테두리·그림자 없음).
                  className="min-w-0 gap-0.5 rounded-[10px] border-0 bg-foreground px-2.5 py-2 leading-4 whitespace-nowrap text-background shadow-none"
                  labelClassName="font-bold"
                  payload={payload
                    ?.filter((item) => item.dataKey === "thisWeek")
                    .concat(payload.filter((item) => item.dataKey !== "thisWeek"))}
                  labelFormatter={(day: string) => `${day}요일`}
                  formatter={(_value, _name, item) => {
                    const row = item.payload as TrendRow;
                    const series = item.dataKey === "lastWeek" ? "lastWeek" : "thisWeek";
                    const focusSec = series === "thisWeek" ? row.thisWeekSec : row.lastWeekSec;
                    return (
                      <div className="flex flex-1 items-center justify-between gap-2.5">
                        <span className="flex items-center gap-1.5">
                          <span
                            aria-hidden
                            className="size-2 shrink-0 rounded-[2px]"
                            style={{ backgroundColor: `var(--color-${series})` }}
                          />
                          <span className="opacity-70">{config[series].label}</span>
                        </span>
                        <span className="font-semibold tabular-nums">
                          {formatDuration(focusSec ?? 0)}
                        </span>
                      </div>
                    );
                  }}
                />
              </div>
            )}
          />
          {hasPrevious && (
            <Bar
              dataKey="lastWeek"
              className="trend-prev"
              fill="var(--color-lastWeek)"
              barSize={BAR_SIZE_PX}
              radius={[4, 4, 0, 0]}
              minPointSize={minBarHeight}
              isAnimationActive={false}
            >
              {rows.map((row, index) => (
                <Cell key={row.day} fillOpacity={opacityOf(index)} />
              ))}
            </Bar>
          )}
          {hasCurrent && (
            <Bar
              dataKey="thisWeek"
              className="trend-current"
              fill="var(--color-thisWeek)"
              barSize={BAR_SIZE_PX}
              radius={[4, 4, 0, 0]}
              minPointSize={minBarHeight}
              isAnimationActive={false}
            >
              {rows.map((row, index) => (
                <Cell key={row.day} fillOpacity={opacityOf(index)} />
              ))}
            </Bar>
          )}
          {/* 공부한 날이 없으면 평균선은 바닥(0)에 붙는다. */}
          <ReferenceLine
            y={averageSec === null ? 0 : clampedHours(averageSec, scaleHours)}
            stroke="var(--muted-foreground)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            strokeOpacity={pickedIndex === null ? 1 : DIMMED_OPACITY}
          />
        </BarChart>
      </ChartContainer>

      {/* 차트는 그림이라 값을 표로도 둔다 — 화면 낭독기가 요일별 값을 읽는다. */}
      <table className="sr-only">
        <caption>요일별 순공시간</caption>
        <thead>
          <tr>
            <td />
            {hasCurrent && <th>{currentLabel}</th>}
            {hasPrevious && <th>{previousLabel}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.day}>
              <th scope="row">{row.day}</th>
              {hasCurrent && (
                <td>{row.thisWeekSec === null ? "기록 없음" : formatDuration(row.thisWeekSec)}</td>
              )}
              {hasPrevious && (
                <td>{row.lastWeekSec === null ? "기록 없음" : formatDuration(row.lastWeekSec)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 0보다 큰 값은 아무리 작아도 2px은 보이게 한다. 0인 날은 막대를 그리지 않는다. */
function minBarHeight(value: number | undefined | null): number {
  return value !== null && value !== undefined && value > 0 ? 2 : 0;
}

interface DayTickProps {
  x: number;
  y: number;
  payload: { value: string; index: number };
}

/**
 * 요일 라벨 — 누른 요일은 브랜드색, 진행 중인 주의 오늘은 굵게 적는다.
 * 색은 인라인 style로 준다(차트 컨테이너가 눈금 글자색을 클래스로 고정해 클래스로는 못 이긴다).
 */
function DayTick({
  x,
  y,
  payload,
  pickedIndex,
  todayIndex,
}: DayTickProps & { pickedIndex: number | null; todayIndex: number | null }) {
  const picked = payload.index === pickedIndex;
  const emphasized = picked || payload.index === todayIndex;
  return (
    <text
      x={x}
      y={y}
      dy={12}
      textAnchor="middle"
      data-emphasis={picked ? "picked" : emphasized ? "today" : undefined}
      style={{
        fill: picked
          ? "var(--primary)"
          : emphasized
            ? "var(--foreground)"
            : "var(--muted-foreground)",
        fontWeight: emphasized ? 700 : 400,
      }}
    >
      {payload.value}
    </text>
  );
}
