import type { ModeKind } from "@/features/multi-timer/multiTimerMachine";
import type { MultiTimerSettings } from "@/features/multi-timer/multiTimerSettings";
import { toKoreanDuration } from "@/features/study-session/formatDuration";
import i18n from "@/lib/i18n";

/**
 * 공부방 타이머 시트의 시작 버튼 글자
 *
 * 휠에서 고른 시, 분, 초를 그대로 읽어 무엇을 시작하는지 버튼만 보고 알게 한다.
 * 뽀모도로는 첫 단계가 집중이라 집중 시간만 쓴다.
 */
export function timerStartLabel(kind: ModeKind, settings: MultiTimerSettings): string {
  return kind === "timer"
    ? i18n.t("live-room:roomTimerCopy.startTimer", {
        duration: toKoreanDuration(settings.timerSec),
      })
    : i18n.t("live-room:roomTimerCopy.startPomodoro", {
        duration: toKoreanDuration(settings.focusMin * 60),
      });
}

/**
 * 뽀모도로 설정 아래의 설명 한 줄
 *
 * 휴식 시간은 분 단위로만 고르므로 받침이 있는 `분`이나 `시간`으로 끝나 조사는 늘 `을`이다.
 */
export function pomodoroIntro(settings: MultiTimerSettings): string {
  return i18n.t("live-room:roomTimerCopy.pomodoroIntro", {
    focus: toKoreanDuration(settings.focusMin * 60),
    rest: toKoreanDuration(settings.breakMin * 60),
  });
}
