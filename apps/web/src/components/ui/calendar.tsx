import type * as React from "react";
import { DayButton, type DayButtonProps, DayPicker, type DayPickerLocale } from "react-day-picker";
import { enUS } from "react-day-picker/locale/en-US";
import { ja } from "react-day-picker/locale/ja";
import { ko } from "react-day-picker/locale/ko";
import { zhTW } from "react-day-picker/locale/zh-TW";
import { useTranslation } from "react-i18next";

import type { AppLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

const DAY_PICKER_LOCALES: Record<AppLocale, DayPickerLocale> = {
  ko,
  en: enUS,
  ja,
  "zh-Hant": zhTW,
};

/**
 * 공용 달력 격자 — react-day-picker에 프로젝트 기본(한국어 · 월요일 시작 · 요일 줄 모양)을 입힌
 * shadcn `Calendar`.
 *
 * 격자만 그린다. 달 이동과 제목은 호출부가 그리고 보는 달을 `month`로 넘긴다. 날짜 칸의 모양과 라벨은
 * `components.DayButton`에 `CalendarDayButton`을 감싼 컴포넌트를 넘겨 정한다.
 */
function Calendar({
  className,
  classNames,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const { i18n } = useTranslation();
  return (
    <DayPicker
      locale={DAY_PICKER_LOCALES[i18n.language as AppLocale] ?? enUS}
      weekStartsOn={1}
      showOutsideDays={false}
      hideNavigation
      className={cn("w-full", className)}
      classNames={{
        month: "flex flex-col",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "flex-1 text-center text-xs leading-3.5 font-medium text-text-tertiary",
        weeks: "flex flex-col",
        week: "flex",
        day: "flex-1 p-0",
        hidden: "invisible",
        ...classNames,
      }}
      // 제목은 호출부가 그린다 — 같은 글자가 화면에 두 번 있지 않게 아예 그리지 않는다.
      components={{ MonthCaption: NoCaption, ...components }}
      {...props}
    />
  );
}

function NoCaption() {
  return <></>;
}

export { Calendar, DayButton as CalendarDayButton };
export type { DayButtonProps as CalendarDayButtonProps };
