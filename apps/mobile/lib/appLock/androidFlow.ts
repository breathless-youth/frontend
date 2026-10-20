import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";

export type ConsentAction = { label: string; open: "usage" | "overlay" };
export type BatteryGuideKind = "samsung" | "xiaomi";

const BATTERY_GUIDE_SHOWN_KEY = "appLock.batteryGuideShown";

/**
 * 고지 화면의 다음 할 일
 *
 * 화면에 적힌 순서와 같게 사용정보 접근부터 받는다.
 * 둘 다 없을 때만 동의 문구를 쓰고, 하나가 남으면 남은 권한 이름으로 버튼을 바꾼다.
 */
export function consentAction(usage: boolean, overlay: boolean): ConsentAction | null {
  if (!usage && !overlay) return { label: "동의하고 설정 열기", open: "usage" };
  if (!overlay) return { label: "다른 앱 위에 표시 허용하기", open: "overlay" };
  if (!usage) return { label: "사용정보 접근 허용하기", open: "usage" };
  return null;
}

/**
 * 배터리 예외 안내를 띄울 제조사
 *
 * Redmi·POCO는 제조사가 Xiaomi로 오지만 브랜드만 바뀐 기기도 있어 둘 다 본다.
 */
export function batteryGuideKind(manufacturer: string, brand: string): BatteryGuideKind | null {
  const names = `${manufacturer} ${brand}`.toLowerCase();
  if (names.includes("samsung")) return "samsung";
  if (/xiaomi|redmi|poco/.test(names)) return "xiaomi";
  return null;
}

let consentClosed: Promise<void> | null = null;
let closeConsent: (() => void) | null = null;

/**
 * 권한 고지 화면을 열고 닫힐 때까지 기다리기
 *
 * 설정 탭을 여러 번 눌러도 화면이 겹쳐 쌓이지 않게 열려 있는 동안 온 요청은 같은 닫힘을 기다린다.
 * 화면을 열지 못하면 닫힘 알림도 오지 않아 바로 끝낸다.
 */
export function requestConsent(): Promise<void> {
  if (consentClosed !== null) return consentClosed;
  consentClosed = new Promise<void>((resolve) => {
    closeConsent = resolve;
  });
  const waiting = consentClosed;
  try {
    router.push("/app-lock-consent");
  } catch (error) {
    console.warn("[appLock] 권한 안내 화면 열기 실패", error);
    notifyConsentClosed();
  }
  return waiting;
}

/** 고지 화면이 어떤 경로로든 닫혔다는 알림 */
export function notifyConsentClosed(): void {
  const close = closeConsent;
  consentClosed = null;
  closeConsent = null;
  close?.();
}

let batteryCheck: Promise<void> | null = null;

/**
 * 배터리 예외 안내를 처음 한 번만 띄우기
 *
 * 안내를 띄웠다는 기록은 화면을 열기 전에 남겨, 열고 바로 앱이 죽어도 다시 묻지 않는다.
 * 겹쳐 온 요청이 둘 다 기록 전에 읽어 두 번 띄우지 않게 진행 중인 확인을 함께 쓴다.
 */
export function offerBatteryGuide(manufacturer: string, brand: string): Promise<void> {
  if (batteryGuideKind(manufacturer, brand) === null) return Promise.resolve();
  batteryCheck ??= (async () => {
    try {
      if ((await SecureStore.getItemAsync(BATTERY_GUIDE_SHOWN_KEY)) === "1") return;
      await SecureStore.setItemAsync(BATTERY_GUIDE_SHOWN_KEY, "1");
      router.push("/app-lock-battery");
    } catch (error) {
      console.warn("[appLock] 배터리 안내 열기 실패", error);
    } finally {
      batteryCheck = null;
    }
  })();
  return batteryCheck;
}
