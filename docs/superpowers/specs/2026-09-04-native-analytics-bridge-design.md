# BY-616 네이티브 사용자 이벤트 → 웹 Amplitude 브리지(`track-event`) 설계

- 대상: `apps/mobile`, `apps/web`, `packages/types`
- 관련 티켓: BY-616 (브랜치 `feature/BY-616-native-analytics-bridge`, PR #124 — #97(BY-472) 위에 쌓음)
- 작성일: 2026-09-04

## 배경

하단 탭 터치, "집중 시작" 뒤 카메라 권한 게이트의 분기(허용/거부/기거부/조회 실패), 권한 거부 안내(S2-3) 안에서의 행동, 권장 업데이트 알림창 응답, 알림 탭·초대 딥링크로 앱을 연 사실, 웹뷰 로드 실패와 재시도는 전부 웹뷰 밖에서 일어난다. 분석 SDK(Amplitude)는 웹에만 있어 이 이벤트들은 지금 어디에도 찍히지 않는다(2026-08-29 계측 카탈로그가 "브리지 2건: session-gate-result·tab-focused"를 최우선으로 꼽았던 구간).

네이티브 Amplitude SDK를 들이면 앱의 device_id가 웹뷰 SDK와 갈라져 신원 통합 설계가 따로 필요하고, `minIdLength: 1`을 복제해야 하며, Firebase Analytics 미링크 결정(개인정보 라벨)과 같은 종류의 검토가 다시 필요하다. 그래서 SDK 없이 **네이티브가 관측하고 웹이 전송**하는 구도로 간다 — `set-tab-bar`(웹이 알고 네이티브가 실행)의 역방향이다.

## 계약(`packages/types/src/bridge.ts`)

- 네이티브 → 웹 `track-event` — `{ name, properties?, atMs }`. `name`은 snake_case(`^[a-z][a-z0-9_]{0,63}$`), `properties`는 원시값(`string | number | boolean | null`)만.
- 웹 → 네이티브 `analytics-ready` — 웹이 `track-event` 구독을 걸었다는 신호. 문서 로드마다 한 번.
- 이벤트 카탈로그(이름·속성 타입)는 발신자인 `apps/mobile/lib/nativeAnalytics.ts`의 `NativeAnalyticsEventMap`이 단독 소유한다. 웹은 이름을 화이트리스트하지 않는다 — 앱이 앞서가며 새 이벤트를 보내도 막히지 않아야 한다(원격 웹은 구버전·신버전 앱에 동시에 배포된다).

## 네이티브(`apps/mobile`)

### `lib/nativeAnalytics.ts` — 큐 + 단일 sink

- `trackNativeEvent(name, properties?)`: 활성 sink가 있으면 즉시 전달, 없으면 큐(최대 100건, 오래된 것부터 폐기). 발생 시각 `atMs`를 이벤트에 싣는다.
- `attachNativeAnalyticsSink(sink)`: 붙는 즉시 큐를 순서대로 넘기고, 이후 이벤트를 바로 받는다. 마지막에 붙은 sink가 활성이고, 그것이 떨어지면 먼저 붙은 sink로 돌아간다. 한 번 넘긴 이벤트는 다시 넘기지 않는다(이중 집계 방지).
- 발신부가 React 트리 밖 순수 함수(권한 게이트·알림창·푸시 배선)라 `tabBarVisibility`·`tabReset`과 같은 모듈 스코프 통로다.

### `components/RemoteWebViewHost.tsx` — sink는 "포커스된 화면 + 준비된 문서"

- 탭 4개 웹뷰가 동시에 마운트돼 있어 아무 웹뷰에나 주입하면 한 터치가 N번 찍힌다. 새 prop `focused`(기본 true)와 `analytics-ready` 수신 상태가 모두 참일 때만 sink로 붙는다. `RemoteScreen`이 `focused={!suppressTabBarMessages}`로 탭 포커스를 내려 주고, 세션 화면은 생략해 항상 활성이다.
- 준비 상태는 재시도(`retry`)·사망 복구 진입(`enterRecovery`)에서 되돌린다. **`onLoadEnd`에서는 되돌리지 않는다** — Android는 실패한 로드에도 finish를 합성하고, 새 문서의 신호가 onLoadEnd보다 먼저 올 수 있다.
- 주입은 `injectMessageScript({ type: "track-event", ...event })`. 전역이 없는 문서(파괴 중)에서는 스크립트가 조용히 건너뛴다 — 그 구간의 유실은 감수한다.

### 발신 지점(카탈로그)

| 이벤트                                                                                      | 속성                                                                                        | 발신                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app_backgrounded` / `app_foregrounded`                                                     | `foregrounded.background_sec`                                                               | `lib/appStateAnalytics.ts` ← `app/_layout.tsx` AppState 감시. iOS `inactive`와 앱 시작 직후 첫 active는 세지 않음. #97의 `app-state` 릴레이(발신자 없음·웹뷰 수만큼 중복)를 대체 |
| `tab_pressed`                                                                               | `tab`, `from_tab` (`home/social/record/settings`)                                           | `components/TabBar.tsx` (활성 탭은 비활성화라 재터치 없음)                                                                                                                       |
| `camera_permission_gate_resolved`                                                           | `result` (`granted/denied/already_denied/error`), `prompted`, `room_type` (`single/social`) | `lib/cameraPermissionGate.ts` — `nativeBridgeHandler`가 start-session은 single, request-camera-gate는 social로 호출                                                              |
| `permission_denied_viewed` / `permission_denied_settings_opened` / `permission_denied_left` | `left.reason` (`back_home/permission_granted/back`)                                         | `app/permission-denied.tsx` — 이탈은 `beforeRemove`에서 한 번(버튼·자동 복귀·하드웨어 백·스와이프 백 모두)                                                                       |
| `recommended_update_prompted` / `recommended_update_answered`                               | `latest_version`, `answered.action` (`update/later/dismissed`)                              | `lib/recommendedUpdateAlert.ts`                                                                                                                                                  |
| `push_notification_opened`                                                                  | `route` (쿼리 제거 — 초대코드 값 금지)                                                      | `lib/pushBootstrap.ts`                                                                                                                                                           |
| `invite_deep_link_opened`                                                                   | `has_code`                                                                                  | `app/social/join.tsx` (유니버설 링크·App Links·스킴·Install Referrer·알림 모두 합류)                                                                                             |
| `webview_load_failed` / `webview_retry_pressed`                                             | `path`, `failed.reason` (`config/error/http`)                                               | `components/RemoteWebViewHost.tsx` — 그 웹뷰로는 못 나가고 큐에서 다른 탭·재시도 성공 뒤 흘러감                                                                                  |

## 웹(`apps/web`) — 브리지 수신

- `lib/bridge.ts` `parseToWebMessage`: `track-event`를 형식 검증한다(이름 형식 위반은 통째로 버림, 객체·배열 값과 형식 밖 키는 그 항목만 제거).
- `lib/nativeAnalytics.ts` `useNativeAnalyticsRelay`: `App`에서 한 번 마운트. **구독을 건 뒤** `analytics-ready`를 보낸다 — 네이티브가 신호를 받자마자 큐를 비우므로 순서가 바뀌면 유실.
- `lib/amplitude.ts` `trackNativeShellEvent`: `track(name, { ...properties, source: "native" }, { time: atMs })`. `time`은 발생 시각이라 큐를 거쳐 늦게 와도 타임라인이 맞다. 세션 귀속은 SDK가 전송 시각(`Date.now()`)으로 판단하므로 옛 시각이 세션을 새로 열지 않는다.

## 웹(`apps/web`) — 세션·소셜·홈·설정·복구 이벤트 (확장, 사용자 요청 2026-09-05)

룸 안의 행동은 웹이 안다 — 브리지가 아니라 웹이 직접 찍는다. `room_type`은 #97(BY-472)이 `useStudyRoomSession`에 넣은 값을 그대로 쓴다(`single`/`social`). 함수는 전부 `lib/amplitude.ts` 끝의 "BY-616 확장" 절.

| 이벤트                                                           | 속성                                                                | 발신                                                                                                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `study_session_paused`                                           | `trigger` (`MANUAL/BACKGROUND`), `room_type`                        | `useStudyRoomSession.pause` — 실제로 정지 상태가 됐을 때만(이미 정지 중이면 없음)                                                     |
| `study_session_resumed`                                          | `pause_sec`, `trigger`, `room_type`                                 | `useStudyRoomSession.resume` — 정지 중이었을 때만                                                                                     |
| `study_session_distracted`                                       | `status` (`AWAY/PHONE/DEVICE`), `duration_sec`, `room_type`         | `applyState`에서 비집중 구간이 **닫힐 때** 한 건. 세션 종료로 닫히는 마지막 구간은 제외(`study_session_ended.distraction_sec`가 가짐) |
| `camera_flipped`                                                 | `ok`, `facing`, `reason` (`camera-off/no-alternative`), `room_type` | `useStudyRoomSession.flipCamera`                                                                                                      |
| `study_session_exit_requested` / `study_session_exit_cancelled`  | `room_type`                                                         | `RoomPage`(single)·`LiveRoomSession`(social)의 S3-7 다이얼로그 열기/계속하기                                                          |
| `social_room_camera_toggled` / `social_room_camera_on_dismissed` | `toggled.on`                                                        | `LiveRoomSession` 컨트롤 바 끄기(즉시)·켜기 확인/취소                                                                                 |
| `social_room_background_returned`                                | `hidden_sec`, `expired`                                             | `useBackgroundGraceWatch` 복귀마다 — `expired`면 `social_room_grace_exceeded`와 같은 순간                                             |
| `focus_start_tapped`                                             | `destination` (`guide/session`)                                     | `HomeTabPage.startFocusFlow` — 온보딩 완료 여부에 따른 분기                                                                           |
| `os_settings_opened`                                             | `source` (`settings_tab`)                                           | `SettingsPage` 카메라 권한 행                                                                                                         |
| `session_recovery_prompted` / `session_recovery_confirmed`       | `prompted.focus_sec`                                                | `useLaunchSessionRecovery`                                                                                                            |
| user property `camera_permission_granted`                        | boolean                                                             | #97 `appLifecycleAnalytics` — 설정 화면의 `camera-permission` 응답(이벤트가 아니라 상태)                                              |

## 확정한 결정

- 네이티브 Amplitude SDK는 도입하지 않는다(위 배경). 웹뷰가 아예 마운트되지 않는 강제 업데이트 화면의 이벤트는 이 통로로 잡을 수 없고, 필요가 증명될 때 SDK를 검토한다.
- 웹이 스스로 아는 일(공유 시트 요청·라우팅·포그라운드 복귀)은 카탈로그에 넣지 않는다 — 이중 집계.
- `set-tab-bar`·`set-back-gesture`·`motion-sensor` 같은 저수준 브리지 메시지는 이벤트화하지 않는다(카탈로그 문서의 "잡음이 신호를 덮음").
- #97(BY-472)을 dev 위로 리베이스하고 정리했다(2026-09-05): `app_foregrounded`/`app_backgrounded`는 네이티브 `app-state` 발신자가 없어 한 번도 찍히지 않았고 보내도 웹뷰 수만큼 중복되므로 릴레이를 빼고 이 티켓의 네이티브 단일 sink로 옮겼다. `camera_permission_result`는 게이트 쪽을 `camera_permission_gate_resolved`가 더 자세히 갖고, 설정 화면 응답은 `camera_permission_granted` user property로 바꿨다. `invite_link_opened`(웹, 브라우저 포함)와 `invite_deep_link_opened`(네이티브, 앱이 링크로 열림)는 다른 질문이라 둘 다 유지 — `is_webview` user property로 가른다.
- PR #124의 base는 #97 브랜치다. 세션 내부 이벤트가 `room_type`에 의존하므로 #97 → #124 순서로 머지한다.

## 테스트

- `apps/mobile/lib/__tests__/nativeAnalytics.test.ts`: 즉시 전달, 큐 보관·순서, 이중 전달 없음, 활성 sink 교대, 상한.
- `apps/mobile/components/__tests__/RemoteWebViewHost.test.tsx`: focused+ready에서만 주입, 큐 flush, 비포커스 무시, 포커스 회복 시 인계, 복구 진입 시 준비 해제, onLoadEnd는 준비 유지, 로드 실패·재시도·config 이벤트.
- `apps/mobile/components/__tests__/RemoteScreen.test.tsx`: `suppressTabBarMessages` → sink 여부.
- 발신부 각각: `TabBar.test.tsx`, `permission-denied.test.tsx`, `cameraPermissionGate.test.ts`, `recommendedUpdateAlert.test.ts`, `pushBootstrap.test.ts`, `social-join-redirect.test.tsx`, `nativeBridgeHandler.test.ts`(room_type).
- `apps/web`: `nativeBridge.test.ts`(파싱·검증), `nativeAnalytics.test.tsx`(구독→신호 순서·릴레이), `amplitude.test.ts`(`source`·`time`, 확장 이벤트 전부의 속성 모양).
- 확장: `apps/mobile/lib/__tests__/appStateAnalytics.test.ts`(background/active 한 쌍·inactive 무시·첫 active 무시·음수 방지), `__tests__/root-layout-font-gate.test.tsx`(AppState 배선), `__tests__/permission-denied.test.tsx`(beforeRemove 이탈 사유); `apps/web`: `useStudyRoomSession.analytics.test.tsx`(정지/재개/비집중/전환), `useBackgroundGraceWatch.test.tsx`, `useLaunchSessionRecovery.test.tsx`, `HomeTabPage.test.tsx`, `settingsPage.test.tsx`.

## 실기기 검증(예정)

1. 홈 → 소셜 탭 터치: Amplitude 사용자 스트림에 `tab_pressed {tab: social, from_tab: home, source: native}` 1건(2건이면 sink 중복).
2. 카메라 권한 미결정 기기에서 "집중 시작" → OS 다이얼로그 거부: `camera_permission_gate_resolved {denied, prompted: true, single}` → `permission_denied_viewed` → "홈으로 돌아가기" → `permission_denied_left {back_home}`이 홈 복귀 뒤 순서대로 도착하고 `time`이 실제 순서를 따른다.
3. 비행기 모드로 탭 로드 실패 → 다시 시도 성공: `webview_load_failed`·`webview_retry_pressed`가 성공 뒤 도착한다.
