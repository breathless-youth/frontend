/**
 * 프리미엄 기능 사전 신청 실험(페이크도어)의 규칙
 *
 * 화면은 그리기만 하고 가격 배정·노출 판정·입력 검사는 여기 순수 함수로 둔다.
 * 설계와 계약은 docs/superpowers/specs/2026-11-24-premium-fake-door-experiment-design.md(BY-1392).
 */

/** 실험을 일찍 끄려면 이 값을 false로 바꿔 웹만 배포한다(설계 7절). */
export const PREMIUM_FAKE_DOOR_ENABLED = true;

/** 이 시각이 지나면 카드가 저절로 사라진다. 2026-11-30 23:59:59 KST. */
export const PREMIUM_FAKE_DOOR_ENDS_AT_MS = Date.parse("2026-11-30T23:59:59+09:00");

export const PREMIUM_PRICES = [2900, 5900] as const;
export type PremiumPrice = (typeof PREMIUM_PRICES)[number];

export type PremiumPlacement = "RESULT" | "HOME";

/** 기대 기능 id. 서버 계약의 `expectedFeature` 값과 같고 화면에 보이는 순서다. */
export const PREMIUM_FEATURES = [
  "AI_PLANNER",
  "AI_REPORT",
  "GROUP_MATCHING",
  "SMART_NOTIFICATION",
  "TIMER_BACKGROUND",
  "CHARACTER_ITEMS",
] as const;
export type PremiumFeature = (typeof PREMIUM_FEATURES)[number];

/**
 * 사용자 번호로 가격을 정한다
 *
 * 같은 사람은 기기와 문서가 달라도 늘 같은 가격을 본다.
 * 번호의 홀짝을 그대로 쓰면 다른 실험의 나눔과 겹칠 수 있어 실험 이름을 섞은 FNV-1a 해시로 나눈다.
 */
export function assignPremiumPrice(userId: number): PremiumPrice {
  const key = `premium-fake-door:${userId}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return PREMIUM_PRICES[hash % 2];
}

/**
 * 사용자별 노출 기록
 *
 * 홈과 결과 화면은 다른 웹뷰 문서라 기기 저장소로 나눠 본다.
 */
export interface PremiumFakeDoorRecord {
  /** 결과 화면에서 카드를 한 번이라도 보였다. 그 뒤로 홈에는 보이지 않는다. */
  shownOnResult: boolean;
  dismissed: boolean;
  applied: boolean;
  /** `premium_fake_door_viewed`를 보냈다. 사용자당 한 번만 보낸다. */
  viewedSent: boolean;
}

export const EMPTY_PREMIUM_RECORD: PremiumFakeDoorRecord = {
  shownOnResult: false,
  dismissed: false,
  applied: false,
  viewedSent: false,
};

export interface PremiumCardContext {
  placement: PremiumPlacement;
  nowMs: number;
  /** 토큰 출처가 없는 구 앱은 이 API를 부를 수 없어 보이지 않는다. */
  hasTokenSource: boolean;
  /** 가격이 원화라 한국어 화면에만 보인다. */
  korean: boolean;
  record: PremiumFakeDoorRecord;
  enabled?: boolean;
}

export function canShowPremiumCard({
  placement,
  nowMs,
  hasTokenSource,
  korean,
  record,
  enabled = PREMIUM_FAKE_DOOR_ENABLED,
}: PremiumCardContext): boolean {
  if (!enabled || nowMs > PREMIUM_FAKE_DOOR_ENDS_AT_MS) return false;
  if (!hasTokenSource || !korean) return false;
  if (record.dismissed || record.applied) return false;
  return placement === "RESULT" || !record.shownOnResult;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface EmailStepErrors {
  email: "required" | "format" | null;
  consent: boolean;
}

/** 이메일·동의 단계 검사. 서버도 형식을 다시 본다. 앞뒤 공백은 빼고 본다. */
export function validateEmailStep(email: string, consent: boolean): EmailStepErrors {
  const trimmed = email.trim();
  return {
    email: trimmed === "" ? "required" : EMAIL_PATTERN.test(trimmed) ? null : "format",
    consent: !consent,
  };
}
