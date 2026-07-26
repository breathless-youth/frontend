import type { SessionState } from "./sessionState";

/**
 * 세션 화면 문구 — 전부 ai-wiki `product/voice-tone.md`에서 **그대로** 가져온다. 의역·재작성 금지.
 *
 * 추정형 어미("~것 같아요")를 단정형으로 바꾸지 않는다 — 감지 오탐 가능성을 문구가 흡수한다(§1).
 * 비집중 해제 시에는 문구를 띄우지 않고 색만 복귀한다(§3).
 */

export interface SessionStatusCopy {
  /** 상태 필 안 메인 문구. */
  readonly label: string;
  /** 상태 필 **바깥 아래** 서브 문구(Figma 구조 그대로). 집중 상태에는 없다. */
  readonly subLabel?: string;
}

/**
 * V1.0은 싱글룸만 있다 — 프라이버시 캡션은 항상 이 싱글룸 문구다(voice-tone.md §4 세션 "기본 캡션").
 * 멀티룸(V1.2+) 문구를 이 화면에 쓰지 않는다.
 */
export const PRIVACY_CAPTION = "영상은 기기 안에서만 처리돼요";

/**
 * 일시정지 하단 캡션(voice-tone.md §4 세션 "일시정지 캡션", Figma S3-3 `59:361` 실측 일치).
 * 일시정지 중에는 이 문구가 **프라이버시 캡션 자리를 대체**한다 — 두 줄을 동시에 띄우지 않는다.
 */
export const PAUSE_CAPTION = "일시정지 중에는 시간이 흐르지 않아요";

const FOCUS_COPY: SessionStatusCopy = { label: "집중 측정 중" };

/** voice-tone.md §3 상태 문구 — Figma에는 '휴대폰 사용' 인스턴스만 그려져 있으나 3종 모두 구현한다. */
const DISTRACTION_COPY = {
  AWAY: { label: "자리를 비운 것 같아요", subLabel: "돌아오면 자동으로 다시 측정돼요" },
  PHONE: { label: "휴대폰을 사용 중인 것 같아요", subLabel: "내려놓으면 자동으로 다시 측정돼요" },
  DEVICE: { label: "기기를 움직인 것 같아요", subLabel: "제자리에 두면 자동으로 다시 측정돼요" },
} as const satisfies Record<string, SessionStatusCopy>;

/**
 * voice-tone.md §3 상태 문구 — Figma S3-3 `59:358`/`59:364` 실측과 일치한다.
 *
 * 수동 일시정지와 화면 꺼짐·백그라운드는 **같은 문구**를 쓴다(2026-07-26 6차 확정).
 * `PauseTrigger`로 문구를 갈라 쓰지 않는다 — '화면 꺼짐' 라벨은 UI에 존재하지 않는다.
 */
const PAUSE_COPY: SessionStatusCopy = {
  label: "측정을 일시정지했어요",
  subLabel: "다시 시작하면 이어서 측정돼요",
};

export function statusCopyFor(state: SessionState): SessionStatusCopy {
  switch (state.kind) {
    case "FOCUS":
      return FOCUS_COPY;
    case "DISTRACTION":
      return DISTRACTION_COPY[state.trigger];
    case "PAUSE":
      return PAUSE_COPY;
  }
}

/**
 * 하단 캡션 1줄 — 일시정지에서만 프라이버시 캡션이 일시정지 캡션으로 **교체**된다
 * (Figma S3-3 실측: 두 문구가 같은 자리 y=726을 쓴다).
 */
export function captionFor(state: SessionState): string {
  return state.kind === "PAUSE" ? PAUSE_CAPTION : PRIVACY_CAPTION;
}

/** 카메라 전환 토스트 문구(voice-tone.md §4 토스트). */
export const CAMERA_TOAST_COPY = {
  flipped: "카메라를 전환했어요",
  noAlternative: "전환할 카메라가 없어요",
  cameraOff: "카메라가 꺼져 있어요",
} as const;
