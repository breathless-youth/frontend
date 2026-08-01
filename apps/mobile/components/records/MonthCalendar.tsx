import { colors } from "@focusmakers/design-tokens";
import { useMemo } from "react";
import { Pressable, Text, useColorScheme, View } from "react-native";

import {
  buildMonthGrid,
  type CalendarMonth,
  dayOfDateKey,
  isFutureDateKey,
  monthLabel,
  WEEKDAY_LABELS,
} from "../../lib/recordsFormat";
import { IconChevronLeft, IconChevronRight } from "../icons";

/**
 * S5 월 달력 카드(Figma `calendar-card` 65:641 + `Record / Calendar Cell` 46:122).
 *
 * Figma는 셀을 46×44로 그려두고 행 간격을 33px로 겹쳐 배치했다. 겹치는 터치 영역은 실제 앱에서
 * 서로 터치를 뺏으므로 재현하지 않는다 — 행을 44px로 쌓아 터치 타겟 44×44를 보장한다
 * (`SCR-S5-records.md` Accessibility Requirements). 그래서 카드 높이가 Figma(250)보다 커진다.
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
  onPress,
}: {
  direction: "prev" | "next";
  onPress: () => void;
}) {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  // 두 버튼의 셰브런 색을 같게 맞춘다 — Figma는 다음 달 버튼도 같은 icon/chevron-left(text/primary)를
  // 180° 회전해 쓴다. 여기서는 회전 대신 같은 세트의 chevron-right를 쓰되 색만 맞춘다.
  const iconColor = colors.text.primary[scheme];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={direction === "prev" ? "이전 달" : "다음 달"}
      // 시각 크기는 Figma의 32×32를 유지하고 히트슬롭으로 44×44를 확보한다.
      hitSlop={6}
      // Figma는 이 배경을 #eff1f4로 하드코딩해뒀다(변수 미바인딩). 다크모드에서 밝은 회색이
      // 그대로 남는 문제가 있어 가장 가까운 토큰 `bg/layer-2`(#f2f4f6)로 바인딩한다 —
      // 값이 정확히 같지는 않아 Figma 원본 수정은 Review Checklist 항목으로 올라가 있다.
      className="bg-bg-layer2 dark:bg-bg-layer2-dark size-8 items-center justify-center rounded-full"
    >
      {direction === "prev" ? (
        <IconChevronLeft size={13} color={iconColor} />
      ) : (
        <IconChevronRight size={13} color={iconColor} />
      )}
    </Pressable>
  );
}

function CalendarCell({
  dateKey,
  isSelected,
  isToday,
  isFuture,
  hasRecord,
  onPress,
}: {
  dateKey: string;
  isSelected: boolean;
  isToday: boolean;
  isFuture: boolean;
  hasRecord: boolean;
  onPress: (dateKey: string) => void;
}) {
  const day = dayOfDateKey(dateKey);

  return (
    <Pressable
      onPress={() => onPress(dateKey)}
      // 미래 날짜는 비활성 — 아무 동작도 하지 않는다(`design.md` 달력 상세).
      disabled={isFuture}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected, disabled: isFuture }}
      // 도트만으로 뜻을 전달하지 않도록 기록 유무를 라벨로도 준다.
      accessibilityLabel={`${day}일, ${hasRecord ? "기록 있음" : "기록 없음"}`}
      className="h-11 flex-1 items-center justify-center"
    >
      {isSelected || isToday ? (
        <View
          className={
            isSelected
              ? "bg-brand-primary dark:bg-brand-primary-dark size-[30px] items-center justify-center rounded-full"
              : "border-brand-primary dark:border-brand-primary-dark size-[30px] items-center justify-center rounded-full border-[1.5px]"
          }
        >
          <Text
            className={
              isSelected
                ? "text-text-onBrand text-[15px] font-semibold leading-[18px]"
                : "text-brand-primary dark:text-brand-primary-dark text-[15px] font-semibold leading-[18px]"
            }
          >
            {day}
          </Text>
        </View>
      ) : (
        <View className="items-center gap-[2px]">
          <Text
            className={
              isFuture
                ? "text-text-disabled dark:text-text-disabled-dark text-[15px] leading-5"
                : "text-text-primary dark:text-text-primary-dark text-[15px] leading-5"
            }
          >
            {day}
          </Text>
          {/* 도트 자리는 기록이 없어도 유지한다(숫자 위치가 흔들리지 않게 — Figma도 투명 도트를 둔다) */}
          <View
            className={
              hasRecord
                ? "bg-brand-primary dark:bg-brand-primary-dark size-1 rounded-full"
                : "size-1"
            }
          />
        </View>
      )}
    </Pressable>
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
    <View className="bg-bg-layer1 dark:bg-bg-layer1-dark border-border-default dark:border-border-default-dark rounded-[20px] border px-[15px] py-[13px]">
      <View className="flex-row items-center justify-between">
        <MonthNavButton direction="prev" onPress={onPrevMonth} />
        <Text
          accessibilityRole="header"
          className="text-text-primary dark:text-text-primary-dark text-base font-bold leading-[19px]"
        >
          {monthLabel(month)}
        </Text>
        <MonthNavButton direction="next" onPress={onNextMonth} />
      </View>

      <View className="mt-3 flex-row">
        {WEEKDAY_LABELS.map((label) => (
          <Text
            key={label}
            className="text-text-tertiary flex-1 text-center text-xs font-medium leading-[14px]"
          >
            {label}
          </Text>
        ))}
      </View>

      <View className="mt-1">
        {grid.map((week) => (
          <View key={week.find((cell) => cell !== null) ?? "empty-week"} className="flex-row">
            {week.map((dateKey, index) =>
              dateKey === null ? (
                // 빈칸은 누를 수 없다 — 인접 셀의 터치를 뺏지 않도록 View로 둔다.
                <View key={`blank-${String(index)}`} className="h-11 flex-1" />
              ) : (
                <CalendarCell
                  key={dateKey}
                  dateKey={dateKey}
                  isSelected={dateKey === selectedKey}
                  isToday={dateKey === todayKey}
                  isFuture={isFutureDateKey(dateKey, todayKey)}
                  hasRecord={studied.has(dateKey)}
                  onPress={onSelectDate}
                />
              ),
            )}
          </View>
        ))}
      </View>
    </View>
  );
}
