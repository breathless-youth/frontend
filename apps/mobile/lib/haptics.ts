import { Platform, Vibration } from "react-native";

import type { HapticStyle } from "@focusmakers/types";
import type * as Haptics from "expo-haptics";

function loadHaptics(): Promise<typeof Haptics> {
  return (
    Promise.resolve()
      // jest가 동적 import()를 실행하지 못해 같은 지연 로드를 require로 한다.
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- 지연 로드를 jest에서도 돌리려면 require뿐이다.
      .then(() => require("expo-haptics") as typeof Haptics)
  );
}

/**
 * 웹 `haptic` 브리지의 네이티브 반응 — expo-haptics 임팩트.
 *
 * 모듈을 지연 로드하는 이유: expo-haptics는 네이티브 모듈이라 그것 없이 만든 Dev Client에서는
 * import 자체가 던진다. 그 경우 RN 기본 `Vibration`으로 폴백해 피드백이 아예 없는 것보다 낫게
 * 한다(iOS 기본 진동은 강하다 — 새 Dev Client 빌드가 나오면 임팩트로 바뀐다).
 */
export function triggerHaptic(style: HapticStyle): void {
  // 끝 알림은 햅틱으로는 짧아 놓치기 쉬워 시스템 진동을 세 번 낸다.
  // iOS는 한 번의 진동 길이가 고정이라 패턴 값이 진동 사이 간격이고, Android는 쉼과 진동 길이를 번갈아 적는다.
  // iOS는 햅틱 설정이 무음 모드 재생을 끄면 시스템 진동을 막아서, 같은 박자에 가장 강한 Error 알림 햅틱을 겹친다.
  // Android는 진동기가 하나라 햅틱을 겹치면 진동 패턴이 끊겨 진동만 낸다.
  if (style === "alert") {
    if (Platform.OS === "ios") {
      Vibration.vibrate([0, 600, 600]);
      for (const atMs of [0, 600, 1200]) {
        setTimeout(() => {
          void loadHaptics()
            .then((haptics) => haptics.notificationAsync(haptics.NotificationFeedbackType.Error))
            .catch(() => undefined);
        }, atMs);
      }
    } else {
      Vibration.vibrate([0, 400, 200, 400, 200, 400]);
    }
    return;
  }
  void loadHaptics()
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
