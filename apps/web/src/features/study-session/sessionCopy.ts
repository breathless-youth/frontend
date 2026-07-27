import { toKoreanDurationLength, topicJosaFor } from "./formatDuration";
import type { PauseTrigger, SessionState } from "./sessionState";

/**
 * 세션 화면 문구 — 전부 .ai `product/voice-tone.md`에서 **그대로** 가져온다. 의역·재작성 금지.
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

/**
 * S3-7 종료 확인 다이얼로그 문구(voice-tone.md §4 "종료·자동 종료", Figma `Dialog / Confirm` 40:104).
 *
 * `공부 종료`는 파괴적 액션인데 Figma가 파란 primary로 그려서 **색만으로는 파괴성이 구분되지
 * 않는다** — 구분을 오로지 라벨이 지므로 `종료` 등으로 축약하지 않는다(Accessibility).
 */
export const EXIT_CONFIRM_COPY = {
  title: "공부를 종료할까요?",
  cancel: "계속하기",
  confirm: "공부 종료",
} as const;

/**
 * `지금까지 집중한 {순공시간}은 저장돼요` — 값은 **한글 시간 길이**이고 조사는 자동 처리한다
 * (voice-tone.md §2). 종료로 인한 손실 불안을 먼저 없애는 "이득/안심 우선" 구성이다(§1).
 *
 * ⚠️ **Figma ↔ .ai 조사 불일치(에스컬레이션 대기).** Figma 노드 `40:98`은 `1시간 24분**이**
 * 저장돼요`, `voice-tone.md` §2·§4는 `1시간 24분**은** 저장돼요`로 서로 다르다. 조사 규칙이
 * 명문화된 최신 문서(2026-07-26 6차 인터뷰 재작성)를 따라 **잠정적으로 `은`**을 쓴다 —
 * SCR-S3-7·S3-8 Review Checklist에 판정 항목으로 올라가 있다.
 */
export function exitConfirmDescription(focusSec: number): string {
  const length = toKoreanDurationLength(focusSec);
  return `지금까지 집중한 ${length}${topicJosaFor(length)} 저장돼요`;
}

/**
 * S3-8 자동 종료 안내 문구(voice-tone.md §4 "자동 종료 안내").
 *
 * 본문 2줄 분리는 Figma `63:591` 실측 줄바꿈이다 — 폰트 확대 시에는 자연 줄바꿈에 맡긴다.
 */
export const AUTO_END_COPY = {
  title: "여기까지 기록을 저장했어요",
  summaryLabels: { focusSec: "순공시간", studySec: "총 공부" },
  cta: "결과 보기",
} as const;

/**
 * 자동 종료 본문 — **트리거는 문구 선택에만 쓴다**(임계값 판정에는 절대 쓰지 않는다,
 * SCR-S3-7·S3-8 Interaction Contract).
 *
 * - `BACKGROUND`(화면 꺼짐·백그라운드): voice-tone.md §4 확정 문구.
 * - `MANUAL`(수동 일시정지 방치): **`null` — 문구 미정.**
 *   TODO(voice-tone 미정): 수동 일시정지 방치 자동 종료 본문 문구 확정 필요.
 *   voice-tone.md §4에 `⚠️ 미정 — 위 문구는 화면 꺼짐 전제`로 명시돼 있다. 화면을 끄지 않은
 *   사용자에게 "화면이 꺼진 동안"이라고 안내하면 사실과 다르므로 **화면 꺼짐 문구를 재사용하지
 *   않고** 본문을 비운다(타이틀·요약·CTA만 렌더). 문구가 확정되면 이 표만 채운다.
 */
const AUTO_END_BODY: Record<PauseTrigger, readonly string[] | null> = {
  BACKGROUND: ["화면이 꺼진 동안은 측정이 어려워서", "공부가 자동으로 종료됐어요"],
  MANUAL: null,
};

export function autoEndBodyLinesFor(trigger: PauseTrigger): readonly string[] | null {
  return AUTO_END_BODY[trigger];
}

/** 카메라 전환 토스트 문구(voice-tone.md §4 토스트). */
export const CAMERA_TOAST_COPY = {
  flipped: "카메라를 전환했어요",
  noAlternative: "전환할 카메라가 없어요",
  cameraOff: "카메라가 꺼져 있어요",
} as const;
