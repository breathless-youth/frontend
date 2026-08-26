import { requireOptionalNativeModule } from "expo-modules-core";

/**
 * 화면 방향 잠금 — **세션(`room/[id]`)만 회전하고 나머지는 전부 세로**(SCR-S3-5-S3-6).
 *
 * ## 왜 `expo-screen-orientation`인가 — P0-3 결정의 정정 (2026-08-01)
 *
 * P0-3은 "react-native-screens가 처리하므로 이 패키지가 불필요"라고 결정했지만, **iOS에서
 * 그 전제가 틀렸다는 것이 소스 추적으로 확인됐다**:
 *
 * - iOS는 회전 판단 시 앱 델리게이트에 마스크를 묻고, Expo의 구현
 *   (`ExpoAppDelegateSubscriberManager.application(_:supportedInterfaceOrientationsFor:)`)은
 *   **구독자가 없으면 Info.plist(`app.json`의 `orientation: "default"` = 전 방향)를 그대로
 *   반환한다.** 이 패키지가 바로 그 구독자다 — 없으면 잠금 자체가 존재하지 않는다.
 * - 세션 회전이 "동작"했던 것은 그 설정 덕이 아니라 `fullScreenModal`이라서다 — presented VC는
 *   UIKit이 직접 마스크를 묻는다. 홈·기록·설정이 회전됐던 이유가 이것이다(2026-08-01 실기기).
 *
 * ## ⚠️ P0-3 정정의 재정정 (BY-444, 2026-08-26) — rn-screens 옵션은 iOS에서 "무해"가 아니다
 *
 * P0-3 정정은 "rn-screens `orientation` 옵션은 iOS에서 아무도 묻지 않으니 남겨도 해가 없다"고
 * 봤지만, 그 뒤로도 iOS 실기기(TestFlight)에서 전 화면이 회전됐다. 소스 추적으로 확인한 원인:
 *
 * - 이 패키지의 iOS 집행자는 앱 델리게이트 구독자가 아니라 **루트 VC**
 *   (`ScreenOrientationViewController.supportedInterfaceOrientations`)이고, 그 구현은
 *   `shouldUseRNScreenOrientation()` — 즉 rn-screens의
 *   `shouldAskScreensForScreenOrientationInViewController:`("orientation이 실린 RNSScreen이
 *   하나라도 있는가") — 가 참이면 **JS 잠금(`lockAsync`)을 무시하고 rn-screens에 양보한다.**
 *   ("호출하는 코드가 Expo 앱에 없다"던 P0-3의 전제가 틀렸다 — 이 패키지 자신이 호출자다.)
 * - 양보받은 rn-screens의 iOS 마스크 산출(전역 스와즐 `UIViewController+RNScreens.mm`)은 우리
 *   계층 구조에서 화면의 `screenOrientation`을 찾지 못하고 전 방향 허용으로 떨어진다.
 * - 그래서 `_layout.tsx`가 전 화면에 orientation 옵션을 싣는 동안, 이 파일의 잠금은 iOS에서
 *   한 번도 집행되지 못했다.
 *
 * 결론: **rn-screens `orientation` 옵션은 Android 전용으로만 싣는다**(`_layout.tsx`의 Platform
 * 분기). iOS 방향의 단일 소유자는 이 파일이다 — 루트 세로 잠금 + 세션(`room/[id]`) 마운트
 * 해제/재잠금 + 소셜룸의 `set-orientation` 브리지(`RemoteWebViewHost`, 양 플랫폼 공통).
 *
 * ## ⚠️ 정적 import 금지 + require를 try/catch로 감싸는 것도 부족한 이유
 *
 * 이 패키지는 네이티브 모듈이라 **Dev Client 재빌드 전 빌드에는 존재하지 않고**, 그때 JS 쪽
 * (`ExpoScreenOrientation.js`)은 평가 시점에 `requireNativeModule`로 동기 throw한다. 두 겹의
 * 함정이 있다(둘 다 2026-08-01 실기기에서 확인):
 *
 * 1. **정적 import** — 모듈 초기화에서 던져 앱 시작 자체가 죽는다.
 * 2. **런타임 require + try/catch** — 그래도 못 잡는다. Metro 런타임의 `guardedLoadModule`
 *    (metro-runtime/src/polyfills/require.js)은 번들 초기화 **밖**(우리처럼 effect 안)에서 처음
 *    require된 모듈의 팩토리가 던지면 **자기 catch로 가로채 `ErrorUtils.reportFatalError`를
 *    부른다** — 예외가 호출자의 try/catch로 전파되지 않고 곧장 레드 스크린이 된다.
 *
 * 그래서 **던지는 require를 아예 하지 않는다**: `requireOptionalNativeModule`(null 반환,
 * throw 없음 — expo-modules-core는 항상 존재하므로 정적 import 안전)로 네이티브 모듈이
 * 실제로 있는지 먼저 조사하고, 있을 때만 패키지를 require한다. 그 경로에서는 패키지 평가가
 * 던질 일이 없다.
 */

type ScreenOrientationModule = typeof import("expo-screen-orientation");

/** `undefined` = 아직 시도 안 함, `null` = 네이티브 모듈 없음(구형 빌드 — 경고는 최초 1회만). */
let cachedModule: ScreenOrientationModule | null | undefined;

function screenOrientation(): ScreenOrientationModule | null {
  if (cachedModule === undefined) {
    if (requireOptionalNativeModule("ExpoScreenOrientation") === null) {
      cachedModule = null;
      console.warn(
        "[orientation] expo-screen-orientation 네이티브 모듈 없음 — Dev Client 재빌드 전까지 회전 잠금이 비활성화된다",
      );
    } else {
      // 네이티브 모듈이 확인된 뒤라 이 require의 모듈 평가는 던지지 않는다(위 주석 2번 참고).
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- 위 "정적 import 금지" 참고
      cachedModule = require("expo-screen-orientation") as ScreenOrientationModule;
    }
  }
  return cachedModule ?? null;
}

/**
 * 잠금 호출 공통 래퍼 — 호출 층의 실패도 앱을 죽이지 않는다. 화면 방향은 앱이 죽어가면서까지
 * 지킬 가치가 없는 기능이다 — 어떤 실패든 "잠금 없음"(이전 동작)으로 물러난다.
 */
function lockSafely(pick: (module: ScreenOrientationModule) => Promise<void>, label: string): void {
  const module = screenOrientation();
  if (module === null) {
    return;
  }
  try {
    pick(module).catch((error: unknown) => {
      console.warn(`[orientation] ${label} 실패`, error);
    });
  } catch (error: unknown) {
    console.warn(`[orientation] ${label} 실패(동기)`, error);
  }
}

export function lockPortrait(): void {
  lockSafely((module) => module.lockAsync(module.OrientationLock.PORTRAIT_UP), "세로 잠금");
}

/**
 * 세션 진입 시 회전을 연다. `DEFAULT`는 iPhone에서 "거꾸로 세로 제외 전 방향" — `ALL`을 쓰지
 * 않는 이유는 rn-screens 시절 `"default"`를 골랐던 이유와 같다(거치대에 거꾸로는 불필요).
 */
export function unlockForSession(): void {
  lockSafely((module) => module.lockAsync(module.OrientationLock.DEFAULT), "세션 회전 해제");
}
