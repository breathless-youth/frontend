import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

/**
 * U1 업데이트 안내 시트의 **노출 게이트**
 * (`frontend/docs/screens/SCR-U1-update-sheet.md` Exposure Control).
 *
 * 이 화면의 성공 기준은 "홈에서 보인다"가 아니라 **"기본 상태에서 절대 보이지 않고, 플래그를
 * 켰을 때만 보인다"**이다. 그래서 게이트 로직을 화면 컴포넌트에 인라인하지 않고 여기 모았다 —
 * 컴포넌트는 `visible` prop만 받는 순수 프레젠테이션으로 남는다.
 *
 * ## 버전 체크 계약은 없다
 *
 * 이름에 "업데이트"가 들어가지만 **앱 버전 업데이트 시트가 아니다.** V1.2 로그인 도입 예고
 * 안내다. `packages/types`에도 ai-wiki에도 앱 버전·최소 요구 버전·강제 업데이트 여부·스토어
 * URL에 해당하는 계약이 **하나도 없다**(스펙 Data Contract에서 전수 확인). 따라서
 * `currentVersion`/`minRequiredVersion`/`forceUpdate`/`storeUrl` 같은 필드를 만들지 않고,
 * 버전 비교 로직도 두지 않는다. 노출 여부는 아래 플래그 하나로만 결정한다.
 *
 * ## 서버 계약이 아니다
 *
 * `enabled`/`seen` 어느 쪽도 서버와 주고받지 않는다 — `packages/types`에 export하지 않는다.
 */

const UPDATE_NOTICE_SEEN_KEY = "focuson.updateNoticeSeen";
const UPDATE_NOTICE_SEEN_VALUE = "1";

/**
 * `app.json`의 `expo.extra.updateNoticeEnabled` 키 이름.
 * 주입 경로는 `lib/userApi.ts`·`lib/statsApi.ts`가 `apiBaseUrl`에 쓰는 것과 동일한
 * `app.json extra.*` → `Constants.expoConfig?.extra?.*` 패턴이다(새 주입 수단을 만들지 않는다).
 */
export const UPDATE_NOTICE_ENABLED_KEY = "updateNoticeEnabled";

/**
 * 외부 주입 플래그를 읽는다. **기본값은 꺼짐이고, 켜짐은 boolean `true` 하나뿐이다.**
 *
 * fail-closed: 키가 없거나(undefined) `null`이거나 boolean이 아닌 값(문자열 `"true"`, `1` 등
 * 오타성 설정 포함)은 전부 **꺼짐**으로 본다. "애매하면 띄운다"는 이 화면에서 가장 나쁜
 * 실패 모드다 — V1.2 로그인이 실제로 나오기 전에 예고가 뜨면 없는 기능을 약속하게 된다.
 *
 * 매 호출마다 읽는다(모듈 로드 시점에 캐시하지 않는다) — 값이 바뀌면 다음 판정부터 반영된다.
 */
export function isUpdateNoticeEnabled(): boolean {
  try {
    const raw: unknown = Constants.expoConfig?.extra?.[UPDATE_NOTICE_ENABLED_KEY];
    return raw === true;
  } catch (error) {
    // `expoConfig` 접근 자체가 실패하는 환경(설정 누락 등)에서도 꺼짐으로 떨어진다.
    console.warn("[update-notice] 노출 플래그 조회 실패 — 노출하지 않는다", error);
    return false;
  }
}

/**
 * "이미 봤음"의 영속 저장. `OnboardingGuideStore`(`lib/onboardingGuideStore.ts`)와 같은
 * 주입형 어댑터 모양이다 — 화면 코드가 저장소 라이브러리를 직접 import하지 않게 한다.
 *
 * 저장소는 이미 설치된 `expo-secure-store`를 재사용한다(새 의존성 추가 금지 — 루트 CLAUDE.md).
 * 키 네이밍도 기존 관례(`focuson.deviceId`, `focuson.userId`, `focuson.onboardingGuideSeen`)를
 * 따른다.
 *
 * ⚠️ `expo-secure-store`는 웹에서 동작하지 않는다 — 아래 게이트가 조회 실패를 "노출 안 함"으로
 * 처리하므로 웹에서는 플래그를 켜도 시트가 뜨지 않는다. V1.0 배포 대상은 네이티브 앱이다.
 */
