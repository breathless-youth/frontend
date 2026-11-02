import { todayKstDateKey } from "@/lib/dateKst";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const pad2 = (value: number) => String(value).padStart(2, "0");

/**
 * 순공 시계 표기
 *
 * 이번 주 순공은 100시간을 넘을 수 있어 시는 자리 수를 정하지 않고 분과 초만 두 자리로 채운다.
 */
export function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  return `${hours}:${pad2(minutes)}:${pad2(sec % 60)}`;
}

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
    return `${minutes}분`;
  }
  return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
}

/**
 * 한국 시간 달력의 날짜 번호
 *
 * 기록 탭과 같은 날짜 경계를 쓰려고 기기 시간대 대신 한국 시간 날짜로 센다.
 */
function kstDayNumber(at: Date): number {
  return Date.parse(`${todayKstDateKey(at)}T00:00:00Z`) / DAY_MS;
}

/**
 * 지난 때 표기
 *
 * 흐른 시간이 아니라 한국 시간 날짜 차이로 나눠서 자정을 넘으면 1시간 안이라도 어제다.
 * 같은 날이면 흐른 시간을 내려 적고 1시간이 안 되면 받은 말을 쓴다.
 * 기기 시계가 서버보다 늦어 지금보다 뒤의 시각이 와도 음수 대신 같은 날 1시간 안으로 본다.
 */
function pastText(at: string, now: Date, withinHour: string): string {
  const then = new Date(at);
  const days = Math.max(0, kstDayNumber(now) - kstDayNumber(then));
  if (days === 0) {
    const hours = Math.floor(Math.max(0, now.getTime() - then.getTime()) / HOUR_MS);
    return hours < 1 ? withinHour : `${hours}시간 전`;
  }
  return days === 1 ? "어제" : `${days}일 전`;
}

/**
 * 마지막으로 공부한 때
 *
 * 공부한 적이 없는 멤버에게 쓸 문구는 정해지지 않아 새로 만들지 않고 표기를 비운다.
 */
export function lastStudiedText(lastStudiedAt: string | null, now: Date): string | null {
  return lastStudiedAt === null ? null : pastText(lastStudiedAt, now, "오늘");
}

export function appliedAtText(appliedAt: string, now: Date): string {
  return `${pastText(appliedAt, now, "방금")} 신청`;
}

/**
 * 남은 시간 표기
 *
 * 남은 시간이 실제보다 길어 보이지 않게 단위마다 내려서 적는다.
 * 만료 직후 목록이 다시 오기 전에는 1분 미만이나 지난 시각이 올 수 있어 `0분`이나 음수 대신 `1분`을 쓴다.
 * 호출하는 쪽이 `남음`이나 `뒤에 신청이 취소돼요`를 붙인다.
 */
export function remainingText(expiresAt: string, now: Date): string {
  const totalMinutes = Math.floor((Date.parse(expiresAt) - now.getTime()) / MINUTE_MS);
  if (totalMinutes < 1) {
    return "1분";
  }
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  if (days > 0) {
    return hours === 0 ? `${days}일` : `${days}일 ${hours}시간`;
  }
  return hours > 0 ? `${hours}시간` : `${totalMinutes}분`;
}
