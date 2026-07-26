import * as SecureStore from "expo-secure-store";

/**
 * 온보딩 가이드(G1~G5) "이미 봤는가" 플래그의 영속 저장
 * (`frontend/docs/screens/SCR-G1-G5-onboarding-guide.md` Data Contract).
 *
 * 스펙이 고정한 것은 아래 인터페이스뿐이다 — 저장소 구현체는 빌더 재량이며, 요구는 두 가지다:
 * (1) 앱 재실행 후에도 살아남는 영속 저장, (2) 화면 코드가 저장소 라이브러리를 직접 import하지
 * 않도록 하나의 모듈 뒤에 캡슐화. 그래서 `lib/cameraPermission.ts`와 같은 주입형 어댑터 모양을 쓴다.
 *
 * **서버 API 계약이 아니다** — `packages/types`에 넣지 않는다. "온보딩 완료 여부"를 서버에
 * 동기화한다는 결정은 어디에도 없다(스펙 Data Contract "상상 계약 금지").
 *
 * ## 왜 `expo-secure-store`인가
 *
 * 이미 설치돼 있고(`lib/deviceId.ts`가 기기 UUID 저장에 쓰는 중) 앱 재실행 후에도 값이 남는다.
 * 새 의존성(`@react-native-async-storage/async-storage`, MMKV 등)을 추가하지 않고 지금 바로
 * 요구사항을 만족하는 유일한 선택지였다 — 루트 CLAUDE.md "검증되지 않은 네이티브 라이브러리를
 * 추측으로 설치하지 말 것".
 *
 * ⚠️ 다만 이 플래그는 비밀 값이 아니므로 보안 저장소가 과한 선택일 수 있다(스펙도 "보안 저장소가
 * 적절한지 확인되지 않았다"고 남겼다). 저장소 종류는 리뷰 항목으로 열려 있다.
 * TODO(SCR-G1-G5-onboarding-guide.md Review Checklist): 영속 저장소 확정 시
 *   `setOnboardingGuideStore()`로 구현체만 교체한다 — 화면 코드는 바뀌지 않는다.
 *
 * ⚠️ `expo-secure-store`는 웹에서 동작하지 않는다(`expo start --web`). 아래 최상위 함수들이
 * 예외를 삼키므로 웹에서는 "아직 못 봤다"로 취급돼 가이드가 매번 뜬다 — V1.0 배포 대상은
 * 네이티브 앱이라 허용 가능한 열화다.
 */

const GUIDE_SEEN_KEY = "focuson.onboardingGuideSeen";
const GUIDE_SEEN_VALUE = "1";

export interface OnboardingGuideStore {
  /** 가이드를 이미 봤으면 true. 저장값이 없으면 false. */
  hasSeenGuide(): Promise<boolean>;
  /** 가이드 플로우가 끝났을 때(완료·건너뛰기 모두) 호출 — 멱등. */
  markGuideSeen(): Promise<void>;
}

export const secureStoreOnboardingGuideStore: OnboardingGuideStore = {
  async hasSeenGuide() {
    return (await SecureStore.getItemAsync(GUIDE_SEEN_KEY)) === GUIDE_SEEN_VALUE;
  },
  async markGuideSeen() {
    // 같은 값을 다시 써도 결과가 같다 — 멱등 요구를 저장소 수준에서 만족한다.
    await SecureStore.setItemAsync(GUIDE_SEEN_KEY, GUIDE_SEEN_VALUE);
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

let store: OnboardingGuideStore = secureStoreOnboardingGuideStore;

/** 저장소 구현체를 교체한다(테스트, 또는 저장소 종류가 확정됐을 때의 부트스트랩). */
export function setOnboardingGuideStore(next: OnboardingGuideStore): void {
  store = next;
}

/** 테스트 격리용 — 기본(SecureStore) 구현으로 되돌린다. */
export function resetOnboardingGuideStore(): void {
  store = secureStoreOnboardingGuideStore;
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
