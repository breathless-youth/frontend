import Constants from "expo-constants";
import { requestTrackingPermissionsAsync } from "expo-tracking-transparency";
import { Platform } from "react-native";
import { AppEventsLogger, Settings } from "react-native-fbsdk-next";

import { type MetaAdsAdapter, setMetaAdsAdapter } from "./metaAds";

/**
 * `react-native-fbsdk-next`·`expo-tracking-transparency` 실구현 어댑터.
 *
 * 이 파일만 SDK를 import한다 — 화면·컴포넌트·다른 `lib/` 모듈은 `lib/metaAds.ts`의 공개 함수만 본다
 * (`apps/mobile/CLAUDE.md` 경계 규칙, 그리고 SDK 루트 import가 jest에서 죽는 문제 — `metaAds.ts` 주석).
 * `app/_layout.tsx`가 모듈 스코프에서 `installMetaAdsSdk()`를 불러 Meta env가 있는 빌드에서만 붙인다.
 */

/** `app.config.ts`가 `META_APP_ID` env에서 `extra.metaAppId`로 옮겨 적는다. 없는 빌드는 빈 문자열이다. */
export function metaAppIdFromConfig(): string | null {
  const appId = Constants.expoConfig?.extra?.metaAppId as string | undefined;
  return typeof appId === "string" && appId.length > 0 ? appId : null;
}

export const fbsdkMetaAdsAdapter: MetaAdsAdapter = {
  initialize() {
    Settings.initializeSDK();
  },
  async requestTrackingPermission() {
    const { granted } = await requestTrackingPermissionsAsync();
    return granted;
  },
  async setAdvertiserTrackingEnabled(enabled) {
    // fbsdk-next가 Android에서는 스스로 no-op이지만, 식별자 수집 플래그까지 iOS 전용으로 묶어 둔다 —
    // Android의 광고 ID 수집은 config plugin(`advertiserIDCollectionEnabled`)이 정한다.
    if (Platform.OS !== "ios") {
      return;
    }
    await Settings.setAdvertiserTrackingEnabled(enabled);
    // 거부한 사용자의 IDFA는 어차피 0이지만, 수집 자체를 끄는 것이 ATT 취지에 맞다.
    Settings.setAdvertiserIDCollectionEnabled(enabled);
  },
  logEvent(name, params, valueToSum) {
    // fbsdk-next의 오버로드는 인자 개수로 갈린다 — `undefined`를 그대로 넘기면 파라미터 자리로 읽힌다.
    if (valueToSum !== undefined && params !== undefined) {
      AppEventsLogger.logEvent(name, valueToSum, params);
    } else if (valueToSum !== undefined) {
      AppEventsLogger.logEvent(name, valueToSum);
    } else if (params !== undefined) {
      AppEventsLogger.logEvent(name, params);
    } else {
      AppEventsLogger.logEvent(name);
    }
  },
};

/**
 * Meta env가 주입된 빌드에서만 어댑터를 붙인다. 개발 빌드처럼 `META_APP_ID`가 없으면 아무것도 하지 않아
 * ATT 프롬프트도 이벤트도 나가지 않는다.
 */
export function installMetaAdsSdk(): void {
  if (metaAppIdFromConfig() === null) {
    return;
  }
  setMetaAdsAdapter(fbsdkMetaAdsAdapter);
}
