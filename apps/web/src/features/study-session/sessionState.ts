import type { StudyEventStatus } from "@focuson/types";

/**
 * 세션 내부 상태 모델 — DOM/SDK 의존 없는 순수 TS.
 *
 * 제출 라이프사이클(`StudyRoomPhase`: studying/submitting/done/…)과는 **다른 축**이다.
 * 두 축을 하나로 합치지 않는다(SCR-S3-1·S3-2 "useStudyRoomSession의 실제 갭" 4번).
 *
 * 근거: .ai `product/mvp-scope.md` 세션 상태 모델 / `project/glossary.md`.
 */

/** 자동 감지되는 비집중 트리거. `StudyEventStatus`의 부분집합이라 그대로 서버 status로 쓴다. */
export type DistractionTrigger = "AWAY" | "PHONE" | "DEVICE";

/**
 * 일시정지 트리거. 서버에는 둘 다 `PAUSE` 하나로 전송한다 —
 * 2026-07-26 6차 인터뷰 확정으로 '화면 꺼짐'은 별도 라벨/코드가 아니라 일시정지에 합산된다.
 */
export type PauseTrigger = "MANUAL" | "BACKGROUND";

export type SessionState =
  | { kind: "FOCUS" }
  | { kind: "DISTRACTION"; trigger: DistractionTrigger }
  | { kind: "PAUSE"; trigger: PauseTrigger };

/**
 * 세션이 **어떻게 끝났는가** — 순수 클라이언트 내부 타입이다.
 *
 * ⚠️ **서버 계약이 아니다.** 종료 사유를 받는 필드가 백엔드 Swagger에 없으므로
 * `packages/types`로 올리지 않고 **제출 페이로드에도 넣지 않는다**(상상 계약 금지,
 * SCR-S3-7·S3-8 Data Contract). 쓰임은 단 하나 — 종료 후 어떤 화면을 보여줄지,
 * 자동 종료라면 S3-8 본문 문구를 무엇으로 고를지 결정하는 것뿐이다.
 *
 * - `MANUAL`: S3-7 종료 확인 다이얼로그에서 `공부 종료`를 누른 경우.
 * - `AUTO`: 일시정지가 임계값을 넘겨 자동 종료된 경우(S3-8). `trigger`는 **문구 선택 전용**이며
 *   임계값 판정에는 쓰지 않는다 — 수동 일시정지와 화면 꺼짐은 같은 규칙·같은 감시자를 쓴다.
 */
export type SessionEndReason = { kind: "MANUAL" } | { kind: "AUTO"; trigger: PauseTrigger };

export const MANUAL_END_REASON: SessionEndReason = { kind: "MANUAL" };

export function autoEndReason(trigger: PauseTrigger): SessionEndReason {
  return { kind: "AUTO", trigger };
}

/** 세션의 기본 상태. 구간 시작 시각은 `SessionTimeline`이 들고 있어 상태 객체에는 넣지 않는다. */
export const FOCUS_STATE: SessionState = { kind: "FOCUS" };

export function distractionState(trigger: DistractionTrigger): SessionState {
  return { kind: "DISTRACTION", trigger };
}

export function pauseState(trigger: PauseTrigger): SessionState {
  return { kind: "PAUSE", trigger };
}

export function isSameSessionState(a: SessionState, b: SessionState): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  if (a.kind === "DISTRACTION" && b.kind === "DISTRACTION") {
    return a.trigger === b.trigger;
  }
  if (a.kind === "PAUSE" && b.kind === "PAUSE") {
    return a.trigger === b.trigger;
  }
  return true;
}

/**
 * 화면 상태 → 서버 이벤트 status 매핑(SCR-S3-1·S3-2 Data Contract 표).
 * FOCUS는 기본 상태라 **이벤트로 기록하지 않는다** → null.
 */
export function toEventStatus(state: SessionState): StudyEventStatus | null {
  switch (state.kind) {
    case "FOCUS":
      return null;
    case "DISTRACTION":
      return state.trigger;
    case "PAUSE":
      return "PAUSE";
  }
}

/** 순공(focusSec) 타이머가 흐르는 상태인가 — 집중일 때만. */
export function isFocusRunning(state: SessionState): boolean {
  return state.kind === "FOCUS";
}

/** 총 공부(studySec) 타이머가 흐르는 상태인가 — 일시정지에서만 멈춘다(비집중에는 계속 흐른다). */
export function isStudyRunning(state: SessionState): boolean {
  return state.kind !== "PAUSE";
}
