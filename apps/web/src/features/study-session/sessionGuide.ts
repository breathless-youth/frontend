import type { SessionHelpStepId } from "@/lib/amplitude";

/**
 * 세션 도움말의 기기 기록
 *
 * 처음 보는 계정이 새 세션을 열면 카운트다운 앞에 도움말이 뜨고, 닫을 때까지 카운트다운을 세지 않는다(`RoomPage`).
 * 마지막 장에서 `공부 시작하기`를 누른 계정은 다시 뜨지 않는다.
 * 앱을 끄거나 Escape로 닫은 계정은 다음 새 세션에 다시 뜬다.
 * 기록은 기기 저장소에 계정별로 남기므로 기기를 바꾸면 다시 뜨고, 저장소를 쓸 수 없는 기기에서는 앱을 다시 켜면 다시 뜬다.
 */
export type SessionGuideState = "seen" | null;

const keyOf = (userId: number) => `focusmakers:session-guide:${userId}`;

/** 저장소에 남기지 못한 계정. 집중 시작을 누를 때마다 가이드가 또 뜨지 않게 이 문서가 살아 있는 동안 기억한다. */
const seenWithoutStorage = new Set<number>();

export function sessionGuideState(userId: number): SessionGuideState {
  try {
    if (localStorage.getItem(keyOf(userId)) === "seen") {
      return "seen";
    }
  } catch {
    // 읽지 못하면 아래 기억으로 판정한다.
  }
  return seenWithoutStorage.has(userId) ? "seen" : null;
}

export function markSessionGuideSeen(userId: number): void {
  try {
    localStorage.setItem(keyOf(userId), "seen");
  } catch {
    seenWithoutStorage.add(userId);
  }
}

/** 도움말 마스코트 표정. 칸은 `HelpMascot`이 정한다. */
export type SessionHelpMascotPose = "joy" | "sleepy" | "focus" | "jump";

/**
 * 세션 도움말 여섯 장
 *
 * 실제 세션과 같은 배치로 그린 가짜 세션 화면 위에서 보인다(`SessionHelpScreen`).
 * - `welcome`: 인사. 강조하는 자리 없이 말풍선만 띄운다.
 * - `grace`: 공부 자세가 흐트러져 상태 문구가 깜빡이는 화면. 순공은 계속 흐른다.
 * - `distract`: 계속 공부가 감지되지 않아 순공이 멈춘 화면.
 * - `simple`: 화면을 탭하면 심플 모드로 바뀌는 것을 보여 준다.
 * - `ready`: 카메라 창을 키워 얼굴·손·공부도구 구도를 짚는다.
 * - `start`: 타임랩스를 고르고 공부를 시작한다.
 * 마스코트 표정은 dev 도움말처럼 장마다 다르다.
 */
export const SESSION_HELP_STEPS: readonly {
  readonly id: SessionHelpStepId;
  readonly mascot: SessionHelpMascotPose;
}[] = [
  { id: "welcome", mascot: "joy" },
  { id: "grace", mascot: "focus" },
  { id: "distract", mascot: "sleepy" },
  { id: "simple", mascot: "joy" },
  { id: "ready", mascot: "focus" },
  { id: "start", mascot: "jump" },
];
