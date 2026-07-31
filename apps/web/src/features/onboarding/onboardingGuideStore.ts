/**
 * 온보딩 가이드(G1~G5) "이미 봤는가" 플래그의 영속 저장
 * (`apps/mobile/lib/onboardingGuideStore.ts`에서 이식 — BY-334.
 * 스펙: `SCR-G1-G5-onboarding-guide.md` Data Contract).
 *
 * 요구는 두 가지다: (1) 재실행 후에도 살아남는 영속 저장, (2) 화면 코드가 저장소를 직접
 * 만지지 않도록 하나의 모듈 뒤에 캡슐화. 그래서 주입형 어댑터 모양을 유지한다.
 *
 * **서버 API 계약이 아니다** — `packages/types`에 넣지 않는다. "온보딩 완료 여부"를 서버에
 * 동기화한다는 결정은 어디에도 없다.
 *
 * ## 모바일판과의 차이 (이식 결정)
 *
 * 저장소가 `expo-secure-store` → **`localStorage`**로 바뀐다(키·값은 동일:
 * `focuson.onboardingGuideSeen` = `"1"`). 비밀 값이 아니라 보안 저장소가 필요 없고, 원격
 * 웹뷰 아키텍처에서 웹이 쓸 수 있는 영속 저장소가 이것이다(ADR-0003).
 *
 * ⚠️ **플래그 유실 가능성을 수용한다**(BY-334 확정). iOS가 저장 공간 압박 시 웹 데이터를
 * 지울 수 있고 도메인에도 묶이는데, 최악의 결과가 "가이드를 한 번 더 본다"에 그친다 —
 * 세션 기록과 달리 잃어도 무해한 값이라 네이티브 저장으로 되돌리지 않는다.
 */

const GUIDE_SEEN_KEY = "focuson.onboardingGuideSeen";
const GUIDE_SEEN_VALUE = "1";

export interface OnboardingGuideStore {
  /** 가이드를 이미 봤으면 true. 저장값이 없으면 false. */
  hasSeenGuide(): Promise<boolean>;
  /** 가이드 플로우가 끝났을 때(완료·건너뛰기·X 모두) 호출 — 멱등. */
  markGuideSeen(): Promise<void>;
}

/**
 * localStorage는 동기지만 인터페이스는 모바일판과 동일하게 Promise를 유지한다 —
 * 화면·플로우 코드가 저장소 종류를 몰라도 되게 한다.
 */
export const localStorageOnboardingGuideStore: OnboardingGuideStore = {
  hasSeenGuide() {
    // 접근 자체가 throw할 수 있다(프라이버시 모드 등) — 아래 최상위 함수가 삼킨다.
    return Promise.resolve(localStorage.getItem(GUIDE_SEEN_KEY) === GUIDE_SEEN_VALUE);
  },
  markGuideSeen() {
    // 같은 값을 다시 써도 결과가 같다 — 멱등 요구를 저장소 수준에서 만족한다.
    localStorage.setItem(GUIDE_SEEN_KEY, GUIDE_SEEN_VALUE);
    return Promise.resolve();
  },
};

/** 테스트·개발용 인메모리 구현. 영속되지 않으므로 실제 앱에서는 쓰지 않는다. */
export function createMemoryOnboardingGuideStore(seen = false): OnboardingGuideStore {
  let hasSeen = seen;
  return {
    hasSeenGuide: () => Promise.resolve(hasSeen),
    markGuideSeen: () => {
      hasSeen = true;
      return Promise.resolve();
    },
  };
}

let store: OnboardingGuideStore = localStorageOnboardingGuideStore;

/** 저장소 구현체를 교체한다(테스트용). */
export function setOnboardingGuideStore(next: OnboardingGuideStore): void {
  store = next;
}

/** 테스트 격리용 — 기본(localStorage) 구현으로 되돌린다. */
export function resetOnboardingGuideStore(): void {
  store = localStorageOnboardingGuideStore;
}

/**
 * 가이드를 이미 봤는지 조회한다.
 *
 * **조회 실패는 "아직 못 봤다"로 떨어진다.** 저장값이 없을 때와 같은 결과이며, 최악의 경우가
 * "안내를 한 번 더 본다"에 그친다 — 반대로 처리하면 저장소 오류 하나로 사용자가 안내를
 * 영영 못 보게 된다. 어느 쪽이든 세션 시작은 막히지 않는다(가이드는 관문이 아니라 길목).
 */
export async function hasSeenOnboardingGuide(): Promise<boolean> {
  try {
    return await store.hasSeenGuide();
  } catch (error) {
    console.warn("[onboarding-guide] 가이드 열람 여부 조회 실패 — 가이드를 노출한다", error);
    return false;
  }
}

/**
 * 가이드 플로우가 끝났음을 기록한다(완료·건너뛰기 동일 — 스펙 Data Contract).
 *
 * **저장에 실패해도 reject하지 않는다.** "건너뛰어도 세션은 이어서 시작"(2026-07-26 확정)이
 * 저장소 사정으로 깨지면 안 된다 — 실패하면 다음 '집중 시작'에서 가이드가 한 번 더 뜰 뿐이다.
 */
export async function markOnboardingGuideSeen(): Promise<void> {
  try {
    await store.markGuideSeen();
  } catch (error) {
    console.warn("[onboarding-guide] 가이드 열람 기록 저장 실패 — 세션 진행은 계속한다", error);
  }
}
