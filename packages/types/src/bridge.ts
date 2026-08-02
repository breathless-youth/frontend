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
  | CameraPermissionMessage
  | SubmitResultMessage;

/**
 * OS 카메라 권한 허용 여부 — `request-camera-permission`에 대한 응답.
 *
 * 설정(S6)의 카메라 권한 행이 토글로 표시한다. **웹이 스스로 알 수 없어서** 네이티브가
 * 실어 보낸다: `navigator.permissions.query({name:"camera"})`는 iOS WKWebView가 지원하지
 * 않아 앱 안에서는 쓸 수 없다(Android WebView만 동작해 플랫폼별로 갈린다).
 *
 * 3상태(`undetermined`·`granted`·`denied`)를 그대로 넘기지 않고 boolean으로 좁힌다 —
 * 화면이 구분하는 것은 "허용됨"과 "그 외"뿐이고, 미결정을 별도로 보여줄 자리가 S6에 없다.
 *
 * **"모름"은 이 메시지의 부재로 표현한다.** 조회 실패 시 네이티브는 아무것도 보내지 않고,
 * 브라우저 단독 모드에서는 애초에 오지 않는다 — 웹은 그 동안 `null`을 유지해 토글 자리를
 * 비운다(RN 원본의 `granted === null` 분기와 같은 모양). 모르는 값을 `false`로 단정하면
 * 화면이 "허용 안 됨"이라고 틀린 단언을 하게 된다.
 */
export interface CameraPermissionMessage {
  type: "camera-permission";
  granted: boolean;
  atMs: number;
}

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
  | { type: "session-ready"; atMs: number }
  /**
   * 가속도 센서 구독을 켜고 끈다.
   *
   * 감지 수명은 웹이 소유한다(일시정지·카메라 전환 중 정지 — 설계 §5 "샘플링과 수명").
   * 센서는 네이티브에만 있으므로 그 판단을 이 통로로 내려보낸다. 끄면 네이티브가
   * 구독을 해제하고 열려 있던 조작 구간을 `device-handling: false`로 닫는다.
   */
  | { type: "motion-sensor"; enabled: boolean; atMs: number }
  /**
   * 웹 홈·온보딩 가이드에서 "집중 시작"이 확정됐다 — 네이티브가 카메라 권한 게이트를 돌리고
   * 세션 화면을 push한다(BY-334에서 웹 발신 추가).
   *
   * 온보딩이 웹으로 이관돼도 이 메시지는 필요하다: **권한 요청과 화면 스택은 네이티브 소유**라
   * 웹이 대신할 수 없다. 수신·게이트 실행은 BY-333 범위다 — 그때까지 네이티브는 이 메시지를
   * 무시하고(모르는 메시지는 흘려보내는 계약), 브라우저 단독 모드에서는 애초에 발신되지 않는다.
   */
  | { type: "start-session"; atMs: number }
  /**
   * 설정(S6) 카메라 권한 행에서 OS 설정 앱을 열어달라는 요청.
   * 네이티브 수신 구현은 BY-333 — 그 전까지는 웹에서 보내도 받는 쪽이 없어 아무 일도 안 일어난다.
   */
  | { type: "open-settings"; atMs: number }
  /**
   * 설정(S6)이 카메라 권한 상태를 물어본다 — 네이티브가 `camera-permission`으로 답한다.
   *
   * **폴링이 아니라 웹이 필요한 시점에만 묻는 방식이다.** 권한은 사용자가 OS 설정에 다녀오는
   * 동안 바뀌므로 한 번 받아 두면 낡는데, 그 복귀 시점을 웹이 `visibilitychange`로 알 수
   * 있어 네이티브에 앱 생명주기 배선을 새로 넣지 않아도 된다(웹뷰 재노출 시 재조회는
   * react-query의 `refetchOnWindowFocus`가 이미 쓰고 있는 신호다).
   *
   * 브라우저 단독 모드에서는 발신되지 않는다 — 받는 쪽이 없으면 답도 없고, 그 경우 화면은
   * 토글 없는 상태로 남는다(`CameraPermissionMessage` 주석 참고).
   */
  | { type: "request-camera-permission"; atMs: number }
  | SetTabBarMessage
  | NavigateTabMessage
  | SubmitSessionMessage
  | NavigateHomeMessage;

