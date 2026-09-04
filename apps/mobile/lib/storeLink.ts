import { Linking, Platform } from "react-native";

/**
 * 스토어 링크 (BY-586 강제 업데이트용).
 *
 * 웹 `apps/web/src/features/social-room/storeLink.ts`와 같은 ID를 쓴다 — 두 앱은 독립 배포라 공유
 * 패키지로 묶지 않고 상수를 각자 둔다(BY-542와 같은 판단). 바뀌면 양쪽을 함께 고친다.
 */
export const ANDROID_PACKAGE = "com.breathlessyouth.mobile";
export const IOS_APP_ID = "6797220287";

export type StorePlatform = "android" | "ios";

/** 스토어 앱을 직접 여는 스킴. 웹뷰 우회 없이 네이티브 `Linking`으로 열므로 가장 확실한 경로다. */
export function storeSchemeUrl(platform: StorePlatform): string {
  if (platform === "android") return `market://details?id=${ANDROID_PACKAGE}`;
  return `itms-apps://apps.apple.com/app/id${IOS_APP_ID}`;
}

/** 스킴이 막힌 환경(스토어 앱 없음 등)을 위한 https 폴백. */
export function storeWebUrl(platform: StorePlatform): string {
  if (platform === "android")
    return `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
  return `https://apps.apple.com/app/id${IOS_APP_ID}`;
}

export function currentStorePlatform(): StorePlatform {
  return Platform.OS === "android" ? "android" : "ios";
}

/**
 * 스토어를 연다. 스킴이 실패하면 https로 한 번 더 시도하고, 그래도 실패하면 로그만 남긴다 —
 * 강제 업데이트 화면은 그대로 남아 사용자가 다시 누를 수 있다.
 */
export async function openAppStore(
  platform: StorePlatform = currentStorePlatform(),
): Promise<void> {
  try {
    await Linking.openURL(storeSchemeUrl(platform));
  } catch {
    try {
      await Linking.openURL(storeWebUrl(platform));
    } catch (error) {
      console.warn("[store-link] 스토어 열기 실패", error);
    }
  }
}
