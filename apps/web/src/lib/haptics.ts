import type { HapticStyle } from "@focusmakers/types";

import { isNativeBridgeAvailable, postToNative } from "./bridge";

/** 브라우저 폴백 진동 길이 — 짧고 굵게(실기기 피드백). */
const VIBRATE_MS: Record<HapticStyle, number> = { light: 6, medium: 10, heavy: 14 };

/**
 * 짧은 햅틱 — 과목 시트의 임계 스냅·측정 선택에 쓴다(시안 "임계 스냅 + 햅틱").
 *
 * 앱 안에서는 네이티브에 맡긴다(`haptic` 브리지 → expo-haptics). 웹뷰에는 `navigator.vibrate`가
 * 없거나(iOS) 강한 진동뿐이라(Android) 웹이 직접 낼 수 없다. 브라우저 단독 모드에서만
 * `navigator.vibrate`로 폴백하고, 그마저 없으면 조용히 아무 일도 하지 않는다.
 */
export function haptic(style: HapticStyle) {
  if (isNativeBridgeAvailable()) {
    postToNative({ type: "haptic", style, atMs: Date.now() });
    return;
  }
  if ("vibrate" in navigator) {
    try {
      navigator.vibrate(VIBRATE_MS[style]);
    } catch {
      // 사용자 제스처 밖 호출 등은 브라우저가 거부한다 — 장식이라 무시한다.
    }
  }
}
