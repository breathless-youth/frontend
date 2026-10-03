import { Vibration } from "react-native";

import type { HapticStyle } from "@focusmakers/types";

/**
 * 웹 `haptic` 브리지의 네이티브 반응 — expo-haptics 임팩트.
 *
 * 모듈을 지연 로드하는 이유: expo-haptics는 네이티브 모듈이라 그것 없이 만든 Dev Client에서는
 * import 자체가 던진다. 그 경우 RN 기본 `Vibration`으로 폴백해 피드백이 아예 없는 것보다 낫게
 * 한다(iOS 기본 진동은 강하다 — 새 Dev Client 빌드가 나오면 임팩트로 바뀐다).
 */
export function triggerHaptic(style: HapticStyle): void {
  void import("expo-haptics")
    .then((haptics) => {
      // heavy는 Heavy가 아니라 Rigid — 임계 스냅에 "짧고 굵게"(실기기 피드백). Heavy는 더 세지만
      // 길게 울려 스냅 순간과 어긋난다.
      const impact = {
        light: haptics.ImpactFeedbackStyle.Light,
        medium: haptics.ImpactFeedbackStyle.Medium,
        heavy: haptics.ImpactFeedbackStyle.Rigid,
      }[style];
      return haptics.impactAsync(impact);
    })
    .catch(() => {
      Vibration.vibrate(10);
    });
}