export interface UpdateNoticeStore {
  /** 안내를 이미 봤으면 true. 저장값이 없으면 false. */
  hasSeenUpdateNotice(): Promise<boolean>;
  /** 안내를 닫았을 때 호출 — 멱등. */
  markUpdateNoticeSeen(): Promise<void>;
}

export const secureStoreUpdateNoticeStore: UpdateNoticeStore = {
  async hasSeenUpdateNotice() {
    return (await SecureStore.getItemAsync(UPDATE_NOTICE_SEEN_KEY)) === UPDATE_NOTICE_SEEN_VALUE;
  },
  async markUpdateNoticeSeen() {
    // 같은 값을 다시 써도 결과가 같다 — 멱등 요구를 저장소 수준에서 만족한다.
    await SecureStore.setItemAsync(UPDATE_NOTICE_SEEN_KEY, UPDATE_NOTICE_SEEN_VALUE);
  },
};

/** 테스트·개발용 인메모리 구현. 영속되지 않으므로 실제 앱에서는 쓰지 않는다. */
export function createMemoryUpdateNoticeStore(seen = false): UpdateNoticeStore {
  let hasSeen = seen;
  return {
    hasSeenUpdateNotice: () => Promise.resolve(hasSeen),
    markUpdateNoticeSeen: () => {
      hasSeen = true;
      return Promise.resolve();
    },
  };
}

let store: UpdateNoticeStore = secureStoreUpdateNoticeStore;

/** 저장소 구현체를 교체한다(테스트, 또는 저장소 종류가 확정됐을 때의 부트스트랩). */
export function setUpdateNoticeStore(next: UpdateNoticeStore): void {
  store = next;
}

/** 테스트 격리용 — 기본(SecureStore) 구현으로 되돌린다. */
export function resetUpdateNoticeStore(): void {
  store = secureStoreUpdateNoticeStore;
}

/**
 * 시트를 띄워야 하는가. **`enabled === true` 그리고 `seen === false`일 때만 true**다
 * (스펙 Interaction Contract 1행).
 *
 * **게이트 전체가 fail-closed다.** 저장소 조회가 실패하면 "안 봤다"가 아니라 **"노출하지 않음"**
 * 으로 떨어진다 — `onboardingGuideStore`와 반대 방향이라는 점을 분명히 해 둔다. 가이드는
 * 못 보면 손해라 한 번 더 보여주는 쪽이 안전하지만, 이 시트는 홈을 가리는 모달이고 기본
 * 비노출이 정책이라 "확신할 수 없으면 띄우지 않는다"가 안전한 쪽이다.
 *
 * ⚠️ 스펙이 명시한 fail-closed는 플래그 파싱에 관한 것이고 저장소 조회 실패는 규정하지 않았다 —
 * 위 근거로 같은 방향(fail-closed)을 택했다. 반대로 확정되면 이 catch 하나만 바꾼다.
 *
 * 절대 reject하지 않는다 — 홈 렌더가 이 판정 때문에 깨지면 안 된다.
 */
export async function shouldShowUpdateNotice(): Promise<boolean> {
  if (!isUpdateNoticeEnabled()) {
    return false;
  }
  try {
    return !(await store.hasSeenUpdateNotice());
  } catch (error) {
    console.warn("[update-notice] 열람 여부 조회 실패 — 노출하지 않는다", error);
    return false;
  }
}

/**
 * "봤다"를 기록한다(1회 노출 보장).
 *
 * **저장에 실패해도 reject하지 않는다.** 시트는 이미 닫힌 뒤이고, 최악의 경우가 "다음 실행에서
 * 한 번 더 뜬다"에 그친다 — 홈 화면 동작을 막을 이유가 없다.
 *
 * ⚠️ 재노출 기준은 단일 boolean이다. "플래그를 껐다가 다른 공지로 다시 켰을 때" 같은 케이스는
 * 정의돼 있지 않다(공지 ID 개념이 wiki에 없다).
 * TODO(SCR-U1-update-sheet.md Review Checklist): 공지 ID 단위 재노출이 필요해지면 이 키를
 *   공지 ID로 확장한다.
 */
export async function markUpdateNoticeSeen(): Promise<void> {
  try {
    await store.markUpdateNoticeSeen();
  } catch (error) {
    console.warn("[update-notice] 열람 기록 저장 실패 — 다음 실행에서 다시 뜰 수 있다", error);
  }
}
