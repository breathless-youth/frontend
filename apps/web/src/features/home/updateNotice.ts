/**
 * U1 업데이트 안내 시트의 **노출 게이트**
 * (`apps/mobile/lib/updateNotice.ts`에서 이식 — BY-329. 스펙: SCR-U1-update-sheet.md Exposure Control).
 *
 * 이 화면의 성공 기준은 "홈에서 보인다"가 아니라 **"기본 상태에서 절대 보이지 않고, 플래그를
 * 켰을 때만 보인다"**이다. 게이트 로직을 화면 컴포넌트에 인라인하지 않고 여기 모은다 —
 * 컴포넌트는 `visible` prop만 받는 순수 프레젠테이션으로 남는다.
 *
 * ## 모바일판과의 차이 (이식 결정)
 *
 * - 노출 플래그: `app.json extra.updateNoticeEnabled`(boolean) → **`VITE_UPDATE_NOTICE_ENABLED`
 *   env**. Vite env는 문자열뿐이라 켜짐 값은 정확히 `"true"` 하나다 — fail-closed 방향은 동일.
 * - 저장소: `expo-secure-store` → **`localStorage`** (키·값은 모바일과 동일: `focuson.updateNoticeSeen`=`"1"`).
 *   비밀정보가 아니라 SecureStore 상당의 보안 저장이 필요 없다.
 * - 주입형 어댑터·fail-closed 게이트·절대 reject하지 않는 계약은 그대로다.
 *
 * ## 버전 체크 계약은 없다
 *
 * 이름에 "업데이트"가 들어가지만 앱 버전 업데이트 시트가 아니다 — V1.2 로그인 도입 예고 안내다.
 * `currentVersion`/`minRequiredVersion`/`forceUpdate`/`storeUrl` 같은 필드·비교 로직을 만들지
 * 않는다(계약이 어디에도 없다 — 스펙 Data Contract). `enabled`/`seen` 어느 쪽도 서버와 주고받지
 * 않는다.
 */

const UPDATE_NOTICE_SEEN_KEY = "focuson.updateNoticeSeen";
const UPDATE_NOTICE_SEEN_VALUE = "1";

/**
 * 외부 주입 플래그를 읽는다. **기본값은 꺼짐이고, 켜짐은 문자열 `"true"` 하나뿐이다.**
 *
 * fail-closed: 키가 없거나 다른 값(`"TRUE"`, `"1"`, `"false"` 등 오타성 설정 포함)은 전부
 * **꺼짐**으로 본다. "애매하면 띄운다"는 이 화면에서 가장 나쁜 실패 모드다 — V1.2 로그인이
 * 실제로 나오기 전에 예고가 뜨면 없는 기능을 약속하게 된다.
 *
 * 매 호출마다 읽는다(모듈 로드 시점에 캐시하지 않는다) — 테스트의 `vi.stubEnv`가 그대로 반영된다.
 */
export function isUpdateNoticeEnabled(): boolean {
  return import.meta.env.VITE_UPDATE_NOTICE_ENABLED === "true";
}

/**
 * "이미 봤음"의 영속 저장. 주입형 어댑터 — 화면 코드가 저장소를 직접 만지지 않게 한다.
 * localStorage는 동기지만 인터페이스는 모바일판과 동일하게 Promise를 유지한다(테스트·화면
 * 코드가 저장소 종류와 무관해진다).
 */
export interface UpdateNoticeStore {
  /** 안내를 이미 봤으면 true. 저장값이 없으면 false. */
  hasSeenUpdateNotice(): Promise<boolean>;
  /** 안내를 닫았을 때 호출 — 멱등. */
  markUpdateNoticeSeen(): Promise<void>;
}

export const localStorageUpdateNoticeStore: UpdateNoticeStore = {
  hasSeenUpdateNotice() {
    // localStorage 접근은 throw할 수 있다(프라이버시 모드 등) — 게이트의 catch가 fail-closed로 받는다.
    return Promise.resolve(
      localStorage.getItem(UPDATE_NOTICE_SEEN_KEY) === UPDATE_NOTICE_SEEN_VALUE,
    );
  },
  markUpdateNoticeSeen() {
    // 같은 값을 다시 써도 결과가 같다 — 멱등 요구를 저장소 수준에서 만족한다.
    localStorage.setItem(UPDATE_NOTICE_SEEN_KEY, UPDATE_NOTICE_SEEN_VALUE);
    return Promise.resolve();
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

let store: UpdateNoticeStore = localStorageUpdateNoticeStore;

/** 저장소 구현체를 교체한다(테스트용). */
export function setUpdateNoticeStore(next: UpdateNoticeStore): void {
  store = next;
}

/** 테스트 격리용 — 기본(localStorage) 구현으로 되돌린다. */
export function resetUpdateNoticeStore(): void {
  store = localStorageUpdateNoticeStore;
}

/**
 * 시트를 띄워야 하는가. **`enabled === true` 그리고 `seen === false`일 때만 true**다
 * (스펙 Interaction Contract 1행).
 *
 * **게이트 전체가 fail-closed다.** 저장소 조회가 실패하면 "안 봤다"가 아니라 **"노출하지 않음"**
 * 으로 떨어진다 — 기본 비노출이 정책인 모달이라 "확신할 수 없으면 띄우지 않는다"가 안전한 쪽이다.
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
 */
export async function markUpdateNoticeSeen(): Promise<void> {
  try {
    await store.markUpdateNoticeSeen();
  } catch (error) {
    console.warn("[update-notice] 열람 기록 저장 실패 — 다음 실행에서 다시 뜰 수 있다", error);
  }
}
