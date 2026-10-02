# 아키텍처 개요

## 한눈에 보기

- 네이티브 셸 `apps/mobile`은 탭바, 스택, OS 권한, 스플래시, 인증 토큰을 맡는다.
- 화면 구성
  - 앱: 카메라 권한 거부 안내
  - 웹(위 화면을 제외한 모든 화면): 셸은 화면마다 `RemoteScreen`으로 원격 URL을 웹뷰에 연다.
- 앱 번들에 웹 자산을 넣지 않으므로 웹을 배포하면 이미 설치된 앱의 화면도 바로 바뀐다.
- 그래서 설치된 앱과 배포된 웹의 버전은 늘 어긋날 수 있고, 웹은 모르는 브리지 메시지를 버린다.
- 브라우저에서 웹을 직접 열어도 같은 화면이 뜨고, 이때 네이티브로 보내는 메시지는 아무 일도 하지 않는다.

```
apps/mobile (Expo 셸)
  탭바, 스택, 권한, 스플래시, 토큰(SecureStore)
  RemoteScreen ─ 원격 URL 로드 ─▶ WebView
                                    │
          injectJavaScript ─────────┤  네이티브 → 웹
          ReactNativeWebView ◀──────┤  웹 → 네이티브
                                    ▼
apps/web (Vite + React)
  모든 화면, 세션 측정, 소셜 룸(STOMP + WebRTC)
```

## 모노레포 구조

- pnpm workspaces와 Turborepo로 관리하고, 패키지마다 `lint`·`typecheck`·`test`·`build` 스크립트를 같은 이름으로 둔다.
- `apps/web`: Vite와 React로 만든 웹 앱
- `apps/mobile`: Expo와 `expo-router`로 만든 셸. 화면 파일은 대부분 `RemoteScreen`에 경로만 넘긴다.
- `packages/types`
  - 서버 API 타입(`index.ts`)
  - 엔드포인트별 `API-Version` 표(`apiVersion.ts`)
  - 브리지 메시지 타입(`bridge.ts`)
  - 룸 STOMP 메시지 타입(`room.ts`)
- `packages/design-tokens`: 모바일과 웹이 함께 쓰는 의미 기반 디자인 토큰
- `packages/config`: 공유 ESLint·Prettier 설정

## 브리지

- 웹에서 네이티브로는 `ReactNativeWebView.postMessage`에 JSON 문자열을 보낸다(`apps/web/src/lib/bridge.ts`).
- 네이티브에서 웹으로는 `injectJavaScript`로 전역 함수 `__focusonNativeMessage`를 부른다(`apps/mobile/lib/webBridge.ts`).
  - 전역 함수를 쓰는 것은 react-native-webview가 플랫폼마다 메시지를 `window`와 `document` 중 다른 곳에 보내기 때문이다.
- 메시지 타입은 양쪽이 `packages/types/src/bridge.ts` 하나를 import해 맞춘다.

### handshake

- 로드 콜백만으로는 "웹 JS가 돌고 구독까지 걸렸다"를 알 수 없어서, 웹이 구독을 건 뒤 준비 신호를 먼저 보낸다.
- `auth-ready`를 받은 네이티브는 그 문서에 `auth-token`으로 신원과 access 토큰을 보낸다.
- `home-ready`를 받은 순간에만 네이티브가 `app-launched`로 답한다.
- `analytics-ready`를 보낸 문서에만 네이티브가 관측한 `track-event`를 넣고, 그 전까지는 큐에 모아 둔다.

### 기능 표시 쿼리

- 셸은 웹뷰 URL에 `share=1`, `cameraGate=1`, `guestAuth=1`, `nativeUpdateGate=1`을 붙인다(`apps/mobile/lib/remoteQueryParams.ts`).
- 각 값은 이 바이너리가 해당 브리지 메시지를 처리할 수 있다는 표시다.
- 원격 웹은 구버전 앱에도 바로 배포되므로 웹은 브리지가 있는지가 아니라 이 표시로 기능을 판단한다.
- 표시가 없으면 웹은 구버전 앱으로 보고 클립보드 폴백, 웹 강제 업데이트 게이트 같은 예전 방식을 쓴다.

## 신원과 API

- access·refresh 토큰은 네이티브가 SecureStore에만 저장한다(`apps/mobile/lib/auth.ts`).
- 웹은 `auth-token`으로 받은 `userId`와 access 토큰만 메모리에 들고, refresh 토큰은 받지 않는다(`apps/web/src/lib/auth/tokenSource.ts`).
  - 웹뷰 첫 렌더에서 `userId`가 `null`인 것은 "신원 없음"이 아니라 "아직 모름"이라서, 화면은 `useIdentityPending()`으로 둘을 가른다.
