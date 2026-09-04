/**
 * WebView ↔ 네이티브 브리지 메시지 계약
 * (`frontend/docs/superpowers/specs/2026-07-26-session-state-model-and-contract-design.md` §10).
 *
 * 매초 갱신되는 타이머와 상태 전환은 **이 통로를 건너지 않는다** — 상태기계와 화면이 같은
 * 메모리(웹)에 있으므로 직접 읽는다. 브리지에는 웹이 만들 수 없는 원시 신호(가속도·앱 생명주기)와
 * 네이티브만 할 수 있는 동작(권한·네비게이션 등)만 오간다.
 */

/** 네이티브 → 웹. */
export type ToWebMessage =
  /** 가속도 임계 초과 여부. 원시 값은 넘기지 않는다(스펙 §3 "가속도 신호의 경계"). */
  | { type: "device-handling"; active: boolean; atMs: number }
  | { type: "app-state"; state: "active" | "background"; atMs: number }
  /** `request-camera-gate` 응답. `granted: false`면 네이티브가 권한 안내 화면을 이미 띄운 상태다. */
  | { type: "camera-gate-result"; granted: boolean; atMs: number }
  /**
   * 시스템 테마 변경 통지 — Android 전용 발신. Android WebView는 시스템 다크를
   * `prefers-color-scheme`에 전달하지 않아 웹이 스스로 알 수 없다. 초기 테마는 웹뷰 URL의
   * `theme` 쿼리로 오고(첫 페인트 전 반영 — `apps/web/src/lib/nativeTheme.ts`), 앱 실행 중
   * 변경만 이 메시지로 온다. iOS는 미디어쿼리가 동작하므로 쿼리도 메시지도 보내지 않는다.
   */
  | { type: "theme"; scheme: "light" | "dark"; atMs: number }
  /**
   * 탭 웹뷰를 탭 루트로 초기화하라는 요청 — Android 전용 발신. 시스템 뒤로가기로 탭을 떠날 때
   * 웹뷰가 내부 히스토리를 유지한 채 남아, 재진입 시 이전 하위 페이지가 보이는 문제를 막는다.
   * `path`는 그 탭의 루트 웹 경로다. 웹은 현재 쿼리(`userId` 등 셸 계약)를 승계해 replace로
   * 이동한다(`apps/web/src/lib/nativeRouteReset.ts`).
   */
  | { type: "reset-route"; path: string; atMs: number }
  /**
   * 웹뷰 생존 확인(BY-436) — 네이티브가 포그라운드 복귀 시 보낸다. 웹은 `pong`으로 즉답한다.
   *
   * OS가 백그라운드에서 웹 렌더러 프로세스를 회수하면 사후 통보(iOS
   * `onContentProcessDidTerminate`, Android `onRenderProcessGone`)가 **한참 늦게** 오거나
   * 아예 오지 않아, 그동안 순백 화면(iOS)·죽은 잔상(Android)이 노출된다(실기기 확인).
   * 그래서 통보를 기다리지 않고 복귀 시점에 직접 물어본다 — 응답이 없으면 죽은 것으로
   * 보고 스플래시로 덮고 재로드한다. `id`로 요청과 응답의 짝을 맞춘다(낡은 pong 방지).
   */
  | { type: "ping"; id: number; atMs: number }
  /**
   * 앱 프로세스가 방금 시작했다는 알림 — 홈 웹뷰에만, 실행마다 한 번만 온다.
   *
   * 웹은 화면만 보고 "앱을 새로 켰다"와 "안드로이드 전역 복구로 웹뷰가 다시 섰다"를 구분할 수
   * 없다. 그 정보는 네이티브만 갖고 있어서 메시지로 넘긴다. 쿼리로 붙이지 않는 이유는 전역
   * 복구가 컴포넌트를 다시 만들지 않고 URL만 새로 만들어, 같은 쿼리가 다시 붙기 때문이다.
   */
  | { type: "app-launched"; atMs: number }
  | CameraPermissionMessage;

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

