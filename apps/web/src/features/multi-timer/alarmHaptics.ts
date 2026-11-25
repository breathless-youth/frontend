import type { HapticStyle } from "@focusmakers/types";

import { hasAlertHaptic } from "@/lib/alertHapticCapability";

/** 구버전 앱용 세 번 치는 햅틱 사이 간격 */
export const ALARM_HAPTIC_GAP_MS = 180;

/**
 * 끝 알림 햅틱 순서
 *
 * alert 를 받는 앱은 진동 패턴을 스스로 내서 한 번만 보낸다.
 * alert 를 모르는 구버전 앱은 그 메시지를 버려서 짧은 heavy 를 세 번 친다.
 * 추가 타이머와 휴식 화면이 같은 순서를 쓴다.
 */
export function alarmHaptics(): readonly HapticStyle[] {
  return hasAlertHaptic() ? ["alert"] : ["heavy", "heavy", "heavy"];
}
