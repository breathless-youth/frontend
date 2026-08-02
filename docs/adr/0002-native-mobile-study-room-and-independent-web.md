# 0002. 모바일 스터디룸을 네이티브 RN으로 구현하고 웹은 독립 브라우저 구현체로 유지한다

- Status: **Accepted — 목표(향후) 아키텍처. MVP에는 미채택.**
- Date: 2026-07-22
- Supersedes: [ADR 0001](./0001-webview-based-study-room-architecture.md) _(2026-07-22 하루 만에 다시 역전됨 — 아래 참고)_

> **MVP 갱신 (2026-07-22):** 이 ADR의 방향은 여전히 유효한 **목표 아키텍처**지만, MVP는 다시
> [ADR 0001](./0001-webview-based-study-room-architecture.md)(WebView)로 되돌아갔습니다. 이 ADR에서 만든
> `packages/study-core`, `packages/design-tokens`, `apps/mobile/platform/*` 인터페이스·mock,
> `apps/mobile/features/study-session/*`는 삭제되지 않고 **비활성(dormant) 상태로 보존**되어 전환
> 시점에 재사용됩니다. 왜 되돌렸는지와 전환 체크리스트는 [ADR 0003](./0003-phased-rollout-webview-mvp-then-native.md)을 참고하세요.

> **⚠️ 용어·패키지 정정 (2026-07-26):** 아래 본문은 2026-07-22 시점의 기록이라 **이후 무효가 된
> 이름을 그대로 담고 있습니다**(결정 이력이므로 본문은 고치지 않고 여기에 정정만 남깁니다).
>
> - 본문의 상태 이름 `STUDYING`/`AWAY`/`PAUSED`/`CAMERA_OFF`는 폐기됐습니다. 실제 서버 계약은
>   `StudyEventStatus` = `PHONE`/`DEVICE`/`AWAY`/`PAUSE`이고, 사용자에게 보이는 상태는
>   집중·비집중·일시정지 3색 체계입니다. `CAMERA_OFF`는 SCRUM-147 시점에 폐기됐고, 화면 꺼짐은
>   2026-07-26에 일시정지로 통합됐습니다. → [docs/domain-glossary.md](../domain-glossary.md)
> - 위 "dormant 보존" 서술도 더 이상 사실이 아닙니다 — `packages/study-core`,
>   `apps/mobile/platform/*`, `apps/mobile/features/study-session/*`는 **2026-07-25 기능 리셋 때
>   실제로 삭제**됐습니다(git 히스토리에서만 복구 가능). 보존된 것은 `packages/design-tokens`뿐입니다.

## 배경 (Context)

FocusOn은 AI Vision으로 사용자의 공부 상태를 **단말 내부에서** 분석하는 캠스터디 서비스다.
핵심 지표는 총 공부시간(세션 시작~종료 전체 경과 시간), 순공시간(FOCUS 판정 구간만 누적),
집중률(순공시간/총공부시간)이며, 싱글 스터디룸(혼자 집중도 측정)과 멀티 종일룸(여러 참가자가
LiveKit으로 화면을 공유하며 함께 공부)을 지원한다.

ADR 0001은 스터디룸(WebRTC + Vision AI)을 `apps/web`에 한 번만 구현하고 `apps/mobile`은
`react-native-webview`로 그 웹 라우트를 로드하는 "웹 임베드" 방식을 채택했다. 그러나 실제
제품 요구사항을 정리하면서 이 방식이 모바일 핵심 경험을 제약한다는 점이 분명해졌다.

## 결정 (Decision)

**모바일 스터디룸을 네이티브 React Native로 구현하고, `apps/web`은 독립 브라우저 구현체로
유지한다.** 모바일이 웹을 WebView로 로드하는 관계는 제거한다.

- `apps/mobile`은 카메라 미리보기, 온디바이스 Vision AI, 총공부시간·순공시간 집계, 싱글 세션,
  멀티 종일룸(LiveKit 영상 송수신), 카메라 전/후면 전환·ON/OFF, 일시정지·종료, 참여자 상태
  표시, 신고 흐름을 **네이티브로 직접** 구현할 수 있는 구조로 바꾼다. `app/room/[id].tsx`는 더 이상
  WebView를 렌더링하지 않고 네이티브 스터디룸을 렌더링한다.
- `apps/web`은 제거하지 않는다. 브라우저용 싱글 세션/멀티 종일룸, 브라우저 MediaPipe,
  LiveKit Web SDK, 서비스 소개 페이지, 독립 배포 역할을 유지한다.