/** 웹 → 네이티브. */
export type ToNativeMessage =
  /** 세션 화면이 살아 있고 브리지가 연결됐음을 알린다. */
  | { type: "session-ready"; atMs: number }
  /**
   * 홈 화면이 구독까지 걸고 신호를 받을 준비가 됐음을 알린다. 네이티브는 이걸 받은 순간에만
   * `app-launched`로 응답한다.
   *
   * 로드 이벤트에 발신을 걸 수 없어서 생긴 handshake다 — Android의 react-native-webview는
   * 로드가 실패해도 finish 이벤트를 합성해 `onLoad`까지 불러 준다(RNCWebViewClient.java의
   * emitFinishEvent). 어느 로드 콜백이든 "웹 JS가 실제로 돌았다"를 보장하지 못하므로, 그 보장을
   * 웹이 스스로 보내는 메시지로 만든다. 실패한 로드에서는 이 메시지 자체가 나가지 않는다.
   */
  | { type: "home-ready"; atMs: number }
  /** `ping`(생존 확인)에 대한 즉답 — `id`는 받은 ping의 것을 그대로 되돌린다. */
  | { type: "pong"; id: number; atMs: number }
  | ReportScreenMessage
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
  /**
   * OS 공유 시트를 열어달라는 요청 — 초대코드 공유(S9-2)가 보낸다.
   *
   * **Android 웹뷰에는 `navigator.share`가 없다**(Web Share API는 Chrome 브라우저 전용,
   * 2026-08-20 에뮬레이터 실측) — iOS WKWebView는 시트가 떠서 웹이 직접 처리하고, Android만
   * 이 통로로 네이티브 RN `Share.share`에 맡긴다. 응답은 없다 — 시트 노출·취소 피드백은
   * OS가 이미 주므로 왕복이 필요 없고, 브라우저 단독 모드에서는 발신되지 않는다(웹이
   * 클립보드 복사로 폴백).
   *
   * `url`·`title`은 선택 필드다. `title`은 시트 제목으로 쓴다. `url`은 BY-427이 공유시트
   * 썸네일 카드를 위해 도입했으나, 카톡에서 본문 링크와 겹쳐 프리뷰가 두 번 생기는 원인이라
   * BY-584 이후 현행 웹 발신자는 의도적으로 생략한다 — 링크는 text 본문에 둔다. 이 필드는
   * 레거시 웹 메시지 수신 호환을 위해 남겨 둔다.
   */
  | { type: "share"; text: string; url?: string; title?: string; atMs: number }
  /**
   * 화면 회전 잠금 제어 — 실시간 룸(`/social/room/:id`)이 마운트 동안 `unlocked: true`,
   * 언마운트에서 `false`를 보낸다. 룸은 탭 웹뷰 안 웹 라우트라 네이티브 화면 전환이 없어
   * 솔로 세션(`room/[id]`)의 마운트 기반 해제 경로를 탈 수 없다 — `set-back-lock`과 같은
   * 웹 주도 패턴으로 잠금을 제어한다.
   *
   * 네이티브 반응은 양 플랫폼 공통이다(BY-444 — 종전 "iOS 무시"는 iOS 루트 세로 잠금이
   * 통째로 우회되던 버그 동안에만 성립하던 결정이라 폐기했다. 잠금이 실동작하는 지금은 이
   * 개방이 없으면 iOS 소셜 룸 가로 모드가 죽는다). 되잠그는 책임은 푼 쪽(룸 언마운트)에 있고,
   * 문서 세대가 바뀌어 그 책임자가 사라지면 네이티브가 복구 진입 시점에 세로로 복원한다
   * (`RemoteWebViewHost` 참고). 브라우저 단독 모드에서는 발신돼도 받는 쪽이 없다.
   */
  | { type: "set-orientation"; unlocked: boolean; atMs: number }
  /**
   * 카메라 권한 게이트 실행 요청 — 실시간 룸이 입장을 확정하기 전에 보낸다.
   *
   * 솔로 세션은 `start-session` 브리지가 게이트를 돌리지만 소셜 룸은 웹 라우팅이라 그 경로를
   * 지나지 않는다. Android 웹뷰는 앱에 OS 권한이 없으면 묻지 않고 거부하므로, 웹이 먼저
   * 게이트를 요청하고 `camera-gate-result` 응답을 기다린다. 거부면 룸에 입장하지 않는다.
   * 게이트 자체는 양 플랫폼 공통이다 — iOS도 거부 상태에서 안내 없이 카메라 획득만 실패하는
   * 공백이 같다.
   *
   * 응답이 오지 않을 때의 판단은 웹이 셸 표시(`cameraGate=1` 쿼리)로 가른다 — 표시가 있으면
   * 차단, 없으면(이 메시지를 모르는 구버전 앱) 통과다. 상세는 `apps/web/src/lib/nativeCameraGate.ts`.
   */
  | { type: "request-camera-gate"; atMs: number }
  | SetTabBarMessage
  | SetBackGestureMessage
  | SetBackLockMessage
  | NavigateTabMessage
  | NavigateHomeMessage;

