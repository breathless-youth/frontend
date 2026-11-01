import type { SessionHelpStepId } from "@/lib/amplitude";

/**
 * 세션 도움말 다섯 단계
 *
 * 1~3단계는 심플 모드 화면을 실제 요소로 그리고, 4~5단계는 공부하는 사람 사진 위에 버튼을 다시 그린다.
 * `callouts`에 문구가 있는 요소만 그 단계에서 테두리·화살표와 함께 설명한다.
 * 문구 안 `\n`은 고정 줄바꿈이다.
 * 탭 설명은 가로에서만 두 줄이라 세로에서는 화면이 줄바꿈을 공백으로 접는다.
 */
export type SessionHelpElement = "pill" | "timer" | "tap" | "side" | "pause" | "more";

export interface SessionHelpCallout {
  text: string;
  /** primary 그라데이션 글자로 칠할 핵심 단어 */
  highlight: readonly string[];
}

export interface SessionHelpStep {
  id: SessionHelpStepId;
  /** simple: 심플 모드 화면, photo: 공부하는 사람 사진 */
  background: "simple" | "photo";
  /** 심플 모드 화면의 상태 색과 가짜 필. 심플 모드 단계만 쓴다. */
  state?: "distract" | "focus";
  /** 가짜 순공 숫자가 1초씩 올라가는가. 심플 모드 단계만 쓴다. */
  ticking?: boolean;
  callouts: Partial<Record<SessionHelpElement, SessionHelpCallout>>;
  /** 화면 정중앙 제목. 마지막 단계만 쓴다. */
  center?: SessionHelpCallout;
  /** 정중앙 제목 아래 끝내기 버튼 글자 */
  cta?: string;
}

export const SESSION_HELP_STEPS: readonly SessionHelpStep[] = [
  {
    id: "away",
    background: "simple",
    state: "distract",
    ticking: false,
    callouts: {
      pill: {
        text: "자리를 비우거나 졸면\n여기에 알려줘요",
        highlight: ["자리를 비우거나", "졸면"],
      },
      timer: { text: "그동안 순공시간은 멈춰요", highlight: ["순공시간"] },
    },
  },
  {
    id: "measuring",
    background: "simple",
    state: "focus",
    ticking: true,
    callouts: {
      pill: {
        text: "자리로 돌아오면 다시 측정해요\n측정 화면은 기기 밖으로 나가지 않으니\n안심하세요😌",
        highlight: ["다시 측정", "기기 밖"],
      },
      timer: { text: "순공시간이\n다시 흘러가요⏰", highlight: ["순공시간"] },
    },
  },
  {
    id: "camera",
    background: "simple",
    state: "focus",
    ticking: true,
    callouts: {
      tap: { text: "화면을 탭하면\n카메라 화면으로 바뀌어요", highlight: ["카메라 화면"] },
    },
  },
  {
    id: "buttons",
    background: "photo",
    callouts: {
      side: {
        text: "배경음, 과목, 타이머는\n여기서 켜요",
        highlight: ["배경음", "과목", "타이머"],
      },
      pause: { text: "쉴 때는\n일시정지를 눌러요", highlight: ["일시정지"] },
    },
  },
  {
    id: "finish",
    background: "photo",
    callouts: {
      more: { text: "이 도움말은 더보기 메뉴에서\n언제든 다시 볼 수 있어요", highlight: [] },
    },
    center: { text: "준비됐어요\n이제 집중해 볼까요?", highlight: ["집중"] },
    cta: "순공 시작하기",
  },
];

/** 이동 막대 버튼 이름. 화살표 기호는 낭독기에서 뺀다. */
export const SESSION_HELP_NAV = { prev: "이전", next: "다음" } as const;
