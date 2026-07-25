# 0003. 단계적 롤아웃: MVP는 WebView, 네이티브는 로드맵

- Status: Accepted (2026-07-25 일부 갱신 — 아래 갱신 노트 참고)
- Date: 2026-07-22
- Relates to: [ADR 0001](./0001-webview-based-study-room-architecture.md)(MVP 활성), [ADR 0002](./0002-native-mobile-study-room-and-independent-web.md)(목표 아키텍처)

> **갱신 노트 (2026-07-25) — 기능 구현 전면 리셋**: 초기 명세(상상 계약) 기반으로 임시 구현했던
> 기능 코드를 **전부 저장소에서 삭제했다**. 대상: 모바일 dormant 네이티브 자산(`apps/mobile/platform/**`,
> `apps/mobile/features/study-session/**`, `StudyStatusBadge`, `formatDuration`), 모바일 WebView 룸
> 라우트(`apps/mobile/app/room/[id].tsx`), 웹 스터디룸·Vision 구현(`apps/web/src/features/**`,
> `RoomPage.tsx`), 공부시간 계산 코어(`packages/study-core` 전체), 옛 API 계약 타입(`packages/types`의
> `FocusSession`/`FocusEvent`/`StudyRoom`/`Participant`/`SessionStatus`/`StudyMode`).
> 실제 백엔드 Swagger 계약이 확정되고 UI 디자인이 준비되는 대로 재구축한다. 남은 것은 앱 셸,
> 익명 기기 유저 등록(SCRUM-259), 공유 세팅(config·design-tokens·types)이다. 코드는 git 히스토리
> (dev `5e548eb` 시점)에서 언제든 복구 가능하다. 이 ADR의 아키텍처 방침(MVP=WebView, 네이티브=로드맵)과
> 아래 전환 트리거의 방향은 그대로 유효하며, 본문이 언급하는 파일 경로들은 삭제 전 기준이다.

## 배경 (Context)

[ADR 0002](./0002-native-mobile-study-room-and-independent-web.md)로 모바일 스터디룸을 네이티브(카메라·온디바이스 Vision·LiveKit RN)로 구현하는 마이그레이션을 완료했다. 그러나 다음 이유로 MVP 단계에서는 다시 WebView(ADR 0001) 방식으로 가기로 했다.

- 온디바이스 Vision 라이브러리, LiveKit React Native/Expo SDK의 Expo SDK 57 네이티브 호환성이 실기기에서 아직 검증되지 않았다(ADR 0002의 "기술 스파이크 항목") — MVP 일정상 이 리스크를 먼저 지고 갈 수 없다.
- `apps/web`은 이미 브라우저에서 동작하는 실제 구현체이므로, 모바일이 이를 WebView로 로드하면 추가 네이티브 작업 없이 곧바로 MVP를 띄울 수 있다.
- 네이티브 전환에 필요한 경계(도메인 계산, 플랫폼 어댑터 인터페이스)는 이미 만들어져 있으므로 완전히 버리지 않고 보존하면 나중 전환 비용이 낮다.

## 결정 (Decision)

**MVP는 ADR 0001(WebView 임베드)을 활성 아키텍처로 채택한다. ADR 0002에서 만든 네이티브 자산은 삭제하지 않고 비활성(dormant) 상태로 보존해 전환 시점에 재사용한다.**

### 되돌린 것 (활성 경로에서 제거)

- `apps/mobile/app/room/[id].tsx` — 네이티브 룸 화면 대신 다시 `react-native-webview`로 `apps/web`의 `/room/:id`를 로드.
- `apps/mobile/package.json`의 `expo-camera`, `expo-dev-client` 제거 — 지금은 실제로 쓰는 네이티브 모듈이 없으므로 Dev Client 자체가 불필요해졌고, MVP 개발자는 Expo Go로 바로 개발할 수 있다. `react-native-webview`는 Expo Go 호환이라 문제 없다.
- `apps/mobile/app.json` — `expo-camera` config plugin 제거, `extra.webAppUrl` 복원. 카메라/마이크 권한 문구는 유지(WebView 안의 `getUserMedia`도 동일한 iOS/Android 권한이 필요하다).
- `apps/mobile/platform/camera/*` — 실제 `expo-camera` 구현에서 `platform/vision`, `platform/rtc`와 같은 수준의 **인터페이스+mock**으로 되돌림(expo-camera 없이도 typecheck/lint/test가 통과하도록).

### 보존한 것 (비활성 상태로 유지, 삭제하지 않음)

