import type { SessionHelpStepId } from "@/lib/amplitude";

/**
 * 세션 도움말의 기기 기록
 *
 * 처음 보는 계정이 집중 시작을 누르면 세션과 카메라 권한 요청보다 먼저 가이드 화면(`SessionGuidePage`)이 뜬다.
 * 마지막 단계의 `순공 시작하기`나 `나중에 하기`까지 끝낸 계정은 다시 뜨지 않는다.
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

/** 강조할 자리. 덮개에 구멍을 뚫어 원래 밝기로 보인다. */
export type SessionHelpSpot = "status" | "clock" | "more" | "pip";

export type SessionHelpMascotPose = "joy" | "sleepy" | "focus" | "jump";

/** 도움말 문구 키(`study-session:help.*`) */
export type SessionHelpTextKey =
  | "help.welcomeTitle"
  | "help.welcomeBody"
  | "help.awayTitle"
  | "help.awayBody"
  | "help.measuringTitle"
  | "help.measuringBody"
  | "help.simpleTitle"
  | "help.finishTitle";

/**
 * 세션 도움말 다섯 단계
 *
 * 일반 모드 세션 화면을 그대로 그리고 그 위에 덮개와 말풍선을 올린다.
 * 제목 안 `<hl>`로 감싼 핵심 단어는 파란 글자로 칠하고 본문은 강조색 없이 둔다.
 */
export interface SessionHelpStep {
  readonly id: SessionHelpStepId;
  readonly screen: "normal" | "simple";
  readonly state: "focus" | "distract";
  /** 가짜 순공 숫자가 1초씩 올라가는가 */
  readonly ticking: boolean;
  readonly spots: readonly SessionHelpSpot[];
  readonly title: SessionHelpTextKey;
  readonly body?: SessionHelpTextKey;
  readonly mascot: SessionHelpMascotPose;
}

export const SESSION_HELP_STEPS: readonly SessionHelpStep[] = [
  {
    id: "welcome",
    screen: "normal",
    state: "focus",
    ticking: true,
    spots: [],
    title: "help.welcomeTitle",
    body: "help.welcomeBody",
    mascot: "joy",
  },
  {
    id: "away",
    screen: "normal",
    state: "distract",
    ticking: false,
    spots: ["status"],
    title: "help.awayTitle",
    body: "help.awayBody",
    mascot: "sleepy",
  },
  {
    id: "measuring",
    screen: "normal",
    state: "focus",
    ticking: true,
    spots: ["clock"],
    title: "help.measuringTitle",
    body: "help.measuringBody",
    mascot: "focus",
  },
  {
    id: "simple",
    screen: "simple",
    state: "focus",
    ticking: true,
    spots: [],
    title: "help.simpleTitle",
    mascot: "joy",
  },
  {
    id: "finish",
    screen: "normal",
    state: "focus",
    ticking: true,
    spots: ["more", "pip"],
    title: "help.finishTitle",
    mascot: "jump",
  },
];
