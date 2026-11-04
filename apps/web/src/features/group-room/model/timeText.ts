import { KOREA_TIME_ZONE, localDateKey } from "@/lib/dateKey";
import i18n from "@/lib/i18n";

// 그룹 화면이 시간 표기를 모두 이 모듈에서 가져오도록 랭킹과 함께 쓰는 시계 표기를 다시 내보낸다.
export { formatClock } from "@/lib/formatClock";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * 시간과 분 표기
 *
 * 이번 주 평균처럼 초까지 볼 필요가 없는 값이라 분을 내리고 0인 단위는 뺀다.
 */
export function formatHoursMinutes(totalSec: number): string {
  const totalMinutes = Math.floor(Math.max(0, totalSec) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return i18n.t("common:duration.minutes", { minutes });
  }
  return minutes === 0
    ? i18n.t("common:duration.hours", { hours })
    : i18n.t("common:duration.hoursMinutes", { hours, minutes });
}

/**
 * 한국 시간 달력의 날짜 번호
 *
 * 랭킹과 같은 날짜 경계를 쓰려고 기기 시간대 대신 한국 시간 날짜로 센다.
 */
function kstDayNumber(at: Date): number {
  return Date.parse(`${localDateKey(at, KOREA_TIME_ZONE)}T00:00:00Z`) / DAY_MS;
}

/**
 * 지난 때 표기
 *
 * 흐른 시간이 아니라 한국 시간 날짜 차이로 나눠서 자정을 넘으면 1시간 안이라도 어제다.
 * 같은 날이면 흐른 시간을 내려 적고 1시간이 안 되면 `kind`마다 정한 말을 쓴다.
 * 기기 시계가 서버보다 늦어 지금보다 뒤의 시각이 와도 음수 대신 같은 날 1시간 안으로 본다.
 * 영어는 `Requested 3 hours ago`처럼 말 순서가 달라 지난 때 뒤에 `신청`을 붙이지 않고 `kind`마다 문장을 따로 둔다.
 */
function pastText(kind: "lastStudied" | "appliedAt", at: string, now: Date): string {
  const then = new Date(at);
  const days = Math.max(0, kstDayNumber(now) - kstDayNumber(then));
  if (days === 0) {
    const hours = Math.floor((now.getTime() - then.getTime()) / HOUR_MS);
    return hours < 1
      ? i18n.t(`group-room:timeText.${kind}.withinHour`)
      : i18n.t(`group-room:timeText.${kind}.hoursAgo`, { count: hours });
  }
  return days === 1
    ? i18n.t(`group-room:timeText.${kind}.yesterday`)
    : i18n.t(`group-room:timeText.${kind}.daysAgo`, { count: days });
}

/**
 * 마지막으로 공부한 때
 *
 * 공부한 적이 없는 멤버에게 쓸 문구는 정해지지 않아 새로 만들지 않고 표기를 비운다.
 */
export function lastStudiedText(lastStudiedAt: string | null, now: Date): string | null {
  return lastStudiedAt === null ? null : pastText("lastStudied", lastStudiedAt, now);
}

export function appliedAtText(appliedAt: string, now: Date): string {
  return pastText("appliedAt", appliedAt, now);
}

/**
 * 남은 시간 표기
 *
 * 남은 시간이 실제보다 길어 보이지 않게 단위마다 내려서 적는다.
 * 만료 직후 목록이 다시 오기 전에는 1분 미만이나 지난 시각이 올 수 있어 `0분`이나 음수 대신 `1분`을 쓴다.
 * 호출하는 쪽이 `남음`이나 `뒤에 신청이 취소돼요` 문장의 카탈로그 변수로 이 값을 넣는다.
 */
export function remainingText(expiresAt: string, now: Date): string {
  const totalMinutes = Math.floor((Date.parse(expiresAt) - now.getTime()) / MINUTE_MS);
  if (totalMinutes < 1) {
    return i18n.t("common:duration.minutes", { minutes: 1 });
  }
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  if (days > 0) {
    return hours === 0
      ? i18n.t("group-room:timeText.remaining.days", { count: days })
      : i18n.t("group-room:timeText.remaining.daysHours", { days, hours });
  }
  return hours > 0
    ? i18n.t("common:duration.hours", { hours })
    : i18n.t("common:duration.minutes", { minutes: totalMinutes });
}
