# BY-764 코드와 어긋난 주석·낡은 문서 정리와 쓰이지 않는 브리지 메시지 제거

- 상위 스토리: BY-763
- 브랜치: `chore/BY-764-stale-comments-cleanup` (base `dev`, 18e079d7)
- 작성일: 2026-09-26

## 목표

dev 전체 코드를 흐름대로 읽으면서 찾은, 코드와 맞지 않는 주석과 문서를 현재 동작에 맞게 고친다.
보내는 쪽이나 받는 쪽이 없는 브리지 메시지를 지우고, 네이티브가 처리하지 않은 메시지 타입을
컴파일 단계에서 잡도록 타입을 강화한다. 런타임 동작은 바꾸지 않는다.

## 범위

### 커밋 ① 주석 수정

| 파일                                                            | 줄               | 지금 주석                                      | 사실                                                                 |
| --------------------------------------------------------------- | ---------------- | ---------------------------------------------- | -------------------------------------------------------------------- |
| `apps/web/src/lib/sessionStart.ts`                              | 16-17            | 네이티브 `start-session` 수신이 아직 없다      | `nativeBridgeHandler.ts`가 권한 게이트를 거쳐 `/room/1`을 연다       |
| `apps/web/src/lib/bridge.ts`                                    | 16               | 웹 자산이 앱에 번들 동봉된다                   | 전 화면이 원격 URL이고, 웹이 구 앱보다 먼저 배포되는 것이 기본이다   |
| `apps/mobile/lib/auth.ts`                                       | 17, 138-139      | 서버가 아직 토큰을 주지 않는다                 | 등록 응답이 토큰을 주고, 같은 함수가 access 토큰에서 userId를 읽는다 |
| `apps/web/src/features/home/useHomeSummary.ts`                  | 20               | userId는 셸이 준 URL 파라미터다                | `auth-token` 브리지 메시지로 온다                                    |
| `apps/mobile/components/RemoteScreen.tsx`                       | 11               | 탭 3개(홈·기록·설정)                           | 소셜을 포함해 4개다                                                  |
| `apps/mobile/lib/remoteQueryParams.ts`                          | 8                | 탭 3개                                         | 4개다                                                                |
| `apps/mobile/lib/nativeBridgeHandler.ts`                        | 41               | 탭 3개                                         | 4개다                                                                |
| `apps/web/src/features/study-session/vision/objectDetector.ts`  | 243              | GPU 먼저, 실패하면 CPU                         | delegate 순서는 CPU만이다(`visionConfig.ts`)                         |
| `apps/web/src/features/live-room/LiveRoomSession.tsx`           | 341              | 보관분이 다음 실행에서 재제출된다              | 로컬 보관·재제출은 서버 진행 스냅샷으로 바뀌며 삭제됐다              |
| `apps/web/src/features/study-session/submitStudySession.ts`     | 15               | 감지 신호는 아직 mock이다                      | 실제 Vision 감지기가 붙어 있다                                       |
| `apps/web/src/features/study-session/useStudyRoomSession.ts`    | 72               | 실제 구현체는 스파이크 이후 주입한다           | `RoomPage`가 실제 카메라 어댑터를 주입한다                           |
| `apps/web/src/features/study-session/adapters/cameraAdapter.ts` | 1-7              | 인터페이스와 mock만 있고 SDK를 호출하지 않는다 | `mediaStreamCamera.ts`가 실제 구현체다                               |
| `packages/types/src/bridge.ts`                                  | 117-119, 122-123 | 수신 구현은 BY-333 범위이고 그 전까지 무시된다 | 네이티브가 `start-session`, `open-settings`를 처리한다               |
| `apps/web/src/lib/nativeRouteReset.ts`                          | 14               | `userId` 등 셸 파라미터를 유지한다             | URL의 userId는 제거됐다                                              |
| `apps/mobile/components/RemoteWebViewHost.tsx`                  | 87               | 예시로 `session-ready`를 든다                  | 커밋 ③에서 지우는 메시지다                                           |

- 고친 주석에서는 저장소 주석 규칙대로 티켓 번호와 굵은 글씨 같은 마크다운을 뺀다.
- 손대지 않은 주석의 티켓 번호는 이번 범위가 아니다.
- `docs/superpowers/specs/`의 설계 문서는 당시 기록이라 고치지 않는다.

### 커밋 ② 문서 갱신

- `docs/architecture.md`를 현재 구조로 다시 쓴다. 다룰 내용은 원격 WebView 셸과 네이티브 역할, 브리지 handshake와 기능 표시, 토큰 소유와 갱신, 실시간(STOMP·WebRTC 풀메시·TURN), 배포(Vercel, main 배포)와 ADR 링크다.
- `docs/screen-ownership.md`를 "모든 화면은 `apps/web`, 모바일은 탭바·스택·권한·스플래시·토큰 같은 셸"이라는 기준으로 표를 고친다.
  - 없는 파일(`app/onboarding-guide.tsx`)을 가리키는 행을 바로잡는다.
  - 화면 명세 9개가 이 문서를 참조하므로 파일 이름과 위치는 유지한다.
- ADR 0006 본문은 두고, 송출 품질이 코드에서 360p·15fps·350kbps로 바뀌었다는 정정 메모를 덧붙인다.
- `peerMesh.test.ts:382`의 테스트 이름을 단언과 같은 값(350kbps)으로 고친다.

