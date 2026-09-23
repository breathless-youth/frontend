import { useCallback, useMemo, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import {
  buildMonthGrid,
  type CalendarMonth,
  dayOfDateKey,
  formatDuration,
  formatHeatClock,
  heatLevel,
  isFutureDateKey,
  WEEKDAY_LABELS,
} from "./recordsFormat";

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
};

const HEAT_BG: Record<"low" | "mid" | "high", string> = {
  low: "bg-chart-heat-low",
  mid: "bg-chart-heat-mid",
  high: "bg-chart-heat-high",
};

function CalendarCell({
  dateKey,
  isSelected,
  isFuture,
  focusSec,
  onSelect,
}: {
  dateKey: string;
  isSelected: boolean;
  isFuture: boolean;
  focusSec: number;
  onSelect: (dateKey: string) => void;
}) {
  const day = dayOfDateKey(dateKey);
  const level = heatLevel(focusSec);
  const label = focusSec > 0 ? `${day}일, 순공 ${formatDuration(focusSec)}` : `${day}일, 기록 없음`;

  const fill = isSelected
    ? "bg-primary text-primary-foreground"
    : level === "none"
      ? "bg-chart-empty text-muted-foreground"
      : `${HEAT_BG[level]} text-foreground`;

  return (
    <button
      type="button"
      onClick={() => onSelect(dateKey)}
      disabled={isFuture}
      aria-pressed={isSelected}
      // 농도 배경만으로 뜻을 전달하지 않도록 순공시간을 라벨로도 준다.
      aria-label={label}
      className="flex aspect-square flex-1 items-center justify-center disabled:cursor-not-allowed"
    >
      <span
        className={`flex aspect-square w-full flex-col items-center justify-center gap-0.5 rounded-[10px] ${fill}`}
      >
        <span className="text-[13px] leading-4 font-bold tabular-nums">{day}</span>
        {focusSec > 0 && (
          <span className={`text-[10px] leading-3 tabular-nums ${isSelected ? "opacity-85" : ""}`}>
            {formatHeatClock(focusSec)}
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * 스와이프 커밋 임계(px) — 온보딩 가이드의 스텝 스와이프(`coachOverlayTheme.SWIPE_THRESHOLD_PX`)와
 * 같은 값이다. 앱 안의 가로 스와이프 감각을 하나로 맞춘다 — 공유 상수로 승격하지 않는 이유는
 * 두 feature가 서로 import하지 않는 경계를 지키기 위해서다(우연히 같은 값일 뿐 한쪽을 조정할
 * 때 다른 쪽이 따라가야 한다는 계약이 아직 없다).
 */
const SWIPE_THRESHOLD_PX = 48;

export function MonthCalendar({
  month,
  todayKey,
  selectedKey,
  dayFocusSec,
  onSelectDate,
  slideFrom,
  onSwipeMonth,
}: MonthCalendarProps) {
  const grid = useMemo(() => buildMonthGrid(month), [month]);

  // 온보딩 가이드 탭 레이어와 같은 판정(시작점 기록 → 놓는 순간 총 이동량) — 셀 버튼 위에서
  // 시작한 드래그도 부모(pointerup 버블)로 올라와 잡히고, 임계 미만의 탭은 셀 클릭으로 남는다.
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const start = pointerStartRef.current;
      pointerStartRef.current = null;
      if (!start) {
        return;
      }
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      // 세로 위주 움직임은 페이지 스크롤 몫이다 — 가로 우세일 때만 스와이프로 본다.
      if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy)) {
        return;
      }
      if (dx < 0) {
        onSwipeMonth(1);
        return;
      }
      onSwipeMonth(-1);
    },
    [onSwipeMonth],
  );

  return (
    <div className="rounded-[20px] bg-muted shadow-sb-card px-2.5 pt-3.5 pb-[18px]">
      {/*
        월 이동 헤더는 RecordsPage가 카드 밖에서 그린다(BY-567 v2 조립) — 여기서 또 그리면
        "이전 달"/"다음 달" 버튼이 화면에 두 벌 생긴다. `slideFrom`·계측(`trackRecordsMonthChanged`)도
        RecordsPage가 소유한다 — 헤더 버튼과 아래 스와이프가 같은 `changeMonth` 경로를 타야
        방향 애니메이션·계측이 어느 쪽으로 이동해도 갈라지지 않는다.

        스와이프 영역 — 요일 행 + 그리드. `touch-pan-y`: 세로 스크롤은 브라우저에 남기고 가로
        팬만 우리 포인터 이벤트로 가져온다 — 없으면 iOS가 가로 드래그도 스크롤 제스처로 집어
        pointercancel을 내서 스와이프가 끝까지 도달하지 못한다.
      */}
      <div
        data-testid="month-calendar-swipe-area"
        className="touch-pan-y"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        <div className="flex flex-row">
          {WEEKDAY_LABELS.map((label) => (
            <span
              key={label}
              className="flex-1 text-center text-xs leading-[14px] font-medium text-text-tertiary"
            >
              {label}
            </span>
          ))}
        </div>

        <div
          // 월이 바뀔 때마다 리마운트시켜 이동 방향에서 밀려 들어오는 모션을 재생한다
          // (온보딩 가이드의 `key={step.id}` 리마운트와 같은 방식).
          key={`${String(month.year)}-${String(month.month)}`}
          className={
            slideFrom === null
              ? "mt-2.5 flex flex-col gap-1.5"
              : slideFrom === "right"
                ? "mt-2.5 flex flex-col gap-1.5 animate-[month-slide-from-right_200ms_ease-out] motion-reduce:animate-none"
                : "mt-2.5 flex flex-col gap-1.5 animate-[month-slide-from-left_200ms_ease-out] motion-reduce:animate-none"
          }
        >
          {grid.map((week) => (
            <div
              key={week.find((cell) => cell !== null) ?? "empty-week"}
              className="flex flex-row gap-1.5"
            >
              {week.map((dateKey, index) =>
                dateKey === null ? (
                  // 빈칸은 누를 수 없다 — 인접 셀의 터치를 뺏지 않도록 일반 div로 둔다.
                  <div key={`blank-${String(index)}`} className="aspect-square flex-1" />
                ) : (
                  <CalendarCell
                    key={dateKey}
                    dateKey={dateKey}
                    isSelected={dateKey === selectedKey}
                    isFuture={isFutureDateKey(dateKey, todayKey)}
                    focusSec={dayFocusSec.get(dateKey) ?? 0}
                    onSelect={onSelectDate}
                  />
                ),
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 범례 — 농도만으로 뜻을 전하지 않도록 텍스트를 함께 둔다 */}
      <div className="mt-3 flex justify-center gap-3">
        {[
          { cls: "bg-chart-heat-low", label: "1시간 미만" },
          { cls: "bg-chart-heat-mid", label: "1~3시간" },
          { cls: "bg-chart-heat-high", label: "3시간+" },
        ].map((item) => (
          <span key={item.label} className="flex items-center gap-1.5">
            <span className={`size-2.5 rounded-xs ${item.cls}`} aria-hidden />
            <span className="text-[10.5px] leading-[13px] text-muted-foreground">{item.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
