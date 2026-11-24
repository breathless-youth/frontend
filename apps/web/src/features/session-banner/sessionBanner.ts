import type { DailyStudyStat } from "@focusmakers/types";

import { addDaysToDateKey } from "@/features/records/recordsFormat";
import type { DateRange } from "@/lib/statsApi";

/**
 * 세션 한 줄 배너 노출 실험의 규칙
 *
 * 화면과 훅은 그리기와 저장만 하고 기간, 분배, 대상 판정은 여기 순수 함수로 둔다.
 */

/** 실험을 일찍 끄려면 이 값을 false로 바꿔 웹만 배포한다. */
export const SESSION_BANNER_ENABLED = true;

/** 이 시각이 지나면 배너가 저절로 사라진다. */
export const SESSION_BANNER_ENDS_AT_MS = Date.parse("2026-11-30T23:59:59+09:00");

/** 배너가 보인 시간이 이만큼 쌓일 때마다 노출을 한 번 세고 다음 문구로 바꾼다. */
export const SESSION_BANNER_ROTATE_MS = 5 * 60 * 1000;

/** 문구 번호. 분석 이벤트에는 글자 대신 이 번호만 싣는다. */
export const SESSION_BANNER_COPIES = [1, 2, 3] as const;
export type SessionBannerCopy = (typeof SESSION_BANNER_COPIES)[number];

export const SESSION_BANNER_COPY_KEYS = {
  1: "banner.copy1",
  2: "banner.copy2",
  3: "banner.copy3",
} as const satisfies Record<SessionBannerCopy, string>;

export type SessionBannerGroup = "exposed" | "control" | "not_eligible";

/** 대상 판정에 쓰는 기간의 날 수 */
const LOOKBACK_DAYS = 14;
/** 이 순공 시간을 넘긴 날만 공부한 날로 센다. */
const STUDY_DAY_MIN_FOCUS_SEC = 60;
const MIN_STUDY_DAYS = 3;

/**
 * 사용자 번호로 배너를 볼지 정한다
 *
 * 같은 사람은 기기와 문서가 달라도 늘 같은 군이다.
 * 실험 이름을 섞은 FNV-1a 해시를 10으로 나눈 나머지가 7보다 작으면 배너를 본다.
 * FNV-1a의 마지막 비트는 글자들의 홀짝으로만 정해져서 그대로 나누면 프리미엄 가격 분배(해시의 홀짝)와 같이 움직인다.
 * 그래서 나누기 전에 모든 비트를 한 번 더 섞는다.
 */
export function assignSessionBannerArm(userId: number): "exposed" | "control" {
  const key = `session-line-banner:${userId}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
  hash = (hash ^ (hash >>> 16)) >>> 0;
  return hash % 10 < 7 ? "exposed" : "control";
}

/**
 * 대상 판정에 쓰는 기간
 *
 * 지금 하고 있는 세션이 자기 자신을 대상으로 만들지 않도록 판정일 당일은 뺀다.
 */
export function sessionBannerStatsRange(todayKey: string): DateRange {
  return {
    from: addDaysToDateKey(todayKey, -LOOKBACK_DAYS),
    to: addDaysToDateKey(todayKey, -1),
  };
}

/** 기간 안에 순공 1분 이상인 날이 3일 이상인가 */
export function isSessionBannerEligible(dailyList: readonly DailyStudyStat[]): boolean {
  return (
    dailyList.filter((day) => day.focusSec >= STUDY_DAY_MIN_FOCUS_SEC).length >= MIN_STUDY_DAYS
  );
}

export function isSessionBannerRunning(nowMs: number, enabled = SESSION_BANNER_ENABLED): boolean {
  return enabled && nowMs <= SESSION_BANNER_ENDS_AT_MS;
}

export function canShowSessionBanner({
  group,
  nowMs,
  applied,
  enabled = SESSION_BANNER_ENABLED,
}: {
  group: SessionBannerGroup | null;
  nowMs: number;
  /** 사전 신청을 마친 사용자에게는 같은 신청을 다시 권하지 않는다. */
  applied: boolean;
  enabled?: boolean;
}): boolean {
  return isSessionBannerRunning(nowMs, enabled) && group === "exposed" && !applied;
}
