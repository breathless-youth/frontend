import type { AppLocale } from "./locale";

/**
 * 날짜·시각 표기
 *
 * 하루 경계(statDate)가 KST라 날짜 라벨과 세션 시각도 지금은 KST로 표시한다.
 * 기기 시간대로 바꿀 때는 STAT_TIME_ZONE 한 곳을 바꾼다.
 * 기록 목록처럼 같은 포맷을 수백 번 부르는 화면이 있어 포맷터를 로케일·옵션별로 캐시한다.
 * 시간 길이(3시간 42분)는 Intl.DurationFormat이 iOS 16 웹뷰에 없어 여기서 만들지 않고 common 카탈로그 키로 만든다.
 */
export const STAT_TIME_ZONE = "Asia/Seoul";

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: AppLocale, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let cached = cache.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat(locale, options);
    cache.set(key, cached);
  }
  return cached;
}

export function formatDateLabel(locale: AppLocale, date: Date, timeZone = STAT_TIME_ZONE): string {
  return formatter(locale, { timeZone, month: "long", day: "numeric", weekday: "long" }).format(
    date,
  );
}

export function formatMonthLabel(locale: AppLocale, date: Date, timeZone = STAT_TIME_ZONE): string {
  return formatter(locale, { timeZone, year: "numeric", month: "long" }).format(date);
}

export function formatClock(locale: AppLocale, date: Date, timeZone = STAT_TIME_ZONE): string {
  const options: Intl.DateTimeFormatOptions =
    locale === "ko"
      ? { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }
      : { timeZone, hour: "numeric", minute: "2-digit" };
  return formatter(locale, options).format(date);
}

export function formatClockRange(
  locale: AppLocale,
  start: Date,
  end: Date,
  timeZone = STAT_TIME_ZONE,
): string {
  return `${formatClock(locale, start, timeZone)} – ${formatClock(locale, end, timeZone)}`;
}
