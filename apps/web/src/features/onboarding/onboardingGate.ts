/**
 * 온보딩을 보여 줄 계정인지 판정
 *
 * 앱이 이번 실행에서 계정을 새로 만들었으면 웹뷰 주소에 `newUser=1`을 붙인다(`apps/mobile/lib/auth.ts`).
 * 그 계정에 진행 중 기록을 남겨 중간에 앱을 꺼도 다음 실행에서 다시 보여 주고, 끝내면 다시 보여 주지 않는다.
 * 서버에는 사용자별 표시를 둘 자리가 없어 기기 저장소에 계정별로 남긴다.
 */
export type OnboardingDecision = "pending" | "onboarding" | "home";

export type OnboardingRecord = "pending" | "settled" | null;

const keyOf = (userId: number) => `focusmakers:onboarding:${userId}`;

// 끝남은 메모리에도 둔다. 저장에 실패해도 새 계정 표시가 남은 이번 실행에서 온보딩으로 되돌아가지 않는다.
const settledThisDocument = new Set<number>();

export function onboardingRecord(userId: number): OnboardingRecord {
  if (settledThisDocument.has(userId)) return "settled";
  try {
    const value = localStorage.getItem(keyOf(userId));
    return value === "pending" || value === "settled" ? value : null;
  } catch {
    return null;
  }
}

function writeRecord(userId: number, value: Exclude<OnboardingRecord, null>): void {
  try {
    localStorage.setItem(keyOf(userId), value);
  } catch {
    // 남기지 못하면 중간에 끈 계정이 다음 실행에서 온보딩을 못 볼 뿐이다.
  }
}

export function markOnboardingPending(userId: number): void {
  writeRecord(userId, "pending");
}

export function markOnboardingSettled(userId: number): void {
  settledThisDocument.add(userId);
  writeRecord(userId, "settled");
}

// 앱 안 이동은 URL에서 쿼리를 지우므로 모듈을 읽는 시점에 한 번 판정해 보관한다.
function readNewUserFlag(): boolean {
  return new URLSearchParams(window.location.search).get("newUser") === "1";
}

let newUserCache: boolean | null = readNewUserFlag();

export function isNewUserLaunch(): boolean {
  newUserCache ??= readNewUserFlag();
  return newUserCache;
}

export function __resetOnboardingGateForTests(): void {
  newUserCache = null;
  settledThisDocument.clear();
}

export function decideOnboarding(input: {
  record: OnboardingRecord;
  newUser: boolean;
}): Exclude<OnboardingDecision, "pending"> {
  if (input.record === "settled") return "home";
  if (input.record === "pending" || input.newUser) return "onboarding";
  return "home";
}
