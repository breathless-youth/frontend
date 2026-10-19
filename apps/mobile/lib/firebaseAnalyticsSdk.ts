import {
  getAnalytics,
  logEvent,
  setUserId,
  setUserProperties,
  setUserProperty,
} from "@react-native-firebase/analytics";

import { ensureAuth, subscribeAuth } from "./auth";
import {
  type FirebaseAnalyticsAdapter,
  setAnalyticsUserId,
  setFirebaseAnalyticsAdapter,
} from "./firebaseAnalytics";

/**
 * `@react-native-firebase/analytics` 실구현 어댑터.
 *
 * 이 파일만 SDK를 import한다 — 다른 코드는 `lib/firebaseAnalytics.ts`의 공개 함수만 본다(`lib/metaAdsSdk.ts`와
 * 같은 경계). `app/_layout.tsx`가 모듈 스코프에서 `installFirebaseAnalyticsSdk()`를 부른다.
 */
export const rnfbFirebaseAnalyticsAdapter: FirebaseAnalyticsAdapter = {
  logEvent(name, params) {
    // 개발 빌드에서만 찍는다 — DebugView에 이벤트가 안 보일 때 앱이 보낸 것인지 가르는 단서(`metaAdsSdk.ts`와 같은 태도).
    if (__DEV__) {
      console.warn("[firebase-analytics] → SDK", name, params ?? "");
    }
    return logEvent(getAnalytics(), name, params);
  },
  setUserId(id) {
    return setUserId(getAnalytics(), id);
  },
  async setUserProperties(properties) {
    // null(지움)은 키마다 `setUserProperty`로 따로 보낸다. RNFB는 iOS TurboModule이 객체 안의 null을 떨어뜨리는 것을
    // 피하려고 `{__rnfbNull: true}` 표식으로 바꿔 보내는데, `setUserProperties`의 NSDictionary 인자는 그 표식을
    // 되돌리는 경로를 타지 않아 Firebase가 "User property must be NSString"으로 거부한다(26.3.3 실측). 인자 하나짜리
    // `setUserProperty`의 최상위 null은 표식 없이 nil로 넘어가 삭제가 된다. Android는 둘 다 동작한다.
    const analytics = getAnalytics();
    const kept: Record<string, string> = {};
    const cleared: string[] = [];
    for (const [key, value] of Object.entries(properties)) {
      if (value === null) cleared.push(key);
      else kept[key] = value;
    }
    await Promise.all([
      ...(Object.keys(kept).length > 0 ? [setUserProperties(analytics, kept)] : []),
      ...cleared.map((key) => setUserProperty(analytics, key, null)),
    ]);
  },
};

/**
 * 어댑터를 붙이고 GA user_id를 백엔드 userId로 맞춘다 — 저장된 신원을 한 번 읽고, 이후 재등록·이관으로
 * 바뀌면 구독으로 따라간다. 웹 Amplitude가 같은 번호를 user_id로 쓰므로 두 도구의 사용자가 조인된다.
 */
export function installFirebaseAnalyticsSdk(): void {
  setFirebaseAnalyticsAdapter(rnfbFirebaseAnalyticsAdapter);
  subscribeAuth((state) => setAnalyticsUserId(String(state.userId)));
  void ensureAuth().then((state) => {
    if (state !== null) setAnalyticsUserId(String(state.userId));
  });
}
