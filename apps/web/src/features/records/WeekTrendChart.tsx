import type { ReactElement } from "react";
import type { DailyStudyStat } from "@focusmakers/types";
import { CartesianGrid, Line, type LineProps, LineChart, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  type ChartConfig,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";

import { weekdayIndexOfDateKey } from "./recordsFormat";

/**
 * 주간 추이 라인차트
 *
 * 이번 주·지난주의 하루치 순공시간을 시간 단위로 겹쳐 그린다.
 *
 * y축은 0~12시간 고정이고 12를 넘으면 값은 12로 clamp하되 눈금 라벨만 `12+`로 적는다
 * 축이 튀지 않게 하면서 상한 초과를 알린다.
 */

const MAX_HOURS = 12;

/** 월요일 시작 7칸. XAxis 눈금 순서이자 슬롯 인덱스다. */
const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"] as const;

const chartConfig = {
  thisWeek: { label: "이번 주", color: "var(--primary)" },
  lastWeek: { label: "지난주", color: "var(--muted-foreground)" },
} satisfies ChartConfig;

type TrendRow = {
  day: (typeof WEEKDAY_LABELS)[number];
  thisWeek: number | null;
  lastWeek: number | null;
};

/** 일=0…토=6(`weekdayIndexOfDateKey`)을 월=0…일=6으로 옮긴다. */
function mondayIndex(dateKey: string): number {
  return (weekdayIndexOfDateKey(dateKey) + 6) % 7;
}

/** 순공 초 → 시간, 12시간에서 clamp(축이 튀지 않게). */
function toHours(focusSec: number): number {
  return Math.min(focusSec / 3600, MAX_HOURS);
}

function buildRows(
  daily: readonly DailyStudyStat[],
  compareDaily: readonly DailyStudyStat[],
): TrendRow[] {
  const rows: TrendRow[] = WEEKDAY_LABELS.map((day) => ({ day, thisWeek: null, lastWeek: null }));
  for (const stat of daily) {
    const row = rows[mondayIndex(stat.date)];
    if (row) {
      row.thisWeek = toHours(stat.focusSec);
    }
  }
  for (const stat of compareDaily) {
    const row = rows[mondayIndex(stat.date)];
    if (row) {
      row.lastWeek = toHours(stat.focusSec);
    }
  }
  return rows;
}

interface DotProps {
  cx?: number;
  cy?: number;
  index?: number;
}

export function WeekTrendChart({
  daily,
  compareDaily,
}: {
  daily: readonly DailyStudyStat[];
  compareDaily: readonly DailyStudyStat[];
}) {
  const rows = buildRows(daily, compareDaily);
  // 이번 주 선의 끝점(값이 있는 마지막 날)만 dot으로 강조한다.
  const lastPointIndex = rows.reduce((acc, row, i) => (row.thisWeek != null ? i : acc), -1);

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
    <ChartContainer config={chartConfig} className="h-[180px] w-full">
      <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
        <ChartLegend verticalAlign="top" content={<ChartLegendContent />} />
        <CartesianGrid vertical={false} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis
          domain={[0, MAX_HOURS]}
          ticks={[0, 4, 8, 12]}
          tickLine={false}
          axisLine={false}
          width={28}
          tickFormatter={(value: number) => (value >= MAX_HOURS ? "12+" : String(value))}
        />
        <Line
          dataKey="lastWeek"
          type="monotone"
          stroke="var(--color-lastWeek)"
          strokeWidth={2}
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
  );
}
