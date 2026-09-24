import type { ReactElement } from "react";
import type { DailyStudyStat } from "@focusmakers/types";
import { CartesianGrid, Line, type LineProps, LineChart, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  type ChartConfig,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";

import { formatDuration } from "./recordsFormat";
import { MAX_CHART_HOURS, buildWeekTrendRows, weekTrendPoints } from "./recordsPeriod";

/**
 * 주간 추이 라인차트
 *
 * 이번 주·지난주의 하루치 순공시간을 시간 단위로 겹쳐 그린다. 값 계산(요일별 정렬·clamp·미래
 * 날짜 제외)은 `recordsPeriod`의 순수 함수가 하고 여기서는 그리기만 한다.
 *
 * y축은 0~12시간 고정이고 12를 넘으면 값은 12로 clamp하되 눈금 라벨만 `12+`로 적는다
 * 축이 튀지 않게 하면서 상한 초과를 알린다.
 */

const chartConfig = {
  thisWeek: { label: "이번 주", color: "var(--primary)" },
  lastWeek: { label: "지난주", color: "var(--muted-foreground)" },
} satisfies ChartConfig;

interface DotProps {
  cx?: number;
  cy?: number;
  index?: number;
}

export function WeekTrendChart({
  daily,
  compareDaily,
  todayKey,
}: {
  daily: readonly DailyStudyStat[];
  compareDaily: readonly DailyStudyStat[];
  /** 오늘(KST 날짜 키). 이번 주에서 이후 요일 값을 선/끝점에서 뺀다. */
  todayKey: string;
}) {
  const rows = buildWeekTrendRows(daily, compareDaily, todayKey);
  // 이번 주 선의 끝점(값이 있는 마지막 날 = 오늘 또는 마지막 실제 관측일)만 dot으로 강조한다.
  const lastPointIndex = rows.reduce((acc, row, i) => (row.thisWeek != null ? i : acc), -1);

  // 색상만으로 두 선을 가르지 않도록 스크린리더용 요일별 값 요약을 함께 낸다(초 단위 원본).
  const points = weekTrendPoints(daily, compareDaily, todayKey);

  const renderEndpointDot = ({ cx, cy, index }: DotProps): ReactElement => {
    if (index !== lastPointIndex || cx == null || cy == null) {
      return <g key={`dot-${index}`} />;
    }
    return (
      <circle
        key={`dot-${index}`}
        cx={cx}
        cy={cy}
        r={4}
        fill="var(--color-thisWeek)"
        stroke="var(--background)"
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
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <ChartLegend verticalAlign="top" content={<ChartLegendContent />} />
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
          <Line
            dataKey="lastWeek"
            type="monotone"
            stroke="var(--color-lastWeek)"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            dataKey="thisWeek"
            type="monotone"
            stroke="var(--color-thisWeek)"
            strokeWidth={3}
            dot={renderEndpointDot as LineProps["dot"]}
            activeDot={{ r: 4 }}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
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