- 모바일/웹은 **동일한 도메인 규칙·타입을 공유**하되(카메라·Vision AI·WebRTC의 구체 구현체는
  플랫폼별로 분리), 공유 계산 로직은 순수 TS 패키지 `@focusmakers/study-core`로 올린다.
- 핵심 스터디룸에는 WebView를 쓰지 않는다. 비핵심 화면(개인정보처리방침/이용약관/외부문의/
  공지사항)에서만 필요 시 WebView를 사용할 수 있다. 현재 그런 사용처가 없어
  `react-native-webview` 의존성과 WebView 전용 설정은 완전히 제거한다.

## 고려한 대안 (Alternatives Considered)

- **대안 A — 웹 임베드 유지(ADR 0001)**: 스터디룸을 웹에만 구현하고 모바일은 WebView로 로드.
- **대안 B — 네이티브 모바일 구현(채택)**: 모바일이 카메라·Vision·RTC를 네이티브로 직접 구현하고,
  웹은 독립 구현체로 병존.

## WebView 방식(대안 A)의 장점

- WebRTC + Vision AI 로직을 웹 한 코드베이스에만 구현 — iOS/Android 네이티브 이중 구현 비용 회피.
- 웹 브라우저용 서비스를 별도 작업 없이 함께 확보.
- MediaPipe/LiveKit **웹** SDK가 문서·성숙도 면에서 앞서 있음.

## WebView 방식(대안 A)의 위험

- WebView 내부 성능(특히 저사양 기기의 온디바이스 추론)이 네이티브보다 낮을 수 있고, 카메라
  프레임 처리 지연이 집중률 정확도에 직접 영향을 준다.
- 카메라/권한을 iOS(Info.plist)·Android(Manifest)·WebView 설정 세 군데에서 맞춰야 하고,
  앱 생명주기(백그라운드 전환, 전화 수신, 화면 잠금)와 WebView 내부 상태를 조율하기 어렵다.
- 딥링크·네이티브 뒤로가기·푸시와 WebView 내부 라우팅의 조율 비용.
- 온디바이스 개인정보 원칙(프레임을 단말 밖으로 보내지 않음)을 네이티브 계층에서 통제하기 어렵고,
  WebView 경계가 데이터 흐름 감사를 복잡하게 만든다.

## 네이티브 모바일 방식(대안 B)을 선택한 이유

- 카메라 파이프라인과 Vision 추론을 네이티브에서 직접 제어해 성능·지연·배터리를 최적화할 수 있다.
- 앱 생명주기(활성/백그라운드/화면잠금/전화수신/네트워크 변경)와 세션 상태를 정확히 연동할 수 있다.
- 온디바이스 개인정보 원칙을 플랫폼 계층에서 명확히 강제할 수 있다(프레임이 앱 프로세스 밖으로
  나가지 않음을 코드 경계로 보장).
- 멀티룸 LiveKit 영상 송출과 Vision AI 분석을 **서로 독립된 경로**로 분리하기 쉽다.

## 온디바이스 Vision AI 정의

Vision AI 추론(얼굴/자세 기반 집중 판정)은 **단말 내부에서만** 수행한다. 카메라 원본 프레임,
얼굴 이미지, 랜드마크 좌표는 서버로 전송하지 않고 파일/캐시/DB에도 저장하지 않으며 로그·분석
도구에도 남기지 않는다. 서버로 나가는 것은 공부 상태 이벤트(`STUDYING`/`AWAY`/`PAUSED`/
`CAMERA_OFF`)와 세션 집계 결과(총공부시간/순공시간/집중률)뿐이다.

## 싱글룸·멀티룸의 개인정보 차이

- **싱글 공부 세션**: 카메라 원본 프레임은 단말 내부에서만 처리한다. 서버 전송·저장 금지.
  서버에는 공부 상태 이벤트와 세션 집계 결과만 전송한다. (영상 자체가 어디에도 전송되지 않음)
- **멀티 종일룸**: 카메라 영상은 실시간 참여자 화면 공유를 위해 **LiveKit으로 전송된다**(녹화·영구
  저장은 하지 않음). Vision AI 분석은 영상 송출과 **별도로** 단말 내부에서 수행하며, AI 분석용 원본
  프레임·얼굴 이미지·랜드마크 좌표는 서버로 전송하지 않는다. 서버에는 상태 이벤트만 전송한다.

