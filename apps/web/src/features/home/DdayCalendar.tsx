import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import { IconChevronDown, IconChevronLeft, IconChevronRight } from "@/features/records/icons";
import {
  buildMonthGrid,
  type CalendarMonth,
  dayOfDateKey,
  monthLabel,
  monthOfDateKey,
  shiftMonth,
  WEEKDAY_LABELS,
} from "@/features/records/recordsFormat";
import { cn } from "@/lib/utils";

/** 연/월 선택기의 빠른 이동 — 시험은 보통 몇 달 뒤라 달을 하나씩 넘기게 두지 않는다. */
const QUICK_JUMPS: readonly { readonly months: number; readonly label: string }[] = [
  { months: 1, label: "1개월 후" },
  { months: 6, label: "6개월 후" },
  { months: 12, label: "1년 후" },
];

const NAV_BUTTON_CLASS = "flex size-11 items-center justify-center";

/**
 * 스와이프 커밋 임계(px) — 기록 탭 달력(`MonthCalendar.SWIPE_THRESHOLD_PX`)과 같은 값이다. 앱 안의
 * 가로 스와이프 감각을 하나로 맞추되, 두 feature가 서로 import하지 않는 경계를 지키려 공유 상수로 올리지 않는다.
 */
const SWIPE_THRESHOLD_PX = 48;

function isBeforeMonth(a: CalendarMonth, b: CalendarMonth): boolean {
  return a.year < b.year || (a.year === b.year && a.month < b.month);
}

/**
 * D-Day 시트의 달력. 기록 탭 달력과 반대로 **지난 날이 비활성**이고 오늘은 링, 고른 날은 채움이다.
 * 가운데 월 라벨을 누르면 연/월 선택기로 바뀐다 — 몇 달 뒤 시험을 고를 때 화살표를 여러 번
 * 누르지 않게 한다. 날짜 값은 `YYYY-MM-DD`이고 오늘은 기기 로컬 날짜다(홈 D-N과 같은 기준).
 */