- `packages/study-core` — 순수 계산 로직(총공부시간/순공시간/집중률, 타임라인 병합 등). **오히려 지금 `apps/web`의 `RoomPage`에 실제로 연결해서 활성 사용한다** — WebView가 로드하는 화면이 곧 웹 구현체이므로, MVP에서도 이 계산 로직이 그대로 쓰인다.
- `packages/design-tokens` — 의미 기반 디자인 토큰. 아직 실제 컴포넌트에 배선되지 않았지만 유지.
- `apps/mobile/platform/{vision,rtc}` — `VisionEngine`/`RoomMediaController` 인터페이스 + mock 구현. 그대로 유지.
- `apps/mobile/features/study-session/*` — `useStudySession` 훅, `SessionRepository` 인터페이스+mock, 그리고 예전 `app/room/[id].tsx`에 있던 네이티브 룸 화면을 **`NativeStudyRoomScreen.tsx`(비-라우트 컴포넌트)로 옮겨 보존**했다. `useLocalSearchParams` 대신 `{ id, mode }` props를 받도록 바꿔서 라우트 컨텍스트 없이도 재사용할 수 있게 했다.
- `apps/mobile/components/ui/StudyStatusBadge.tsx`, `apps/mobile/eas.json` — 그대로 유지.

## 고려한 대안

- **대안 A — ADR 0002 네이티브 자산을 완전히 삭제하고 순수 ADR 0001로 되돌리기**: MVP 단순성은 최대화되지만, 이미 검증한 도메인 계산 로직(`study-core`)까지 버리는 건 낭비이고 전환 시 처음부터 다시 설계해야 한다. 채택하지 않음.
- **대안 B — 네이티브와 WebView를 런타임에 플래그로 전환 가능하게 만들기**(예: 기능 플래그로 `app/room/[id].tsx`가 두 구현 중 하나를 선택): 유연하지만 지금 시점에 두 구현을 동시에 유지·테스트하는 비용이 MVP 단계에 비해 과함(과도한 엔지니어링). 전환 시점이 명확해지면 그때 검토.
- **대안 C — 보존은 하되 완전히 비활성화(코드 경로에서 라우트 제외, 필요한 의존성만 최소화)(채택)**: 지금 채택한 방식. `NativeStudyRoomScreen.tsx`를 비-라우트 파일로 옮기고 `platform/camera`를 mock으로 되돌려 실제 네이티브 의존성 없이도 코드/테스트가 살아있게 했다.

## 네이티브 전환 트리거 (미확정 — 추후 구체화 필요)

다음 중 하나 이상이 충족되면 네이티브 전환을 재검토한다. **현재는 구체적인 임계값/일정이 정해지지 않았다 — 프로덕트 오너가 확정해야 한다.**

- WebView 기반 Vision AI/화면 공유의 실사용 성능(프레임 처리 지연, 배터리 소모, 저사양 기기 이탈률)이 목표치를 벗어남이 실측으로 확인된 경우.
- 온디바이스 Vision 라이브러리 또는 LiveKit RN/Expo SDK의 Expo SDK 호환성이 검증되어 네이티브 구현 리스크가 충분히 낮아진 경우.
- 특정 사용자 지표(DAU, 리텐션, 크래시/이탈 원인 분석 등)가 네이티브 전환을 정당화하는 경우.

## 전환 체크리스트 (실제로 되돌릴 때)

1. `apps/mobile/app/room/[id].tsx`를 WebView 버전에서 `features/study-session/NativeStudyRoomScreen.tsx`를 라우트로 감싸는 형태로 교체(또는 그 내용을 `app/room/[id].tsx`로 다시 이동).
2. `platform/camera`를 mock에서 실제 구현(`expo-camera` 재설치 등)으로 교체.
3. `expo-dev-client` 재설치, `eas.json`의 development 프로필로 Dev Build 생성(`eas init` 먼저 필요).
4. `platform/vision`, `platform/rtc`의 mock을 실제 온디바이스 Vision/LiveKit RN 어댑터로 교체(ADR 0002의 "기술 스파이크 항목" 순서를 따른다).
5. `apps/mobile/app.json`에 카메라 권한 유지 확인, `expo-camera` config plugin 재추가, `extra.webAppUrl` 제거(더 이상 WebView를 안 쓰면).
6. ADR 0001 Status를 다시 Superseded로, ADR 0002 Status를 Accepted(활성)로 되돌리고 새 ADR로 기록.

## 단점과 비용

- 하루 사이에 아키텍처를 두 번 바꾼 이력이 남는다 — ADR 체계로 명확히 문서화해 혼란을 줄인다(이 ADR이 그 목적).
- `apps/mobile`에 비활성 네이티브 코드(`platform/*`, `features/study-session/NativeStudyRoomScreen.tsx`)가 남아 있어 저장소를 처음 보는 사람이 "왜 안 쓰이는 코드가 있지?"라고 혼동할 수 있다 — 각 파일/디렉터리에 "MVP 동안 비활성" 주석과 이 ADR 링크를 남겨 완화한다.
- `study-core`는 웹에서 실제로 쓰이기 시작했지만 모바일 네이티브 화면(dormant)에서도 여전히 참조되므로, 두 플랫폼의 계산 결과가 계속 동일하게 유지되는지 회귀 테스트가 필요하다(현재는 `packages/study-core`의 단위 테스트가 이를 담당).
