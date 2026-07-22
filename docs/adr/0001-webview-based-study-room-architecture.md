# 0001. 스터디룸(WebRTC + Vision AI)을 웹앱으로 구현하고 RN에 WebView로 임베드한다

- Status: **Accepted (MVP 활성 아키텍처)**
- Date: 2026-07-21 (2026-07-22 재채택)

> **이 결정은 현재 MVP의 활성 아키텍처입니다.** 한때 [ADR 0002](./0002-native-mobile-study-room-and-independent-web.md)로 대체(Superseded)됐었지만, MVP 단계에서는 개발 속도와 실기기 검증 리스크를 이유로 다시 이 방식(WebView 임베드)으로 되돌렸습니다.
> 왜 되돌렸는지, ADR 0002에서 만든 네이티브 자산을 어떻게 보존하는지는 [ADR 0003](./0003-phased-rollout-webview-mvp-then-native.md)을 참고하세요. ADR 0002는 폐기된 게 아니라 **향후 네이티브 전환 시의 목표 아키텍처**로 남아 있습니다.

## Context

FocusOn은 AI Vision 기반 순공 시간 측정 캠스터디 서비스로, 싱글 모드(개인 집중도 감지)와 멀티 모드(그룹 스터디룸, 참가자 간 화상)를 모두 지원해야 한다. 이를 위해서는:

1. **Vision AI**: 각 참가자의 카메라 프레임에서 실시간으로 집중/이석 상태를 감지해야 한다.
2. **WebRTC**: 멀티 모드에서 참가자 간 화상/음성을 실시간으로 주고받아야 한다.

React Native 앱에서 이 둘을 동시에 지원하는 방법은 크게 두 가지다.

**옵션 A — 완전 네이티브**: `react-native-webrtc` + 네이티브 카메라 프레임 프로세서(VisionCamera + on-device ML)로 iOS/Android 각각 구현.
**옵션 B — 웹 임베드**: 스터디룸 화면을 별도 웹 앱(`apps/web`)으로 구현하고, RN 앱에서는 `react-native-webview`로 이를 로드.

## Decision

**옵션 B(웹 임베드)를 채택**한다.

- WebRTC는 **LiveKit**(오픈소스 SFU, 성숙한 React 웹 SDK)을 사용한다.
- Vision AI는 **MediaPipe Tasks Vision**(WASM/WebGL 기반 Face Landmarker)을 브라우저/WebView에서 직접 실행한다.
- `apps/mobile`(Expo)은 인증, 네비게이션, 푸시 알림 등 앱 셸 역할만 담당하고, 스터디룸 화면(`/room/:id`)은 `react-native-webview`로 `apps/web`의 동일 라우트를 로드한다.
- `apps/web`은 그 자체로 독립된 브라우저 서비스로도 배포 가능하다.

## Consequences

**장점**

- WebRTC + Vision AI 로직을 한 코드베이스(웹)에만 구현 — iOS/Android 네이티브 모듈 이중 구현 비용을 피함.
- 웹 브라우저용 서비스를 별도 작업 없이 함께 확보.
- MediaPipe/LiveKit 웹 SDK가 네이티브 RN SDK보다 성숙하고 문서가 풍부함.

**단점 / 트레이드오프**

- WebView 안에서 카메라/마이크 권한을 iOS(Info.plist)·Android(Manifest)·WebView 설정(`mediaCapturePermissionGrantType`, `allowsInlineMediaPlayback`) 세 군데에서 맞춰야 함.
- WebView 내부 성능(특히 저사양 기기의 MediaPipe 추론 속도)이 완전 네이티브보다 낮을 수 있음 — 후속 프로파일링 필요.
- 딥링크/네이티브 뒤로가기 제스처 등 RN 네비게이션과 WebView 내부 라우팅을 조율해야 함.

**되돌리기 지점**
싱글 모드의 Vision AI 감지만 성능 문제로 네이티브로 옮기고 싶다면, `apps/mobile`에 네이티브 카메라 모듈을 추가하고 `apps/web`은 멀티 모드(WebRTC)에만 쓰이도록 국소적으로 전환 가능 — 두 앱이 분리되어 있으므로 이 전환이 저비용이다.
