import type { ComponentProps, ReactElement } from "react";
import type { DailyStudyStat } from "@focusmakers/types";
import { Area, type AreaProps, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  type ChartConfig,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

import { formatDuration } from "./recordsFormat";
import {
  MAX_CHART_HOURS,
  type WeekTrendRow,
  buildWeekTrendRows,
  weekTrendPoints,
  weekTrendTooltipDuration,
} from "./recordsPeriod";

/**
 * 주간 추이 영역차트 (선 + 선 아래 그라데이션 채움)
 *
 * 이번 주·지난주의 하루치 순공시간을 시간 단위로 겹쳐 그린다. 값 계산(요일별 정렬·clamp·미래
 * 날짜 제외)은 `recordsPeriod`의 순수 함수가 하고 여기서는 그리기만 한다.
 *
 * y축은 0~12시간 고정이고 12를 넘으면 값은 12로 clamp하되 눈금 라벨만 `12+`로 적는다
 * 축이 튀지 않게 하면서 상한 초과를 알린다.
 */

const chartConfig = {
  thisWeek: { label: "이번 주", color: "var(--primary)" },
  // 지난주는 더 연한 tertiary — 선·하단 그라데이션·범례 점이 모두 이 색(--color-lastWeek)을 따른다.
  lastWeek: { label: "지난주", color: "var(--text-tertiary)" },
} satisfies ChartConfig;

interface DotProps {
  cx?: number;
  cy?: number;
  index?: number;
}

/** 범례 표기 순서 — 겹침(Area) 순서와 무관하게 chartConfig 키 순서(이번 주 → 지난주)로 고정. */
const LEGEND_ORDER = Object.keys(chartConfig);

/**
 * 범례를 chartConfig 순서로 정렬해 그린다.
 *
 * Area는 겹침 때문에 지난주를 먼저 렌더하므로 recharts가 주는 범례 payload도 "지난주 → 이번 주"다.
 * 겹침 순서는 유지하되(이번 주가 위), 범례만 dataKey를 chartConfig 순서로 재정렬한다.
 */
function OrderedChartLegend(props: ComponentProps<typeof ChartLegendContent>): ReactElement {
  const ordered = props.payload
    ? [...props.payload].sort(
        (a, b) => LEGEND_ORDER.indexOf(String(a.dataKey)) - LEGEND_ORDER.indexOf(String(b.dataKey)),
      )
    : props.payload;
  return <ChartLegendContent {...props} payload={ordered} className="justify-start pl-8" />;
}

export function WeekTrendChart({
  daily,
  compareDaily,
  todayKey,
  todayIndex,
}: {
  daily: readonly DailyStudyStat[];
  compareDaily: readonly DailyStudyStat[];
  /** 오늘(KST 날짜 키). 이번 주에서 이후 요일 값을 선/끝점에서 뺀다. */
  todayKey: string;
  /**
   * 오늘이 보고 있는 주(월=0…일=6)의 몇 번째 요일인지. 오늘이 이 주에 없으면(과거·미래 주) `null`.
   * 이 값이 있을 때만, 오늘 요일 위치에만 끝점 도트를 찍는다.
   */
  todayIndex: number | null;
}) {
  const rows = buildWeekTrendRows(daily, compareDaily, todayKey);

  // 색상만으로 두 선을 가르지 않도록 스크린리더용 요일별 값 요약을 함께 낸다(초 단위 원본).
  const points = weekTrendPoints(daily, compareDaily, todayKey);

  const renderEndpointDot = ({ cx, cy, index }: DotProps): ReactElement => {
    // 오늘이 이 주에 있을 때만, 오늘 요일 위치에만 도트를 찍는다(과거·미래 주는 도트 없음).
    if (todayIndex === null || index !== todayIndex || cx == null || cy == null) {
      return <g key={`dot-${index}`} />;
    }
    return (
      <circle
        key={`dot-${index}`}
        cx={cx}
        cy={cy}
        r={4}
        fill="var(--color-thisWeek)"
        stroke="var(--color-thisWeek)"
        strokeWidth={2}
      />
    );
  };

  return (
    <div>
      <ChartContainer
        config={chartConfig}
        className="h-[180px] w-full"
        role="img"
        aria-label="이번 주와 지난주 요일별 순공시간 추이"
      >
        <AreaChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <defs>
            {/* 선 아래 그라데이션 — 위(선 색 opacity 0.25)에서 아래(투명)로. 시안 image 3. */}
            <linearGradient id="weekTrendThisWeekFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-thisWeek)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--color-thisWeek)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="weekTrendLastWeekFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-lastWeek)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--color-lastWeek)" stopOpacity={0} />
            </linearGradient>
          </defs>
          {/* 범례 좌측 정렬 + 왼쪽 여백(YAxis width 28 + margin left 4 = 그리는 영역 왼쪽). 시안 image 2.
              순서는 OrderedChartLegend가 chartConfig 순서(이번 주 → 지난주)로 고정한다. */}
          <ChartLegend verticalAlign="top" align="left" content={<OrderedChartLegend />} />
          <CartesianGrid vertical={false} />
          <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis
            domain={[0, MAX_CHART_HOURS]}
            ticks={[0, 4, 8, 12]}
            tickLine={false}
            axisLine={false}
            width={28}
            tickFormatter={(value: number) => (value >= MAX_CHART_HOURS ? "12+" : String(value))}
          />
          {/* 요일 호버/탭 시 그 요일의 이번 주·지난주 순공시간을 함께 보여준다.
              값은 clamp 전 원본 초(row.*Sec)를 formatDuration으로 표기한다. 미래 요일(이번 주 값 null)은
              recharts 기본 filterNull이 payload에서 빼므로 이번 주 항목이 아예 안 뜬다(0시간 오해 방지). */}
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(_value, _name, item) => {
                  const row = item.payload as WeekTrendRow;
                  const series = item.dataKey === "lastWeek" ? "lastWeek" : "thisWeek";
                  const text = weekTrendTooltipDuration(
                    series === "thisWeek" ? row.thisWeekSec : row.lastWeekSec,
                  );
                  if (text === null) {
                    return null;
                  }
                  return (
                    <div className="flex flex-1 items-center justify-between gap-4 leading-none">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                          style={{ backgroundColor: `var(--color-${series})` }}
                        />
                        {chartConfig[series].label}
                      </span>
                      <span className="font-medium tabular-nums text-foreground">{text}</span>
                    </div>
                  );
                }}
              />
            }
          />
          {/* 이번 주 차트가 지난주 차트 위에 오게 한다. */}
          <Area
            dataKey="lastWeek"
            type="linear"
            stroke="var(--color-lastWeek)"
            strokeWidth={2}
            fill="url(#weekTrendLastWeekFill)"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Area
            dataKey="thisWeek"
            type="linear"
            stroke="var(--color-thisWeek)"
            strokeWidth={3}
            fill="url(#weekTrendThisWeekFill)"
            dot={renderEndpointDot as AreaProps["dot"]}
            activeDot={{ r: 4 }}
            connectNulls
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartContainer>

      <table className="sr-only">
        <caption>요일별 순공시간 (이번 주 · 지난주)</caption>
        <thead>
          <tr>
            <th>요일 구분</th>
            <th>이번 주 순공</th>
            <th>지난주 순공</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.day}>
              <th scope="row">{point.day}</th>
              <td>
                {point.thisWeekSec === null ? "기록 없음" : formatDuration(point.thisWeekSec)}
              </td>
              <td>
                {point.lastWeekSec === null ? "기록 없음" : formatDuration(point.lastWeekSec)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
