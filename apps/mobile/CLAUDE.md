@AGENTS.md

# apps/mobile

Expo RN 앱. **지금은 WebView로 `apps/web`의 스터디룸을 로드한다**(MVP). 네이티브(카메라·온디바이스 Vision AI·LiveKit 영상 송수신) 구현은 한 번 만들었다가 되돌렸고, 코드는 `platform/*`·`features/study-session/NativeStudyRoomScreen.tsx`에 **비활성 상태로 보존**되어 있다. 배경은 루트 [CLAUDE.md](../../CLAUDE.md), [ADR 0001](../../docs/adr/0001-webview-based-study-room-architecture.md)(활성), [ADR 0003](../../docs/adr/0003-phased-rollout-webview-mvp-then-native.md)(왜 되돌렸는지·전환 체크리스트), [ADR 0002](../../docs/adr/0002-native-mobile-study-room-and-independent-web.md)(목표 아키텍처) 순서로 참고.

앱 셸(온보딩/로그인/홈 등) 화면을 Figma 기반으로 구현할 때는 [Codex의 AI-native 모바일 개발 설계 문서](../../docs/superpowers/specs/2026-07-22-ai-native-mobile-development-design.md)의 화면 단위 흐름·보호 파일 목록·컴포넌트 승격 규칙을 따른다(단, 이 문서가 전제하는 `AGENTS.md`/`docs/ai-development/`/`docs/screens/`는 아직 이 저장소에 없다 — 루트 [CLAUDE.md](../../CLAUDE.md)의 관련 섹션 참고).

## 구조

`src/` 없이 라우터(`app/`) + 기능/플랫폼 디렉터리를 루트 바로 아래에 둔다.

- `app/` — `expo-router` 파일 기반 라우팅. `app/(tabs)/`는 탭 네비게이션, **`app/room/[id].tsx`는 `react-native-webview`로 `apps/web`의 `/room/:id`를 로드하는 화면(활성)**.
- `features/study-session/` — `useStudySession` 훅(`study-core` 계산 함수 + `VisionEngine` 결합), `SessionRepository` mock, 그리고 **`NativeStudyRoomScreen.tsx`(비활성 — 어떤 라우트도 렌더링하지 않음, 네이티브 전환용 참고 구현)**.
- `platform/camera/` — 카메라 미리보기·권한 어댑터. **현재 mock**(WebView가 카메라를 다루므로). 네이티브 전환 시 `expo-camera` 등 실제 구현으로 교체.
- `platform/vision/` — `VisionEngine` 인터페이스(온디바이스 추론). 현재 mock 구현.
- `platform/rtc/` — `RoomMediaController` 인터페이스(LiveKit 영상 송수신). 현재 mock 구현.
- `components/ui/` — RN + NativeWind 프리미티브(예: 상태 배지). 지금은 dormant 네이티브 화면에서만 쓰인다.
- `lib/` — 순수 유틸 함수(테스트 대상).

**경계 규칙(dormant 코드에도 적용)**: UI 컴포넌트는 카메라/LiveKit SDK를 직접 import하지 않는다 — 반드시 `platform/*` 어댑터를 통한다. 공부 상태 계산은 `@focuson/study-core`(순수 TS)에 있고, 카메라/Vision/RTC 구현과 분리된다.

## WebView 스터디룸 (활성)

- `app/room/[id].tsx`는 `Constants.expoConfig.extra.webAppUrl`(기본 `http://localhost:5173`) + `/room/${id}`를 `react-native-webview`로 로드한다.
- 카메라/마이크 권한은 `app.json`의 `ios.infoPlist.NSCameraUsageDescription` / `android.permissions`(`CAMERA`)에 있다 — WebView 안의 브라우저 `getUserMedia`도 동일한 네이티브 권한이 필요하다. 마이크 권한은 추가하지 않는다(멀티룸 음성 송출 없음, 방침 변경 없음).
- `react-native-webview`는 **Expo Go에서 바로 동작**한다 — 지금 `apps/mobile`에는 Expo Go와 호환되지 않는 네이티브 모듈이 없으므로 `expo-dev-client`/`eas.json`을 이 시점에 쓸 필요는 없다(재설치 시점은 아래 참고).

## 개인정보 원칙 (변경 불가, WebView·네이티브 어느 쪽이든 동일)

- 카메라 원본 프레임·얼굴 이미지·랜드마크 좌표는 단말 내부에서만 처리. 서버 전송·저장·로그 금지. 서버에는 상태 이벤트(`STUDYING`/`AWAY`/`PAUSED`/`CAMERA_OFF`)와 세션 집계만 전송.
- 싱글룸: 영상 자체가 어디에도 전송되지 않는다.
- 멀티룸: 카메라 영상은 LiveKit으로 전송된다(녹화·저장 안 함). "영상이 서버로 전송되지 않는다"고 쓰지 말 것 — "AI 분석용 원본 프레임·얼굴 데이터가 서버로 전송되지 않는다"로 표현. 싱글/멀티 안내 문구를 동일하게 쓰지 말 것.

## 네이티브 전환 시 (지금은 해당 없음)

`eas.json`(development/preview/production 프로필)은 전환 대비로 남겨뒀다. 실제로 네이티브로 되돌릴 때 할 일은 [ADR 0003의 전환 체크리스트](../../docs/adr/0003-phased-rollout-webview-mvp-then-native.md#전환-체크리스트-실제로-되돌릴-때)를 따른다 — `expo-camera`/`expo-dev-client` 재설치, `platform/*` mock을 실제 구현으로 교체, `eas init`으로 EAS project id 발급 등.

## 명령

```bash
pnpm --filter mobile start      # expo start — Expo Go로 바로 스캔 가능
pnpm --filter mobile lint
pnpm --filter mobile typecheck
pnpm --filter mobile test
```

## 컨벤션

- 스타일은 NativeWind(Tailwind 클래스, `className`)를 우선 사용. `StyleSheet.create`는 NativeWind로 표현하기 어려운 경우에만.
- 새 화면 추가 시 `app/` 디렉터리 구조로 라우팅이 결정되므로, 화면 단위 로직은 해당 라우트 파일 옆에 co-locate 한다. 재사용 로직은 `features/`·`platform/`·`packages/*`로 올린다.
- `platform/*`의 mock 구현을 실제 라이브러리로 바꾸기 전에 반드시 [ADR 0003](../../docs/adr/0003-phased-rollout-webview-mvp-then-native.md)의 전환 트리거/체크리스트를 확인할 것 — 조기 전환하지 않는다.
