import { useMemo } from "react";

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

  return (
    <div className="rounded-[20px] border border-border bg-muted px-[15px] py-[13px]">
      <div className="flex items-center justify-between">
        <MonthNavButton direction="prev" onClick={onPrevMonth} />
        <h2 className="text-base leading-[19px] font-bold text-foreground">{monthLabel(month)}</h2>
        <MonthNavButton direction="next" onClick={onNextMonth} />
      </div>

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

      <div className="mt-1">
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
  );
}
