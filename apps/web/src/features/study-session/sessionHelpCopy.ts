/**
 * 세션 도움말 퍼널 여섯 단계
 *
 * 설계 문서 "세션 도움말 퍼널" 절의 표를 그대로 옮겼다. 단계마다 배경과 설명 문구가 바뀐다.
 * `callouts`에 설명이 있는 요소만 그 단계에서 가짜 요소와 테두리로 그린다. 문구 안 `\n`은 고정 줄바꿈이다.
 * 심플 모드 단계(`center`)는 가짜 요소 없이 그림 위에 가운데 문구와 손 아이콘만 둔다.
 */
export type SessionHelpElement = "pill" | "timer" | "pause" | "side" | "more" | "center";

export interface SessionHelpCallout {
  text: string;
  /** primary 그라데이션 글자로 칠할 핵심 단어 */
  highlight: readonly string[];
}

export interface SessionHelpStep {
  id: "away" | "measuring" | "pause" | "side" | "simple" | "more";
  /** away: 빈 책상 사진, study: 공부하는 사람 사진, simple: 심플 모드 화면 그림 */
  background: "away" | "study" | "simple";
  /** 가짜 상태 필 상태. 필이 있는 단계만 쓴다. */
  pill?: "distract" | "focus";
  /** 가짜 타이머에서 1초씩 올라가는 숫자. total은 총 공부만, both는 순공과 총 공부 둘 다 */
  ticking?: "total" | "both";
  callouts: Partial<Record<SessionHelpElement, SessionHelpCallout>>;
}

export const SESSION_HELP_STEPS: readonly SessionHelpStep[] = [
  {
    id: "away",
    background: "away",
    pill: "distract",
    ticking: "total",
    callouts: {
      pill: {
        text: "자리 이탈이나 졸음 등이 감지되면\n안내문구가 표시돼요",
        highlight: ["자리 이탈", "졸음"],
      },
      timer: { text: "순공시간으로 인정되지 않아요🙅", highlight: ["순공시간"] },
    },
  },
  {
    id: "measuring",
    background: "study",
    pill: "focus",
    ticking: "both",
    callouts: {
      pill: {
        text: "사람이 감지되면 안내문구가 표시돼요\n측정 화면은 기기 밖으로 나가지 않으니\n안심하세요😌",
        highlight: ["사람", "기기 밖"],
      },
      timer: {
        text: "순공시간이 다시 흘러가요⏰",
        highlight: ["순공시간"],
      },
    },
  },
  {
    id: "pause",
    background: "study",
    callouts: {
      pause: { text: "잠시 휴식하고 싶으면 일시정지 하세요", highlight: ["일시정지"] },
    },
  },
  {
    id: "side",
    background: "study",
    callouts: {
      side: {
        text: "배경음, 과목, 타이머\n등의 부가 기능을 사용해보세요",
        highlight: ["배경음", "과목", "타이머"],
      },
    },
  },
  {
    id: "simple",
    background: "simple",
    callouts: {
      center: { text: "화면을 탭하여 심플 모드로 바꿀 수 있어요", highlight: ["심플 모드"] },
    },
  },
  {
    id: "more",
    background: "simple",
    callouts: {
      more: {
        text: "이 도움말은 더보기 메뉴를 통해\n언제든 다시 볼 수 있어요",
        highlight: ["더보기 메뉴"],
      },
    },
  },
];

/** 단계 이동 버튼 이름. 마지막 단계만 시작 문구다. */
export const SESSION_HELP_NAV = { prev: "이전", next: "다음", finish: "순공 시작하기" } as const;
