import { createContext, useContext } from "react";

import { Calendar, CalendarDayButton, type CalendarDayButtonProps } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

import {
  type CalendarMonth,
  dateKeyOfDate,
  dateOfDateKey,
  formatDuration,
  formatHeatClock,
  type HeatLevel,
  heatLevel,
} from "./recordsFormat";
import { useHorizontalSwipe } from "./useHorizontalSwipe";

/** 달력 아래에 적는 그 달의 합계와 하루 평균. */
export type MonthStats = {
  totalFocusSec: number;
  studiedDays: number;
  /** 합계 ÷ 공부한 날 수. 공부한 날이 없으면 `null`. */
  averageFocusSec: number | null;
};

/**
 * 월 달력
 *
 * RN `Pressable(accessibilityRole="button")`는 `<button type="button">`으로, `hitSlop`은
 * 웹에 대응 개념이 없어 생략한다(시각 크기 32×32 자체가 이미 44px 행 안에서 충분한 타겟이다).
 */
type MonthCalendarProps = {
  month: CalendarMonth;
  /** KST 기준 오늘 `YYYY-MM-DD` */
  todayKey: string;
  selectedKey: string;
  /** 날짜 키 → 순공시간(초). 셀 농도·시간 라벨을 여기서 찾는다(`recordsPeriod.buildDayFocusMap`). */
  dayFocusSec: ReadonlyMap<string, number>;
  onSelectDate: (dateKey: string) => void;
  /**
   * 마지막 월 이동 방향 — 그리드가 그 방향에서 밀려 들어오는 애니메이션을 고른다.
   * 첫 마운트(`null`)에는 애니메이션이 없다 — 탭에 들어왔을 뿐인데 달력이 움직이면 이상하다.
   */
  slideFrom: "left" | "right" | null;
  /** 스와이프로 월을 넘겼을 때 상위에 알린다. delta -1=이전, 1=다음. 계측·상태 갱신은 상위 몫. */
  onSwipeMonth: (delta: -1 | 1) => void;
  /** 그 달의 합계·하루 평균. 기간 조회가 끝나기 전에는 `null`(자리표시를 그린다). */
  monthStats: MonthStats | null;
};

const HEAT_BG: Record<Exclude<HeatLevel, 0>, string> = {
  1: "bg-chart-heat-1",
  2: "bg-chart-heat-2",
  3: "bg-chart-heat-3",
  4: "bg-chart-heat-4",
  5: "bg-chart-heat-5",
};

/** 범례 — 숫자는 "그 시간 이상"이다(0+는 2시간 미만). 달력 칸 농도(`heatLevel`)와 같은 2시간 간격. */
const HEAT_LEGEND = [
  { cls: HEAT_BG[1], label: "0+" },
  { cls: HEAT_BG[2], label: "2+" },
  { cls: HEAT_BG[3], label: "4+" },
  { cls: HEAT_BG[4], label: "6+" },
  { cls: HEAT_BG[5], label: "8+" },
] as const;

/** 날짜 키 → 순공시간(초). 공용 Calendar가 그리는 날짜 칸에 그 달의 기록을 건넨다. */
const DayFocusContext = createContext<ReadonlyMap<string, number>>(new Map());

/** 공용 Calendar의 날짜 칸 — 순공시간 농도 · 시간 라벨 · 오늘 칩 · 선택 테두리를 그린다. */
function HeatDayButton({ day, modifiers, ...props }: CalendarDayButtonProps) {
  const focusSec = useContext(DayFocusContext).get(dateKeyOfDate(day.date)) ?? 0;
  const dayOfMonth = day.date.getDate();
  const isToday = Boolean(modifiers.today);
  // 아직 오지 않은 날만 고를 수 없다.
  const isFuture = Boolean(modifiers.disabled);
  const level = heatLevel(focusSec);
  const record = focusSec > 0 ? `순공 ${formatDuration(focusSec)}` : "기록 없음";

  // 진한 두 단계(6시간 이상)는 글자가 묻히지 않게 흰색으로 뒤집는다.
  const onStrong = level >= 4;
  // 기록 없는 날과 아직 오지 않은 날도 칸은 그린다 — 숫자 색으로만 구분한다.
  const fill = isFuture || level === 0 ? "bg-chart-empty" : HEAT_BG[level];
  const tone = isFuture
    ? "text-text-disabled"
    : level === 0
      ? "text-muted-foreground"
      : onStrong
        ? "text-white"
        : "text-foreground";

  return (
    <CalendarDayButton
      day={day}
      modifiers={modifiers}
      {...props}
      aria-pressed={Boolean(modifiers.selected)}
      // 농도 배경만으로 뜻을 전달하지 않도록 순공시간을 라벨로도 준다.
      aria-label={`${isToday ? "오늘, " : ""}${String(dayOfMonth)}일, ${record}`}
      className="flex aspect-square w-full items-center justify-center disabled:cursor-not-allowed"
    >
      <span
        // 선택일은 테두리로만 표시한다 — 농도 색을 가리지 않는다. ring-inset이라 칸 크기는 그대로다.
        className={cn(
          "flex aspect-square w-full flex-col items-center justify-center gap-0.5 rounded-[10px] tabular-nums",
          fill,
          tone,
          modifiers.selected && "ring-[1.5px] ring-foreground ring-inset",
        )}
      >
        {isToday ? (
          // 오늘은 숫자 칩 — 다른 날을 골라도 보이고, 선택 테두리와 겹쳐도 구분된다.
          <span className="flex h-[18px] items-center rounded-full bg-foreground px-[5px] text-xs leading-[14px] font-bold text-background">
            {dayOfMonth}
          </span>
        ) : (
          <span className="text-[13px] leading-4 font-bold">{dayOfMonth}</span>
        )}
        {/* 순공이 없어도 자리를 남겨 숫자 높이가 칸마다 같게 한다. */}
        <span className="h-3 text-[10px] leading-3">
          {focusSec > 0 ? formatHeatClock(focusSec) : ""}
        </span>
      </span>
    </CalendarDayButton>
  );
}

