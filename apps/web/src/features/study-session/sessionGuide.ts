import type { SessionHelpStepId } from "@/lib/amplitude";

/**
 * 세션 도움말의 기기 기록
 *
 * 처음 보는 계정이 집중 시작을 누르면 세션과 카메라 권한 요청보다 먼저 가이드 화면(`SessionGuidePage`)이 뜬다.
 * 마지막 단계의 `순공 시작하기`나 `나중에 시작할게요`까지 끝낸 계정은 다시 뜨지 않는다.
 * 앱을 끄거나 뒤로 가거나 Escape로 닫아 끝까지 보지 못한 계정은 다음 집중 시작에 다시 뜬다.
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

/**
 * 세션 도움말 다섯 단계
 *
 * 1~3단계는 심플 모드 화면을 실제 요소로 그리고, 4~5단계는 공부하는 사람 사진 위에 버튼을 다시 그린다.
 * `callouts`에 문구 키가 있는 요소만 그 단계에서 테두리·화살표와 함께 설명한다.
 * 문구 안 `\n`은 고정 줄바꿈이고 `<hl>`로 감싼 핵심 단어는 primary 그라데이션 글자로 칠한다.
 * 탭 설명은 가로에서만 두 줄이라 세로에서는 화면이 줄바꿈을 공백으로 접는다.
 */
export type SessionHelpElement = "pill" | "timer" | "tap" | "side" | "pause" | "more";

/** 도움말 문구 키(`study-session:help.*`) */
export type SessionHelpTextKey =
  | "help.awayPill"
  | "help.awayTimer"
  | "help.measuringPill"
  | "help.measuringTimer"
  | "help.cameraTap"
  | "help.buttonsSide"
  | "help.buttonsPause"
  | "help.finishMore"
  | "help.finishCenter";

export interface SessionHelpStep {
  id: SessionHelpStepId;
  /** simple: 심플 모드 화면, photo: 공부하는 사람 사진 */
  background: "simple" | "photo";
  /** 심플 모드 화면의 상태 색과 가짜 필. 심플 모드 단계만 쓴다. */
  state?: "distract" | "focus";
  /** 가짜 순공 숫자가 1초씩 올라가는가. 심플 모드 단계만 쓴다. */
  ticking?: boolean;
  callouts: Partial<Record<SessionHelpElement, SessionHelpTextKey>>;
  /** 화면 정중앙 제목. 마지막 단계만 쓴다. */
  center?: SessionHelpTextKey;
  /** 정중앙 제목 아래 끝내기 버튼이 있는가. 글자는 `help.finishCta`다. */
  cta?: boolean;
}

export const SESSION_HELP_STEPS: readonly SessionHelpStep[] = [
  {
    id: "away",
    background: "simple",
    state: "distract",
    ticking: false,
    callouts: { pill: "help.awayPill", timer: "help.awayTimer" },
  },
  {
    id: "measuring",
    background: "simple",
    state: "focus",
    ticking: true,
    callouts: { pill: "help.measuringPill", timer: "help.measuringTimer" },
  },
  {
    id: "camera",
    background: "simple",
    state: "focus",
    ticking: true,
    callouts: { tap: "help.cameraTap" },
  },
  {
    id: "buttons",
    background: "photo",
    callouts: { side: "help.buttonsSide", pause: "help.buttonsPause" },
  },
  {
    id: "finish",
    background: "photo",
    callouts: { more: "help.finishMore" },
    center: "help.finishCenter",
    cta: true,
  },
];
