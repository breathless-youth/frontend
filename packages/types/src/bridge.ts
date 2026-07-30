/**
 * WebView ↔ 네이티브 브리지 메시지 계약
 * (`frontend/docs/superpowers/specs/2026-07-26-session-state-model-and-contract-design.md` §10).
 *
 * 매초 갱신되는 타이머와 상태 전환은 **이 통로를 건너지 않는다** — 상태기계와 화면이 같은
 * 메모리(웹)에 있으므로 직접 읽는다. 브리지에는 웹이 만들 수 없는 원시 신호(가속도·앱 생명주기)와
 * 네이티브만 할 수 있는 저장(체크포인트·제출)만 오간다.
 */

// 타입 전용 import라 컴파일 시 완전히 지워진다 — `index.ts`가 이 파일을 다시 export하지만
// 런타임 순환은 생기지 않는다(양방향 모두 `export type`/`import type`).
import type { StudySessionCreateRequest, StudySessionResponse } from "./index";

/** 네이티브 → 웹. */
export type ToWebMessage =
  /** 가속도 임계 초과 여부. 원시 값은 넘기지 않는다(스펙 §3 "가속도 신호의 경계"). */
  | { type: "device-handling"; active: boolean; atMs: number }
  | { type: "app-state"; state: "active" | "background"; atMs: number }
  | SubmitResultMessage;

/**
 * 세션 제출 결과 — `submit-session`에 대한 응답.
 *
 * `requestId`로 요청과 짝을 맞춘다. 제출 실패 후 재시도하면 요청이 두 번 나갈 수 있고,
 * 그때 첫 응답이 늦게 도착하면 **재시도를 낡은 결과로 완료시켜 버린다** — id가 그걸 막는다.
 */
export type SubmitResultMessage =
  | {
      type: "submit-result";
      requestId: string;
      ok: true;
      /** 서버 응답 그대로. 자정(KST)을 넘는 세션은 날짜별로 분할되어 여러 건이 온다. */
      sessions: StudySessionResponse[];
      atMs: number;
    }
  | {
      type: "submit-result";
      requestId: string;
      ok: false;
      /** 사용자에게 보여줄 실패 사유. 웹이 그대로 표시한다. */
      message: string;
      atMs: number;
    };

/** 웹 → 네이티브. */
export type ToNativeMessage =
  /** 세션 화면이 살아 있고 브리지가 연결됐음을 알린다. */
  { type: "session-ready"; atMs: number } | SubmitSessionMessage | NavigateHomeMessage;

/**
 * S4(공부 결과)·미달 종료 안내의 CTA가 보낸다 — **네이티브 홈 탭으로 돌려보내 달라는 요청**이다.
 *
 * 웹 라우터의 `navigate("/")`만으로는 WebView 안의 웹 홈이 열릴 뿐 네이티브 홈 탭으로 가지
 * 않는다(모바일이 `apps/web`을 WebView로 로드하는 구조이기 때문 — ADR 0001). 세션 화면은
 * 네이티브 쪽에서 `fullScreenModal`로 띄워져 있으므로, 돌아가는 방법(모달 닫기)은 네이티브만
 * 안다 — 그래서 신호만 보내고 실제 네비게이션은 `apps/mobile/app/room/[id].tsx`가 한다.
 *
 * 브리지가 없는 브라우저 단독 모드(ADR 0001)에서는 이 메시지가 조용히 버려지고, 호출부가
 * 남겨 둔 웹 라우터 폴백(`navigate("/", {replace:true})`)이 그대로 동작한다.
 */
export interface NavigateHomeMessage {
  type: "navigate-home";
  atMs: number;
}

/**
 * 세션 제출 요청 — **네이티브에 HTTP 호출만 대행시킨다.**
 *
 * WebView 안에서 백엔드로 직접 `fetch`하면 CORS에 막히기 때문이다(백엔드가
 * `Access-Control-Allow-Origin`을 보내지 않는다 — 2026-07-30 확인). 네이티브의 `fetch`는
 * 브라우저 CORS 정책을 타지 않으므로 같은 요청이 그대로 통한다.
 *
 * ⚠️ **`request`는 웹이 완성한 최종 요청 본문이다. 네이티브는 이 값을 고치지 않는다** —
 * 클램프·시각 변환 등 계약 검증은 전부 웹의 `buildSessionRequest`가 소유한다(루트
 * `CLAUDE.md` 아키텍처 경계: 네이티브 셸에 세션 로직을 두지 않는다).
 */
export interface SubmitSessionMessage {
  type: "submit-session";
  requestId: string;
  request: StudySessionCreateRequest;
  atMs: number;
}