- `apiFetch`는 401을 받으면 `request-token-refresh`로 네이티브에 갱신을 요청하고 한 번만 재시도한다(`apps/web/src/lib/api.ts`).
  - 한 문서 안의 동시 갱신 요청은 하나로 묶인다.
  - 네이티브의 `refreshAuth`도 앱 전체에서 진행 중인 갱신을 하나로 제한한다.
  - refresh 토큰은 1회용으로 회전해서, 갱신이 둘 나가면 서버가 재사용으로 보고 토큰을 전부 폐기한다.
- `API-Version` 헤더 값은 엔드포인트마다 달라서 호출부가 엔드포인트 키를 넘기면 `apiVersionFor`가 표에서 고른다.
  - 틀린 버전은 400으로 거절되므로 전역 기본값을 두지 않는다.

## 실시간

- 소셜 룸은 STOMP over WebSocket 제어 채널과 WebRTC P2P 풀메시로 동작한다([ADR 0006](./adr/0006-p2p-mesh-stomp-over-livekit.md)).
- 제어 채널은 `RoomChannel` 인터페이스 뒤에 있고, 구현체는 `stompRoomChannel.ts`다.
- 방 전체 브로드캐스트는 `/topic/room/{roomId}`, 본인 대상 메시지는 `/user/queue/room`으로 받는다(`packages/types/src/room.ts`).
- `peerMesh.ts`는 STOMP를 모르고 채널을 통해서만 시그널을 주고받는다.
- glare를 피하려고 `SNAPSHOT`을 받은 신규 입장자만 offer를 만들고 기존 멤버는 기본적으로 answer만 한다. 다만 SNAPSHOT을 유실한 신규 입장자가 offer를 내지 않으면 기존 멤버가 자기 치유로 역방향 offer를 낸다(`peerMesh.ts`).
- 방 정원은 최대 6명이라 한 사람이 맺는 연결은 최대 5개다(ADR 0006).
- 송신 품질 상한은 360p·15fps·350kbps다(`peerMesh.ts`).
- TURN은 coturn을 쓰고, 클라이언트는 방 참여 응답의 `iceServers`로 주소와 인증 정보를 받는다.
- 백그라운드에서 돌아오면 모든 P2P 연결을 버리고 채널 재연결 뒤의 새 `SNAPSHOT`으로 다시 연결한다(`resetConnections`).

## 배포

- 웹은 Vercel에 배포하고, `main` 머지 커밋이 곧 운영 릴리즈다([releases.md](./releases.md)).
- 운영 앱은 `web.focusmakers.app`, staging 앱은 `dev` 브랜치가 나가는 `web-dev.focusmakers.app`을 연다(`apps/mobile/app.config.ts`).
- development 빌드는 `.env.local`의 `WEB_BASE_URL`로 로컬 웹을 연다.
- 앱은 EAS 프로필 `production`, `staging`, `development`로 빌드한다([ADR 0007](./adr/0007-three-tier-environment-model-and-eas-profiles.md)).
  - 세 티어는 bundle identifier와 스킴이 달라 한 기기에 함께 설치할 수 있다.

## 결정 기록

| ADR                                                                 | 결정                                                            | 상태      |
| ------------------------------------------------------------------- | --------------------------------------------------------------- | --------- |
| [0001](./adr/0001-webview-based-study-room-architecture.md)         | 스터디룸을 웹앱으로 만들고 RN 앱에 웹뷰로 넣는다                | 활성      |
| [0002](./adr/0002-native-mobile-study-room-and-independent-web.md)  | 모바일 스터디룸을 네이티브 RN으로 만든다                        | 향후 목표 |
| [0003](./adr/0003-phased-rollout-webview-mvp-then-native.md)        | MVP는 웹뷰로 가고 네이티브 전환은 로드맵으로 둔다               | 활성      |
| [0004](./adr/0004-expo-camera-for-permission-api-only.md)           | 카메라 권한 조회·요청에만 `expo-camera`를 쓴다                  | 활성      |
| [0005](./adr/0005-bundled-web-assets-over-localhost-server.md)      | 웹 자산을 앱 번들에 넣고 localhost 서버로 연다                  | 폐기      |
| [0006](./adr/0006-p2p-mesh-stomp-over-livekit.md)                   | 소셜 룸 전송을 LiveKit 대신 P2P 풀메시와 STOMP로 한다           | 활성      |
| [0007](./adr/0007-three-tier-environment-model-and-eas-profiles.md) | production·staging·development 3티어 환경과 EAS 프로필을 맞춘다 | 활성      |
| [0008](./adr/0008-observability-identifier-scrubbing.md)            | 관측 도구로 나가는 사용자 식별자를 fail-closed로 정제한다       | 활성      |

> ADR 0005는 2026-07-31에 모든 화면을 원격 URL 웹뷰로 여는 구조로 바뀌면서 폐기됐다.

## 관련 문서

- 화면별 구현 위치는 [screen-ownership.md](./screen-ownership.md)에 있다.
- 용어 정의는 [domain-glossary.md](./domain-glossary.md)에 있다.
- 웹뷰 문제를 추적하는 순서는 [webview-debugging.md](./runbooks/webview-debugging.md)에 있다.