export function DdayCalendar({
  value,
  todayKey,
  onChange,
}: {
  value: string | null;
  todayKey: string;
  onChange: (dateKey: string) => void;
}) {
  // 지난 D-Day를 편집할 땐 그 달이 아니라 이번 달부터 연다 — 지난 달은 전부 비활성이라 고를 게 없다.
  const [month, setMonth] = useState<CalendarMonth>(() =>
    monthOfDateKey(value !== null && value >= todayKey ? value : todayKey),
  );
  const [picker, setPicker] = useState(false);
  const [pickYear, setPickYear] = useState(month.year);
  const thisMonth = monthOfDateKey(todayKey);
  /**
   * 마지막 월 이동 방향 — 그리드가 그 방향에서 밀려 들어오는 모션을 고른다(기록 탭 달력과 같은 방식).
   * 화살표·스와이프 어느 쪽이든 같은 모션이고, 첫 마운트와 연/월 선택기로 건너뛴 때는 없다.
   */
  const [slideFrom, setSlideFrom] = useState<"left" | "right" | null>(null);

  function shiftBy(delta: -1 | 1) {
    setSlideFrom(delta < 0 ? "left" : "right");
    setMonth((current) => shiftMonth(current, delta));
  }

  function pickMonth(next: CalendarMonth) {
    setSlideFrom(null);
    setMonth(next);
    setPicker(false);
  }

  // 시작점을 기록하고 놓는 순간 총 이동량으로 판정한다 — 셀 버튼 위에서 시작한 드래그도 부모로
  // 버블돼 잡히고, 임계 미만의 탭은 셀 클릭으로 남는다. 세로 우세면 시트 스크롤 몫이라 무시한다.
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (start === null) {
      return;
    }
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy)) {
      return;
    }
    shiftBy(dx < 0 ? 1 : -1);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-11 items-center justify-between">
        <button
          type="button"
          aria-label="이전 달"
          onClick={() => shiftBy(-1)}
          className={cn(NAV_BUTTON_CLASS, "-ml-3.5")}
        >
          <IconChevronLeft size={13} color="var(--color-foreground)" />
        </button>
        <button
          type="button"
          aria-expanded={picker}
          aria-label="연도·월 바로 가기"
          onClick={() => {
            setPickYear(month.year);
            setPicker((open) => !open);
          }}
          className="flex h-11 items-center gap-1.5 px-2 text-foreground"
        >
          <span className="text-[17px] leading-[21px] font-bold">{monthLabel(month)}</span>
          <span className={cn("transition-transform duration-200", picker && "rotate-180")}>
            <IconChevronDown size={9} color="var(--color-primary)" />
          </span>
        </button>
        <button
          type="button"
          aria-label="다음 달"
          onClick={() => shiftBy(1)}
          className={cn(NAV_BUTTON_CLASS, "-mr-3.5")}
        >
          <IconChevronRight size={13} color="var(--color-foreground)" />
        </button>
      </div>

      {picker ? (
        <div className="flex min-h-[284px] flex-col gap-2">
          <div className="flex h-11 items-center justify-center gap-1">
            <button
              type="button"
              aria-label="이전 연도"
              disabled={pickYear <= thisMonth.year}
              onClick={() => setPickYear((year) => year - 1)}
              className={cn(NAV_BUTTON_CLASS, "disabled:opacity-30")}
            >
              <IconChevronLeft size={13} color="var(--color-foreground)" />
            </button>
            <span className="min-w-[72px] text-center text-[20px] leading-6 font-extrabold text-primary tabular-nums">
              {pickYear}
            </span>
            <button
              type="button"
              aria-label="다음 연도"
              onClick={() => setPickYear((year) => year + 1)}
              className={NAV_BUTTON_CLASS}
            >
              <IconChevronRight size={13} color="var(--color-foreground)" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 12 }, (_, index) => {
              const candidate = { year: pickYear, month: index + 1 };
              const past = isBeforeMonth(candidate, thisMonth);
              const isShown = candidate.year === month.year && candidate.month === month.month;
              const isNow =
                candidate.year === thisMonth.year && candidate.month === thisMonth.month;
              return (
                <button
                  key={candidate.month}
                  type="button"
                  disabled={past}
                  aria-pressed={isShown}
                  onClick={() => pickMonth(candidate)}
                  className={cn(
                    "h-12 rounded-2xl text-[15px] leading-5 font-medium transition-colors",
                    isShown
                      ? "bg-primary font-bold text-primary-foreground"
                      : past
                        ? "bg-bg-layer-2 text-text-disabled"
                        : isNow
                          ? "bg-bg-layer-2 font-bold text-primary shadow-[inset_0_0_0_1.5px_var(--color-primary)]"
                          : "bg-bg-layer-2 text-foreground",
                  )}
                >
                  {candidate.month}월
                </button>
              );
            })}
          </div>
          <div className="flex gap-2 pt-1">
            {QUICK_JUMPS.map((jump) => (
              <button
                key={jump.months}
                type="button"
                onClick={() => pickMonth(shiftMonth(thisMonth, jump.months))}
                className="h-9 flex-1 rounded-full bg-bg-layer-2 text-[13px] leading-4 font-medium text-muted-foreground"
              >
                {jump.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        // `touch-pan-y`: 세로 스크롤은 브라우저에 남기고 가로 팬만 우리 포인터 이벤트로 가져온다 —
        // 없으면 iOS가 가로 드래그도 스크롤 제스처로 집어 pointercancel을 내서 스와이프가 끝까지 못 간다.
        <div
          data-testid="dday-calendar-swipe-area"
          className="touch-pan-y"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
        >
          <div className="grid grid-cols-7">
            {WEEKDAY_LABELS.map((label) => (
              <span
                key={label}
                className="pb-1 text-center text-xs leading-4 font-medium text-text-tertiary"
              >
                {label}
              </span>
            ))}
          </div>
          <div
            // 월이 바뀔 때마다 리마운트시켜 이동 방향에서 밀려 들어오는 모션을 재생한다
            key={`${String(month.year)}-${String(month.month)}`}
            className={cn(
              "grid grid-cols-7",
              slideFrom === "right" &&
                "animate-[month-slide-from-right_200ms_ease-out] motion-reduce:animate-none",
              slideFrom === "left" &&
                "animate-[month-slide-from-left_200ms_ease-out] motion-reduce:animate-none",
            )}
          >
            {buildMonthGrid(month).flatMap((week, row) =>
              week.map((dateKey, column) => {
                if (dateKey === null) {
                  return <div key={`blank-${String(row)}-${String(column)}`} className="h-11" />;
                }
                const past = dateKey < todayKey;
                const selected = dateKey === value;
                const today = dateKey === todayKey;
                return (
                  <button
                    key={dateKey}
                    type="button"
                    disabled={past}
                    aria-pressed={selected}
                    aria-label={`${month.month}월 ${dayOfDateKey(dateKey)}일`}
                    onClick={() => onChange(dateKey)}
                    className="flex h-11 items-center justify-center"
                  >
                    <span
                      className={cn(
                        "flex size-[30px] items-center justify-center rounded-full text-[15px] leading-5 transition-colors",
                        selected
                          ? "bg-primary font-semibold text-primary-foreground"
                          : past
                            ? "text-text-disabled"
                            : today
                              ? "font-semibold text-primary shadow-[inset_0_0_0_1.5px_var(--color-primary)]"
                              : "text-foreground",
                      )}
                    >
                      {dayOfDateKey(dateKey)}
                    </span>
                  </button>
                );
              }),
            )}
          </div>
        </div>
      )}
    </div>
  );
}
