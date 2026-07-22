# 화면 소유권 (Screen Ownership)

앱 셸(온보딩/로그인/홈/기록/설정 등)은 `apps/mobile`에서 네이티브로 구현한다. **스터디룸 관련
화면(SCR-005~011)은 지금 MVP 동안 `apps/web`이 실제 구현체이고, 모바일은 WebView로 그 화면을
그대로 로드한다**(ADR 0001). 네이티브 버전은 `apps/mobile/features/study-session/NativeStudyRoomScreen.tsx`에
참고 구현으로 남아 있지만 비활성이다(ADR 0003). 아래 목록은 소유권과 범위를 문서화한 것이며,
대부분의 앱 셸 화면 실제 구현은 이번 라운드 범위 밖이다.

> 상태 범례: **[W]** WebView(`apps/web`)로 활성 구현 · **[P]** 네이티브 dormant 참고 구현 존재(비활성) · **[ ]** 문서상 소유권만 지정(미구현)

## `apps/mobile` 소유 화면 (앱 셸)

| ID      | 화면                      | 상태 | 비고                          |
| ------- | ------------------------- | :--: | ----------------------------- |
| SCR-001 | 스플래시 / 초기 진입      | [ ]  |                               |
| SCR-002 | 로그인(Google/Apple만)    | [ ]  | 다른 로그인 수단 추가 금지    |
| SCR-003 | 온보딩 / 카메라 권한 안내 | [ ]  |                               |
| SCR-004 | 홈(대시보드)              | [P]  | `app/(tabs)/index.tsx`        |
| SCR-012 | 공부 기록 목록            | [ ]  |                               |
| SCR-013 | 통계(일간/주간/월간)      | [ ]  |                               |
| SCR-014 | 랭킹(일간/주간/월간)      | [ ]  |                               |
| SCR-015 | 프로필                    | [ ]  |                               |
| SCR-016 | 설정                      | [ ]  |                               |
| SCR-017 | 알림 / 공지사항           | [ ]  | 비핵심 — 필요 시 WebView 허용 |
| SCR-018 | 개인정보처리방침          | [ ]  | 비핵심 — 필요 시 WebView 허용 |
| SCR-019 | 이용약관                  | [ ]  | 비핵심 — 필요 시 WebView 허용 |
| SCR-020 | 외부 문의                 | [ ]  | 비핵심 — 필요 시 WebView 허용 |

## 스터디룸 화면 — 지금은 `apps/web`이 실제 구현체, 모바일은 WebView로 로드

| ID      | 화면                        |  상태   | 비고                                                                                                  |
| ------- | --------------------------- | :-----: | ----------------------------------------------------------------------------------------------------- |
| SCR-005 | 촬영 가이드 / 카메라 프리뷰 | [W]/[P] | `apps/web` `RoomPage`(활성) · dormant: `platform/camera`(mock)                                        |
| SCR-006 | 싱글 공부 세션              | [W]/[P] | `apps/web` `RoomPage`(활성, `useWebStudySession`) · dormant: `NativeStudyRoomScreen`(single)          |
| SCR-007 | 멀티 종일룸(참여자 그리드)  | [ ]/[P] | web도 아직 LiveKit 연결 전 placeholder · dormant: `NativeStudyRoomScreen`(multi), `platform/rtc` mock |
| SCR-008 | 세션 일시정지 / 종료        | [ ]/[P] | web `RoomPage`엔 아직 컨트롤 없음 · dormant: `NativeStudyRoomScreen` 내 컨트롤                        |
| SCR-009 | 세션 결과 요약(집중률)      |   [W]   | `apps/web` `RoomPage`가 `study-core`의 `StudySessionSummary`로 총공부시간/순공시간/집중률 표시        |
| SCR-010 | 참여자 상태 표시            | [ ]/[P] | dormant: `NativeStudyRoomScreen` 내 `StudyStatusBadge`                                                |
| SCR-011 | 신고 흐름                   | [ ]/[P] | dormant: `NativeStudyRoomScreen` 내 버튼(동작 없음)                                                   |

`[W]/[P]` 표기는 "지금 활성 구현(WebView가 로드하는 web 화면)은 [W] 상태, 예전에 만든 네이티브
dormant 참고 구현은 [P] 상태"라는 뜻이다. 왜 이렇게 나뉘는지는 [ADR 0003](./adr/0003-phased-rollout-webview-mvp-then-native.md) 참고.

WebView는 지금 SCR-005~~011(핵심 스터디룸)에도 쓰인다 — MVP 동안의 임시 방침이며,
[ADR 0003](./adr/0003-phased-rollout-webview-mvp-then-native.md)의 트리거 조건이 충족되면 네이티브로
되돌아간다. 그 외 SCR-017~~020 같은 비핵심 화면은 원래부터 WebView 사용이 허용되던 영역이다.

## `apps/web` 소유 화면

`apps/web`은 `HomePage`(소개)와 `RoomPage`(스터디룸 — 지금은 MVP의 실제 구현체이자 모바일
WebView가 로드하는 화면)를 제공한다. 독립 브라우저 서비스로도 그대로 접근 가능하다.

배경은 [ADR 0001](./adr/0001-webview-based-study-room-architecture.md), [ADR 0003](./adr/0003-phased-rollout-webview-mvp-then-native.md) 참고.