/** 달력 아래 — 왼쪽에 농도 범례, 오른쪽에 그 달의 하루 평균과 합계. */
function MonthStatsRow({ stats, monthLabel }: { stats: MonthStats | null; monthLabel: string }) {
  return (
    <div className="mx-2 mt-1">
      <Separator />
      <div className="flex items-start justify-between pt-[13px]">
        {/* 범례 — 농도만으로 뜻을 전하지 않도록 숫자를 함께 둔다 */}
        <div
          role="group"
          aria-label="순공시간 범례, 숫자는 그 시간 이상"
          className="flex items-start gap-1 pt-0.5"
        >
          {HEAT_LEGEND.map((item) => (
            <span key={item.label} className="flex flex-col items-center gap-[3px]">
              <span className={`h-2.5 w-[18px] rounded-[3px] ${item.cls}`} aria-hidden />
              <span className="text-[10px] leading-3 text-muted-foreground">{item.label}</span>
            </span>
          ))}
        </div>

        <div className="flex items-start gap-5">
          <div className="flex flex-col items-end gap-0.5">
            <p className="text-xs leading-[14px] text-muted-foreground">하루 평균</p>
            {stats === null ? (
              <Skeleton className="h-[18px] w-16 rounded-md" />
            ) : (
              <p className="text-[15px] leading-[18px] font-bold text-foreground tabular-nums">
                {formatDuration(stats.averageFocusSec ?? 0)}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <p className="text-xs leading-[14px] text-muted-foreground">{monthLabel} 총 시간</p>
            {stats === null ? (
              <Skeleton className="h-[18px] w-16 rounded-md" />
            ) : (
              <p className="text-[15px] leading-[18px] font-bold text-foreground tabular-nums">
                {formatDuration(stats.totalFocusSec)}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MonthCalendar({
  month,
  todayKey,
  selectedKey,
  dayFocusSec,
  onSelectDate,
  slideFrom,
  onSwipeMonth,
  monthStats,
}: MonthCalendarProps) {
  const today = dateOfDateKey(todayKey);

  const swipe = useHorizontalSwipe(onSwipeMonth);

  return (
    <Card className="rounded-[20px] border-0 shadow-sb-card px-2.5 pt-3.5 pb-4">
      {/*
        월 이동 헤더는 RecordsPage가 카드 밖에서 그린다(BY-567 v2 조립) — 여기서 또 그리면
        "이전 달"/"다음 달" 버튼이 화면에 두 벌 생긴다. `slideFrom`·계측(`trackRecordsMonthChanged`)도
        RecordsPage가 소유한다 — 헤더 버튼과 아래 스와이프가 같은 `changeMonth` 경로를 타야
        방향 애니메이션·계측이 어느 쪽으로 이동해도 갈라지지 않는다.

        스와이프 영역 — 요일 행 + 그리드. `touch-pan-y`: 세로 스크롤은 브라우저에 남기고 가로
        팬만 우리 포인터 이벤트로 가져온다 — 없으면 iOS가 가로 드래그도 스크롤 제스처로 집어
        pointercancel을 내서 스와이프가 끝까지 도달하지 못한다.
      */}
      <div data-testid="month-calendar-swipe-area" className="touch-pan-y" {...swipe}>
        <DayFocusContext.Provider value={dayFocusSec}>
          <Calendar
            // 월이 바뀔 때마다 리마운트시켜 이동 방향에서 밀려 들어오는 모션을 재생한다
            // (온보딩 가이드의 `key={step.id}` 리마운트와 같은 방식).
            key={`${String(month.year)}-${String(month.month)}`}
            mode="single"
            required
            // 달 이동은 상위(헤더 버튼 · 스와이프)가 맡는다.
            disableNavigation
            month={new Date(month.year, month.month - 1)}
            today={today}
            selected={dateOfDateKey(selectedKey)}
            disabled={{ after: today }}
            onSelect={(date) => onSelectDate(dateKeyOfDate(date))}
            classNames={{
              // 요일 줄은 그대로 두고 날짜 줄만 밀려 들어온다.
              weeks: cn(
                "flex flex-col gap-1.5 pt-2.5",
                slideFrom === "right" &&
                  "animate-[month-slide-from-right_200ms_ease-out] motion-reduce:animate-none",
                slideFrom === "left" &&
                  "animate-[month-slide-from-left_200ms_ease-out] motion-reduce:animate-none",
              ),
              week: "flex gap-1.5",
              day: "aspect-square flex-1 p-0",
            }}
            components={{ DayButton: HeatDayButton }}
          />
        </DayFocusContext.Provider>
      </div>

      <MonthStatsRow stats={monthStats} monthLabel={`${String(month.month)}월`} />
    </Card>
  );
}