/**
 * 네이티브 하단 탭을 전환해 달라는 요청 — 홈(S1) 연속 공부 카드가 보낸다
 * (Figma `Card / Stat` 38:86: "Streak=불꽃+셰브런(**기록 탭 이동**)").
 *
 * 탭 전환은 네이티브 탭바 소유라 웹 라우터의 `navigate("/records")`로는 웹뷰 안의 문서만
 * 바뀔 뿐 네이티브 탭이 움직이지 않는다 — `navigate-home`(세션 모달 닫기)과 같은 이유로
 * 신호만 보내고 실제 전환은 네이티브가 한다.
 *
 * `tab`이 `"records"` 하나뿐인 이유: 목적지가 확정된 탭 간 이동이 이것뿐이다(탭바 IA 원칙
 * "목적지가 확정되지 않은 탭을 임의로 늘리지 않는다"와 같은 태도). 새 이동이 확정되면
 * 유니온을 넓힌다 — 호환 변경이다.
 *
 * 브라우저 단독 모드에서는 발신하지 않는다 — 호출부가 웹 라우트 `/records`로 직접 이동한다
 * (쿼리 승계 포함, 발신부 참고).
 */
export interface NavigateTabMessage {
  type: "navigate-tab";
  tab: "records";
  atMs: number;
}

/**
 * 네이티브 하단 탭 바를 감춘다/보인다 — **웹 라우트가 전체 화면인지 웹만 알기 때문에** 필요하다.
 *
 * 온보딩 가이드(G1~G5)·문의하기·약관·개인정보처리방침은 탭 바 없는 전체 화면 라우트인데
 * (`apps/web/src/App.tsx`), 이 화면들은 탭 웹뷰 **안에서 웹 라우팅으로** 열린다. 네이티브
 * 스택을 건너지 않으므로 네이티브는 이동을 알 수 없고, 탭 바가 그대로 남아 Figma G1~G5(탭 바
 * 없음)와 어긋난다.
 *
 * **웹이 탭 바를 직접 가릴 수는 없다.** `app/(tabs)/_layout.tsx`에서 탭 바는 웹뷰와 형제로
 * 렌더되어 웹뷰 바깥에 있다 — 웹이 아무리 전체 화면을 칠해도 그 영역에 닿지 못한다.
 *
 * 세션(`/room/:id`)은 이 메시지를 쓰지 않는다 — 네이티브가 `fullScreenModal`로 띄워 탭 바가
 * 이미 덮이고, 세션 웹뷰는 탭 라우트로 돌아오지 않아 `visible: true`를 되돌려줄 기회가 없다.
 */
export interface SetTabBarMessage {
  type: "set-tab-bar";
  visible: boolean;
  atMs: number;
}

/**
 * S4(공부 결과)·미달 종료 안내의 CTA가 보낸다 — **네이티브 홈 탭으로 돌려보내 달라는 요청**이다.
 *
 * 웹 라우터의 `navigate("/")`만으로는 WebView 안의 웹 홈이 열릴 뿐 네이티브 홈 탭으로 가지
 * 않는다(모바일이 `apps/web`을 WebView로 로드하는 구조이기 때문 — ADR 0001). 세션 화면은
 * 네이티브 쪽에서 `fullScreenModal`로 띄워져 있으므로, 돌아가는 방법(모달 닫기)은 네이티브만
 * 안다 — 그래서 신호만 보내고 실제 네비게이션은 `apps/mobile/app/room/[id].tsx`가 한다.
 *
 * 브리지가 없는 브라우저 단독 모드(ADR 0001)에서는 이 메시지가 조용히 버려지고, 호출부가
 * 남겨 둔 웹 라우터 폴백(`navigate("/home", {replace:true})`, `location.search` 승계)이 그대로
 * 동작한다.
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