> **문구 주의**: 싱글룸과 멀티룸의 개인정보 안내 문구를 동일하게 쓰지 말 것. 멀티룸에서 "영상이
> 서버로 전송되지 않는다"고 쓰면 안 된다 — 멀티룸에서는 영상 자체가 LiveKit으로 전송되기 때문이다.
> 멀티룸에서는 "**AI 분석용 원본 프레임·얼굴 데이터**가 서버로 전송되지 않는다"로 정확히 표현한다.

## `packages/types` ↔ `packages/study-core` 경계 결정 (가정)

이 항목은 이후 실제 구현하면서 재검토될 수 있는 **임시 결정**이다.

- `@focusmakers/study-core`(순수 TS, 외부 런타임 의존성 없음)가 `StudyStatus`, 타임라인 이벤트 타입
  `FocusTimelineEvent`, `StudySessionSummary`와 모든 계산 함수(총공부시간/순공시간/집중률,
  세션 상태 전환, 타임라인 병합·정규화)를 **소유**한다.
- `@focusmakers/types`의 기존 `FocusEvent`(`sessionId`/`type`/`timestamp`/`confidence`)는 "서버로
  전송되는 이벤트 레코드(API 계약)"이고, study-core의 `FocusTimelineEvent`는 "클라이언트 내부에서
  시간 계산에 쓰는 순수 이벤트(상태+시각만)"라서 개념이 다르다. 이름 충돌·의미 혼동을 피하려고
  study-core 쪽을 `FocusTimelineEvent`로 명명하고, 기존 `FocusEvent`는 그대로 두되 용도를 JSDoc으로
  명시한다.
- 기존 `SessionStatus`(`"active"|"paused"|"ended"` — 세션 전체 생명주기)와 새 `StudyStatus`
  (`"STUDYING"|"AWAY"|"PAUSED"|"CAMERA_OFF"` — 순간 비전 상태)는 서로 다른 축이므로 합치지 않고
  각자 유지한다.
- `@focusmakers/types`는 `@focusmakers/study-core`를 workspace 의존성으로 두고 `StudyStatus`/
  `StudySessionSummary`를 재노출해, 기존처럼 `@focusmakers/types`에서 한 번에 import할 수 있게 한다
  (하위 호환).

## 단점과 비용 (Consequences / Costs)

- iOS/Android 네이티브 카메라·Vision·RTC 파이프라인을 각각 검증·유지해야 한다.
- 온디바이스 Vision 라이브러리와 LiveKit RN SDK의 Expo SDK 57 네이티브 호환성을 실제 기기에서
  검증해야 한다(기술 스파이크 필요, 아래 참고).
- Development Build가 필요하다 — Expo Go만으로는 네이티브 카메라/RTC 모듈을 실행할 수 없다.
- 웹/모바일 두 구현체가 병존하므로 도메인 규칙 변경 시 양쪽 UI를 함께 갱신해야 한다(단, 계산
  로직은 `@focusmakers/study-core`로 공유되어 중복을 줄인다).

## 기술 스파이크 항목 (실제 기기에서 별도 진행)

이번 라운드는 인터페이스·mock·경계까지만 만든다. 다음은 실제 기기에서 검증해야 하는 항목이다.

- 온디바이스 Vision 추론 라이브러리 선정 및 Expo SDK 57 네이티브 호환성 검증(프레임 프로세서,
  추론 지연, 배터리). → `VisionEngine` 인터페이스의 실제 구현.
- LiveKit React Native/Expo 어댑터의 Expo SDK 57 네이티브 호환성 검증(영상 송수신, 카메라 전환,
  ON/OFF, 재연결). → `RoomMediaController` 인터페이스의 실제 구현. **추측 설치 금지**.
- `expo-camera` 실제 기기 미리보기·권한 흐름 검증.
- 토큰 발급 서버(LiveKit) 연동 — 공개 토큰 하드코딩·개발용 고정 토큰 커밋 금지.

## 네이티브 구현 실패 시 대안 (Fallback)

특정 네이티브 라이브러리(예: LiveKit RN SDK, 온디바이스 Vision 라이브러리)가 Expo SDK 57에서
검증에 실패하면, **해당 기능에 한해** WebView로 국소 폴백할 수 있다(비핵심 화면에 한정한 WebView
허용 범위를 핵심 기능으로 임시 확장). 이때도 `VisionEngine`/`RoomMediaController` 인터페이스
경계는 유지하므로, UI를 건드리지 않고 어댑터 구현만 교체하면 된다. 이 폴백은 임시 조치이며 새
ADR로 기록한다.
