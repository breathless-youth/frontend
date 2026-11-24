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

/**
 * 카드 자리. 서버 계약은 `HOME`도 받지만 홈 카드는 뺐으므로 화면은 늘 `RESULT`를 보낸다.
 */
export type PremiumPlacement = "RESULT" | "HOME";
export const PREMIUM_PLACEMENT: PremiumPlacement = "RESULT";

/**
 * 화면에 보이는 기능 id와 순서. 서버 계약의 `expectedFeature` 값과 같다.
 * 서버는 예전 값 `SMART_NOTIFICATION`, `APP_LOCK`도 받지만 화면에서는 뺐고 4번째 자리는 `PHONE_CALL`이다.
 */
export const PREMIUM_FEATURES = [
  "AI_PLANNER",
  "AI_REPORT",
  "GROUP_MATCHING",
  "PHONE_CALL",
  "TIMER_BACKGROUND",
  "CHARACTER_ITEMS",
] as const;
export type PremiumFeature = (typeof PREMIUM_FEATURES)[number];

/** 가격 카드의 "하루 약 N원". 월 가격을 30일로 나눠 반올림한다. */
export function dailyPremiumPrice(price: PremiumPrice): number {
  return Math.round(price / 30);
}

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
 * 결과 화면은 세션마다 새로 열리는 문서라 기기 저장소에 둔다.
 */
export interface PremiumFakeDoorRecord {
  dismissed: boolean;
  applied: boolean;
  /** `premium_fake_door_viewed`를 보냈다. 사용자당 한 번만 보낸다. */
  viewedSent: boolean;
}

export const EMPTY_PREMIUM_RECORD: PremiumFakeDoorRecord = {
  dismissed: false,
  applied: false,
  viewedSent: false,
};

export interface PremiumCardContext {
  nowMs: number;
  /** 토큰 출처가 없는 구 앱은 이 API를 부를 수 없어 보이지 않는다. */
  hasTokenSource: boolean;
  /** 가격이 원화라 한국어 화면에만 보인다. */
  korean: boolean;
  record: PremiumFakeDoorRecord;
  enabled?: boolean;
}

export function canShowPremiumCard({
  nowMs,
  hasTokenSource,
  korean,
  record,
  enabled = PREMIUM_FAKE_DOOR_ENABLED,
}: PremiumCardContext): boolean {
  if (!enabled || nowMs > PREMIUM_FAKE_DOOR_ENDS_AT_MS) return false;
  if (!hasTokenSource || !korean) return false;
  return !record.dismissed && !record.applied;
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