### 커밋 ③ 죽은 코드 제거

- ping/pong
  - 삭제 대상은 `ToWebMessage`의 `ping`, `ToNativeMessage`의 `pong`, 웹 `parseToWebMessage`의 ping 분기, 모바일 `parseToNativeMessage`의 pong 분기다.
  - `nativeLiveness.ts`와 그 테스트, `App.tsx`의 `useNativePingResponder` 호출도 지운다.
  - 네이티브의 ping 발신은 BY-443에서 이미 지워졌다. 구 앱도 ping을 보내지 않으므로 웹 응답 훅을 지워도 영향이 없다.
- `app-state`(`ToWebMessage`)와 `session-ready`(`ToNativeMessage`)
  - 타입, 양쪽 파서, 핸들러의 `case`를 지운다.
  - 이 둘을 "형식이 맞는 아무 메시지" 예시로 쓰던 테스트는 실제로 쓰이는 메시지로 바꾼다. 대상은 `bridge.test`, `appLifecycleAnalytics.test`, `deviceHandlingDetector.test`, `RemoteWebViewHost.test`, `webBridge.test`, `nativeBridgeHandler.test`, `nativeAnalytics.test`다.
  - 테스트가 검증하는 동작은 그대로 두고 예시 값만 바꾼다.
  - 두 메시지를 직접 검증하던 테스트(파싱 성공, `session-ready` 무동작)는 지운다.
  - `appStateAnalytics.ts`의 설명 주석도 메시지가 없어졌다는 사실에 맞춘다.
- `apps/web/public/favicon.svg`(Vite 기본 로고)와 `index.html`의 링크, 참조가 없는 `apps/web/public/icons.svg`를 지운다. `app-icon.png`는 그대로 둔다.

### 커밋 ④ 타입 강화

- `packages/types/src/bridge.ts`에 단계별 메시지 타입을 추가한다.
  - `HostPassedMessage`: `ToNativeMessage`에서 `RemoteWebViewHost`가 처리하고 끝내는 `home-ready`, `analytics-ready`, `set-back-gesture`, `set-orientation`을 뺀 타입
  - `HandlerMessage`: `HostPassedMessage`에서 `RemoteScreen`이 처리하고 끝내는 `set-back-lock`, `report-screen`을 뺀 타입
- `RemoteWebViewHost`의 `onBridgeMessage` prop은 `HostPassedMessage`를, `RemoteScreen`의 `onBridgeMessage` prop과 `handleBridgeMessage`는 `HandlerMessage`를 받는다.
- 앞 단계에서 처리하고 `return`하면 TypeScript가 남은 타입을 자동으로 좁혀 주므로, 호출부에 타입 단언을 넣지 않는다.
- `handleBridgeMessage`의 `default`에 `assertNever(message)`를 둔다. 런타임에서는 지금처럼 개발 모드 경고만 남기고 예외를 던지지 않는다.
  - 파서가 이미 알려진 타입만 넘기므로, 런타임에 `default`로 오는 경우는 타입과 파서가 어긋난 경우뿐이다.
- `room/[id].tsx`의 `motion-sensor` 가로채기는 공용 핸들러에도 `case`가 있으므로 타입을 바꾸지 않는다.
- 테스트에서 핸들러나 prop에 넘기는 메시지 타입이 좁아진 타입과 맞지 않으면 테스트 쪽 타입만 고친다.

## 읽는 동안 새로 찾은 것

- 구현 계획 문서에 발견 로그 표(파일, 문제, 조치, 우산인지 분리인지)를 두고 찾을 때마다 적는다.
- 동작이 바뀌지 않는 건은 ①~④ 중 알맞은 커밋에 더한다.
- 동작이 바뀌거나 새 테스트·실기기 확인·팀 논의가 필요한 건은 BY-763 분리 후보로 제안하고 건별로 승인받는다.

## 검증

- 웹·모바일 모두 `typecheck`, `lint`, `test`를 돌린다.
- 커밋 ③의 테스트 변경은 커밋 계획 표에 "검증 대상은 같고 예시 메시지만 바뀜" 또는 "지운 메시지를 직접 검증하던 테스트 삭제"로 구분해 적는다.
- 실기기 검증은 하지 않는다. 런타임 변경은 보내는 쪽이 없는 메시지의 처리 코드를 지우는 커밋 ③뿐이다.
- 모르는 메시지를 파서가 `null`로 버리는 기존 테스트가 남아 있는지 확인한다. 구버전 앱·웹과의 호환은 이 동작에 의존한다.

## 팀원 관련

- 팀원이 주로 작성한 파일을 고친다: `objectDetector.ts`, `submitStudySession.ts`, `cameraAdapter.ts`, `useStudyRoomSession.ts`의 주석(황선규), `screen-ownership.md`를 참조하는 화면 명세(황선규).
- PR 본문에 파일과 주인을 적고 리뷰를 요청한다.

## 범위 밖

- 브리지 파서를 `packages/types`로 합치는 작업
- `getStudySessionDetail` 삭제(기록 화면용으로 남기기로 한 결정이 있다)
- BY-763의 나머지 분리 후보
