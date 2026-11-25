/**
 * 프리미엄 기능 사전 신청 실험(페이크도어)의 규칙
 *
 * 화면은 그리기만 하고 가격 배정·노출 판정·입력 검사는 여기 순수 함수로 둔다.
 * 설계와 계약은 docs/superpowers/specs/2026-11-24-premium-fake-door-experiment-design.md(BY-1392).
 */

/** 실험을 일찍 끄려면 이 값을 false로 바꿔 웹만 배포한다(설계 7절). */
export const PREMIUM_FAKE_DOOR_ENABLED = true;

/** 이 시각이 지나면 카드가 저절로 사라진다. 2026-12-03 23:59:59 KST(실험 기간 11/24~12/3). */
export const PREMIUM_FAKE_DOOR_ENDS_AT_MS = Date.parse("2026-12-03T23:59:59+09:00");

/** 방금 끝낸 세션의 기준 시간(`premiumQualifyingSec`)이 이만큼(10분) 넘어야 결과 화면에 카드를 보인다. */
export const PREMIUM_CARD_MIN_FOCUS_SEC = 600;

/** X로 닫은 뒤 이만큼(48시간) 지나면 카드를 다시 보인다. */
export const PREMIUM_CARD_SNOOZE_MS = 48 * 60 * 60 * 1000;

export const PREMIUM_PRICES = [2900, 5900] as const;
export type PremiumPrice = (typeof PREMIUM_PRICES)[number];

/**
 * 신청 화면을 연 자리. 서버 계약은 `HOME`도 받지만 홈 카드는 뺐으므로 결과 화면 카드는 늘 `RESULT`를 보낸다.
 * `SESSION`은 세션 화면 한 줄 배너로 들어온 경우다.
 */
export type PremiumPlacement = "RESULT" | "HOME" | "SESSION";
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
  /** 마지막으로 X로 닫은 시각(ms). 닫은 적이 없으면 null이다. */
  dismissedAt: number | null;
  /**
   * 닫으면 영영 숨기던 예전 기록(`dismissed: true`, 시각 없음)을 아직 옮기지 못했다.
   * 옮기기는 `migrateLegacyDismissal`이 한 번 한다. 옮기지 못한 동안은 예전처럼 숨긴다.
   */
  legacyDismissed: boolean;
  applied: boolean;
  /** `premium_fake_door_viewed`를 보냈다. 사용자당 한 번만 보낸다. */
  viewedSent: boolean;
}

export const EMPTY_PREMIUM_RECORD: PremiumFakeDoorRecord = {
  dismissedAt: null,
  legacyDismissed: false,
  applied: false,
  viewedSent: false,
};

export interface PremiumCardContext {
  nowMs: number;
  /** 토큰 출처가 없는 구 앱은 이 API를 부를 수 없어 보이지 않는다. */
  hasTokenSource: boolean;
  record: PremiumFakeDoorRecord;
  /** 방금 끝낸 세션의 기준 시간(초). `premiumQualifyingSec`로 구한다. */
  qualifyingSec: number;
  enabled?: boolean;
}

/**
 * 카드 노출을 판정할 세션 시간(초)
 *
 * 결과 화면 머리가 보이는 첫 세션의 값을 쓴다. 카메라로 잰 세션은 순공시간이고,
 * 자율 모드(타이머) 세션은 순공을 재지 않아 결과 화면처럼 총 공부시간을 쓴다.
 */
export function premiumQualifyingSec({
  timer,
  focusSec,
  studySec,
}: {
  timer: boolean;
  focusSec: number;
  studySec: number;
}): number {
  return timer ? studySec : focusSec;
}

export function canShowPremiumCard({
  nowMs,
  hasTokenSource,
  record,
  qualifyingSec,
  enabled = PREMIUM_FAKE_DOOR_ENABLED,
}: PremiumCardContext): boolean {
  if (!enabled || nowMs > PREMIUM_FAKE_DOOR_ENDS_AT_MS) return false;
  if (!hasTokenSource) return false;
  if (qualifyingSec < PREMIUM_CARD_MIN_FOCUS_SEC) return false;
  if (record.applied) return false;
  if (record.dismissedAt === null) return !record.legacyDismissed;
  // 기기 시계가 뒤로 가 닫은 시각이 미래가 되면, 그 뒤로 영영 숨기지 않도록 숨김 기간이 끝난 것으로 본다.
  const elapsed = nowMs - record.dismissedAt;
  return elapsed < 0 || elapsed >= PREMIUM_CARD_SNOOZE_MS;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface EmailStepErrors {
  email: "required" | "format" | null;
  /** 만 14세 이상 확인 칸을 체크하지 않았다. */
  age: boolean;
  consent: boolean;
}

/** 이메일·동의 단계 검사. 서버도 형식을 다시 본다. 앞뒤 공백은 빼고 본다. */
export function validateEmailStep(
  email: string,
  ageConfirmed: boolean,
  consent: boolean,
): EmailStepErrors {
  const trimmed = email.trim();
  return {
    email: trimmed === "" ? "required" : EMAIL_PATTERN.test(trimmed) ? null : "format",
    age: !ageConfirmed,
    consent: !consent,
  };
}
