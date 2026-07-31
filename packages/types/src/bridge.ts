/**
 * WebView ↔ 네이티브 브리지 메시지 계약
 * (`frontend/docs/superpowers/specs/2026-07-26-session-state-model-and-contract-design.md` §10).
 *
 * 매초 갱신되는 타이머와 상태 전환은 **이 통로를 건너지 않는다** — 상태기계와 화면이 같은
 * 메모리(웹)에 있으므로 직접 읽는다. 브리지에는 웹이 만들 수 없는 원시 신호(가속도·앱 생명주기)와
 * 네이티브만 할 수 있는 저장(체크포인트·제출)만 오간다.
 */

/** 네이티브 → 웹. */
export type ToWebMessage =
  /** 가속도 임계 초과 여부. 원시 값은 넘기지 않는다(스펙 §3 "가속도 신호의 경계"). */
  | { type: "device-handling"; active: boolean; atMs: number }
  | { type: "app-state"; state: "active" | "background"; atMs: number };

/** 웹 → 네이티브. */
export type ToNativeMessage =
  /** 세션 화면이 살아 있고 브리지가 연결됐음을 알린다. */
  | { type: "session-ready"; atMs: number }
  /**
   * 설정(S6) 카메라 권한 행에서 OS 설정 앱을 열어달라는 요청.
   * 네이티브 수신 구현은 BY-333 — 그 전까지는 웹에서 보내도 받는 쪽이 없어 아무 일도 안 일어난다.
   */
  | { type: "open-settings"; atMs: number }
  /**
   * S4 결과 화면의 `확인` — 세션 화면을 닫아달라는 요청.
   *
   * 세션은 네이티브가 push한 **별도 화면**이라(탭바 없는 풀스크린) 웹이 스스로 닫을 수 없다.
   * 웹 라우터로 홈에 가면 세션 화면 안에 홈이 그려지는 잘못된 중첩이 된다.
   * 네이티브 수신 구현은 BY-333 — 그 전까지는 웹의 `/home` 폴백 이동이 대신 동작한다.
   */
  | { type: "exit-session"; atMs: number };
