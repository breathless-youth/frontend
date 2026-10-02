import Constants from "expo-constants";
import { PermissionStatus, requestTrackingPermissionsAsync } from "expo-tracking-transparency";
import { AppState, Platform } from "react-native";
import type * as Fbsdk from "react-native-fbsdk-next";

import { type MetaAdsAdapter, setMetaAdsAdapter } from "./metaAds";

/**
 * `react-native-fbsdk-next`·`expo-tracking-transparency` 실구현 어댑터.
 *
 * 이 파일만 SDK를 불러온다 — 화면·컴포넌트·다른 `lib/` 모듈은 `lib/metaAds.ts`의 공개 함수만 본다
 * (`apps/mobile/CLAUDE.md` 경계 규칙, 그리고 SDK 루트 import가 jest에서 죽는 문제 — `metaAds.ts` 주석).
 * `app/_layout.tsx`가 모듈 스코프에서 `installMetaAdsSdk()`를 불러 Meta env가 있는 빌드에서만 붙인다.
 * SDK 패키지는 파일 맨 위가 아니라 `installMetaAdsSdk`의 앱 ID 확인 뒤에서 불러온다.
 */

/** `app.config.ts`가 `META_APP_ID` env에서 `extra.metaAppId`로 옮겨 적는다. 없는 빌드는 빈 문자열이다. */
export function metaAppIdFromConfig(): string | null {
  const appId = Constants.expoConfig?.extra?.metaAppId as string | undefined;
  return typeof appId === "string" && appId.length > 0 ? appId : null;
}

/** ATT 프롬프트가 뜨지 못했을 때 다시 묻는 횟수와 간격. */
const ATT_MAX_ATTEMPTS = 5;
const ATT_RETRY_DELAY_MS = 1_000;

/** 앱이 active가 될 때까지 기다린다. */
function whenAppActive(): Promise<void> {
  if (AppState.currentState === "active") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        subscription.remove();
        resolve();
      }
    });
  });
}

function createFbsdkMetaAdsAdapter({ AppEventsLogger, Settings }: typeof Fbsdk): MetaAdsAdapter {
  return {
    initialize() {
      Settings.initializeSDK();
    },
    async requestTrackingPermission() {
      if (Platform.OS !== "ios") {
        const { granted } = await requestTrackingPermissionsAsync();
        return granted;
      }
      // iOS는 앱이 active일 때만 프롬프트를 띄운다.
      // 그 전에 요청하면 창 없이 "미결정"이 돌아오는데, 릴리즈 빌드는 JS가 빨리 떠서 시작 직후가 그 구간에 걸린다.
      // 그래서 active를 기다렸다 묻고, 미결정이면 다시 묻는다.
      // 프롬프트가 떠 있는 동안은 앱이 inactive라, 답하기 전에 미결정이 먼저 돌아와도 다음 요청은 답한 뒤에 나가 저장된 값을 받는다.
      for (let attempt = 0; attempt < ATT_MAX_ATTEMPTS; attempt += 1) {
        if (attempt > 0) {
          await new Promise((resolve) => setTimeout(resolve, ATT_RETRY_DELAY_MS));
        }
        await whenAppActive();
        const { granted, status } = await requestTrackingPermissionsAsync();
        if (status !== PermissionStatus.UNDETERMINED) {
          return granted;
        }
      }
      return false;
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
      // 개발 빌드에서만 찍는다. 운영 대시보드에 이벤트가 안 보일 때 앱이 보낸 것인지, 전송이
      // 막힌 것인지를 가르는 유일한 단서다 — 브리지 로그(`RemoteWebViewHost`)와 같은 태도.
      if (__DEV__) {
        console.warn("[meta-ads] → SDK", name, params ?? "", valueToSum ?? "");
      }
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
}

/**
 * Meta env가 주입된 빌드에서만 어댑터를 붙인다. 개발 빌드처럼 `META_APP_ID`가 없으면 아무것도 하지 않아
 * ATT 프롬프트도 이벤트도 나가지 않는다.
 */
export function installMetaAdsSdk(): void {
  if (metaAppIdFromConfig() === null) {
    return;
  }
  // 루트를 불러오기만 해도 Android가 `FBAccessToken` 네이티브 모듈을 만들고, 앱 ID가 없으면 초기화되지 않은 SDK를 만나 앱이 죽는다.
  // 그래서 앱 ID를 확인한 뒤에만 불러온다. 파일 맨 위 import로 되돌리지 말 것(`metaAdsSdk.test.ts`가 고정한다).
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- 조건부로 동기 로드하는 방법이 require뿐이다.
  const sdk = require("react-native-fbsdk-next") as typeof Fbsdk;
  setMetaAdsAdapter(createFbsdkMetaAdsAdapter(sdk));
}