/**
 * 웹 SPA의 현재 화면 보고(BY-436) — 라우트가 바뀔 때마다 웹이 보낸다.
 *
 * 두 가지 복구에 쓰인다. 웹 렌더러 프로세스가 죽으면:
 * 1. Android는 WebView를 재마운트하는데 초기 `source`가 탭 루트 경로라 사용자가 있던
 *    화면(소셜룸 등)을 잃는다 — `path`·`restoreQuery`가 돌아갈 곳을 알려준다.
 *    소셜룸은 router state(초대코드)가 재마운트에서 소실되므로 `restoreQuery.code`로
 *    실어 보내고, 웹 라우트가 이를 폴백 입장 정보로 받는다.
 * 2. 복구 동안 덮는 스플래시의 톤 — 어두운 룸·세션 화면에서 죽었는데 라이트 스켈레톤을
 *    덮으면 흰 번쩍임이 된다. `dark`가 다크 배경 스플래시를 고르게 한다.
 *
 * 공용 쿼리(userId·appVersion)는 네이티브가 다시 붙이므로 여기 싣지 않는다.
 */
export interface ReportScreenMessage {
  type: "report-screen";
  /** 쿼리 없는 pathname (예: `/social/room/42`). */
  path: string;
  /** 복원에 필요한 화면별 쿼리 (예: `{ code: "0712" }`). 없으면 생략. */
  restoreQuery?: Record<string, string>;
  /** 어두운 전체 화면(룸·세션) 여부. */
  dark: boolean;
  atMs: number;
}

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
 * iOS 웹뷰의 가장자리 스와이프(back-forward) 제스처를 끈다/켠다 — `set-tab-bar`와 같은 이유로
 * **어느 웹 라우트에 있는지 웹만 알기 때문에** 필요하다.
 *
 * 이 제스처는 설정 → 문의하기처럼 웹 안에서만 일어난 이동을 스와이프로 되돌리기 위해 웹뷰
 * 전체에 켜져 있다(`RemoteWebViewHost`의 `allowsBackForwardNavigationGestures` 주석). 그런데
 * 온보딩 가이드(G1~G5)에서는 같은 제스처가 **가이드를 통째로 이탈**시킨다 — 스텝 이동은
 * 가이드 내부 상태라 웹 히스토리에 쌓이지 않으므로, 가장자리 스와이프의 히스토리 back이
 * 곧장 진입 전 화면(설정·홈)으로 떨어진다. 가이드 종료는 X·완료·건너뛰기로만 확정한다는
 * 계약(SCR-G1-G5 — X는 세션으로 이어지지 않는다, 종료 래치)과 어긋나는 우발 이탈이다.
 *
 * `enabled: true`로 되돌리는 책임은 끈 쪽(가이드 언마운트)에 있다 — 켜진 상태가 기본값이다.
 * Android에는 대응 제스처가 없어 no-op이고, 브라우저 단독 모드에서는 발신돼도 받는 쪽이 없다.
 */
export interface SetBackGestureMessage {
  type: "set-back-gesture";
  enabled: boolean;
  atMs: number;
}

/**
 * Android 하드웨어 뒤로가기 잠금 — 소셜룸 세션(`/social/room/:id`)이 보낸다.
 *
 * 세션 중 뒤로가기로 방을 이탈하면 제출 없이 측정이 유실된다. 싱글룸은 자기 네이티브
 * 화면(`app/room/[id].tsx`)의 `blockHardwareBack`으로 항상 막지만, 소셜룸은 탭 웹뷰 안
 * 웹 라우팅이라 화면 단위 prop을 걸 자리가 없다 — 그래서 룸에 있는 동안만 웹이 이
 * 신호로 잠근다. 화면 내의 나가기 버튼으로만 세션을 종료할 수 있다(싱글룸과 같은 정책).
 *
 * `locked: false`로 되푸는 책임은 잠근 쪽(세션 언마운트)에 있다 — 풀린 상태가 기본값이다.
 * iOS 가장자리 스와이프는 `set-back-gesture`가 담당하고, 브라우저 단독 모드에서는
 * 발신돼도 받는 쪽이 없다.
 */
export interface SetBackLockMessage {
  type: "set-back-lock";
  locked: boolean;
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
