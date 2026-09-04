import { useCallback, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import {
  buildMonthGrid,
  type CalendarMonth,
  dayOfDateKey,
  isFutureDateKey,
  monthLabel,
  WEEKDAY_LABELS,
} from "./recordsFormat";
import { IconChevronLeft, IconChevronRight } from "./icons";

/**
 * S5 월 달력 카드(Figma `calendar-card` 65:641 + `Record / Calendar Cell` 46:122).
 * (`apps/mobile/components/records/MonthCalendar.tsx`에서 이식 — BY-330 기록 웹 이관)
 *
 * Figma는 셀을 46×44로 그려두고 행 간격을 33px로 겹쳐 배치했다. 겹치는 터치 영역은 실제 앱에서
 * 서로 터치를 뺏으므로 재현하지 않는다 — 행을 44px로 쌓아 터치 타겟 44×44를 보장한다
 * (`SCR-S5-records.md` Accessibility Requirements). 그래서 카드 높이가 Figma(250)보다 커진다.
 *
 * RN `Pressable(accessibilityRole="button")`는 `<button type="button">`으로, `hitSlop`은
 * 웹에 대응 개념이 없어 생략한다(시각 크기 32×32 자체가 이미 44px 행 안에서 충분한 타겟이다).
 */
type MonthCalendarProps = {
  month: CalendarMonth;
  /** KST 기준 오늘 `YYYY-MM-DD` */
  todayKey: string;
  selectedKey: string;
  /** `StudySessionListResponse.studiedDatesInMonth` — 이 배열에 있는 날에 도트를 찍는다. */
  studiedDates: readonly string[];
  onSelectDate: (dateKey: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
};

function MonthNavButton({
  direction,
  onClick,
}: {
  direction: "prev" | "next";
  onClick: () => void;
}) {
  // 두 버튼의 셰브런 색을 같게 맞춘다 — Figma는 다음 달 버튼도 같은 icon/chevron-left(text/primary)를
  // 180° 회전해 쓴다. 여기서는 회전 대신 같은 세트의 chevron-right를 쓰되 색만 맞춘다.
  const iconColor = "var(--color-foreground)";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === "prev" ? "이전 달" : "다음 달"}
      // Figma는 이 배경을 #eff1f4로 하드코딩해뒀다(변수 미바인딩). 다크모드에서 밝은 회색이
      // 그대로 남는 문제가 있어 가장 가까운 토큰 `bg/layer-2`(#f2f4f6)로 바인딩한다 —
      // 값이 정확히 같지는 않아 Figma 원본 수정은 Review Checklist 항목으로 올라가 있다.
      className="flex size-8 items-center justify-center rounded-full bg-bg-layer-2"
    >
      {direction === "prev" ? (
        <IconChevronLeft size={13} color={iconColor} />
      ) : (
        <IconChevronRight size={13} color={iconColor} />
      )}
    </button>
  );
}

function CalendarCell({
  dateKey,
  isSelected,
  isToday,
  isFuture,
  hasRecord,
  onSelect,
}: {
  dateKey: string;
  isSelected: boolean;
  isToday: boolean;
  isFuture: boolean;
  hasRecord: boolean;
  onSelect: (dateKey: string) => void;
}) {
  const day = dayOfDateKey(dateKey);

  return (
    <button
      type="button"
      onClick={() => onSelect(dateKey)}
      // 미래 날짜는 비활성 — 아무 동작도 하지 않는다(`design.md` 달력 상세).
      disabled={isFuture}
      aria-pressed={isSelected}
      // 도트만으로 뜻을 전달하지 않도록 기록 유무를 라벨로도 준다.
      aria-label={`${day}일, ${hasRecord ? "기록 있음" : "기록 없음"}`}
      className="flex h-11 flex-1 items-center justify-center disabled:cursor-not-allowed"
    >
      {isSelected || isToday ? (
        <span
          className={
            isSelected
              ? "flex size-[30px] items-center justify-center rounded-full bg-primary"
              : "flex size-[30px] items-center justify-center rounded-full border-[1.5px] border-primary"
          }
        >
          <span
            className={
              isSelected
                ? "text-[15px] leading-[18px] font-semibold text-primary-foreground"
                : "text-[15px] leading-[18px] font-semibold text-primary"
            }
          >
            {day}
          </span>
        </span>
      ) : (
        <span className="flex flex-col items-center gap-[2px]">
          <span
            className={
              isFuture
                ? "text-[15px] leading-5 text-text-disabled"
                : "text-[15px] leading-5 text-foreground"
            }
          >
            {day}
          </span>
          {/* 도트 자리는 기록이 없어도 유지한다(숫자 위치가 흔들리지 않게 — Figma도 투명 도트를 둔다) */}
          <span className={hasRecord ? "size-1 rounded-full bg-primary" : "size-1"} />
        </span>
      )}
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
  studiedDates,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
}: MonthCalendarProps) {
  const grid = useMemo(() => buildMonthGrid(month), [month]);
  const studied = useMemo(() => new Set(studiedDates), [studiedDates]);

  /**
   * 마지막 월 이동 방향 — 그리드가 그 방향에서 밀려 들어오는 애니메이션을 고른다(BY-343).
   * 버튼·스와이프 어느 쪽으로 이동해도 같은 모션이 나오도록 이동을 이 래퍼로만 태운다.
   * 첫 마운트(`null`)에는 애니메이션이 없다 — 탭에 들어왔을 뿐인데 달력이 움직이면 이상하다.
   */
  const [slideFrom, setSlideFrom] = useState<"left" | "right" | null>(null);

  const goPrevMonth = useCallback(() => {
    setSlideFrom("left");
    onPrevMonth();
  }, [onPrevMonth]);

  const goNextMonth = useCallback(() => {
    setSlideFrom("right");
    onNextMonth();
  }, [onNextMonth]);

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
        goNextMonth();
        return;
      }
      goPrevMonth();
    },
    [goNextMonth, goPrevMonth],
  );

  return (
    <div className="rounded-xl border border-border bg-muted px-[15px] py-[13px]">
      <div className="flex items-center justify-between">
        <MonthNavButton direction="prev" onClick={goPrevMonth} />
        <h2 className="text-base leading-[19px] font-bold text-foreground">{monthLabel(month)}</h2>
        <MonthNavButton direction="next" onClick={goNextMonth} />
      </div>

      {/*
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
        <div className="mt-3 flex flex-row">
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
              ? "mt-1"
              : slideFrom === "right"
                ? "mt-1 animate-[month-slide-from-right_200ms_ease-out] motion-reduce:animate-none"
                : "mt-1 animate-[month-slide-from-left_200ms_ease-out] motion-reduce:animate-none"
          }
        >
          {grid.map((week) => (
            <div key={week.find((cell) => cell !== null) ?? "empty-week"} className="flex flex-row">
              {week.map((dateKey, index) =>
                dateKey === null ? (
                  // 빈칸은 누를 수 없다 — 인접 셀의 터치를 뺏지 않도록 일반 div로 둔다.
                  <div key={`blank-${String(index)}`} className="h-11 flex-1" />
                ) : (
                  <CalendarCell
                    key={dateKey}
                    dateKey={dateKey}
                    isSelected={dateKey === selectedKey}
                    isToday={dateKey === todayKey}
                    isFuture={isFutureDateKey(dateKey, todayKey)}
                    hasRecord={studied.has(dateKey)}
                    onSelect={onSelectDate}
                  />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
