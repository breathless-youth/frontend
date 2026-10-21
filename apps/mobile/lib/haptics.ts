import { Platform, Vibration } from "react-native";

import type { HapticStyle } from "@focusmakers/types";
import type * as Haptics from "expo-haptics";

/**
 * 웹 `haptic` 브리지의 네이티브 반응 — expo-haptics 임팩트.
 *
 * 모듈을 지연 로드하는 이유: expo-haptics는 네이티브 모듈이라 그것 없이 만든 Dev Client에서는
 * import 자체가 던진다. 그 경우 RN 기본 `Vibration`으로 폴백해 피드백이 아예 없는 것보다 낫게
 * 한다(iOS 기본 진동은 강하다 — 새 Dev Client 빌드가 나오면 임팩트로 바뀐다).
 */
export function triggerHaptic(style: HapticStyle): void {
  void Promise.resolve()
    // jest가 동적 import()를 실행하지 못해 같은 지연 로드를 require로 한다.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- 지연 로드를 jest에서도 돌리려면 require뿐이다.
    .then(() => require("expo-haptics") as typeof Haptics)
    .then((haptics) => {
      // iOS의 heavy는 Rigid로 낸다.
      // 임계 스냅에는 짧고 굵은 진동이 맞고, Heavy는 길게 울려 스냅 순간과 어긋난다.
      // Android의 heavy는 Heavy로 낸다.
      // expo-haptics의 Android Rigid는 Medium과 길이·세기가 같아 구분되지 않는다.
      const impact = {
        light: haptics.ImpactFeedbackStyle.Light,
        medium: haptics.ImpactFeedbackStyle.Medium,
        heavy:
          Platform.OS === "android"
            ? haptics.ImpactFeedbackStyle.Heavy
            : haptics.ImpactFeedbackStyle.Rigid,
      }[style];
      return haptics.impactAsync(impact);
    })
    .catch(() => {
      Vibration.vibrate(10);
    });
}
