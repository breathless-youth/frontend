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

### 발신 지점(카탈로그) — 최종 14종 (2026-09-05)

| 이벤트                                                                                      | 속성                                                                                                             | 발신                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app_backgrounded` / `app_foregrounded`                                                     | `foregrounded.background_sec`                                                                                    | `lib/appStateAnalytics.ts` ← `app/_layout.tsx` AppState 감시. iOS `inactive`와 앱 시작 직후 첫 active는 세지 않음. #97의 `app-state` 릴레이(발신자 없음·웹뷰 수만큼 중복)를 대체                                                                                     |
| `tab_pressed`                                                                               | `tab`, `from_tab` (`home/social/record/settings`), `via` (`tab_bar/card/hardware_back`)                          | `TabBar`(활성 탭은 비활성화라 재터치 없음) + `nativeBridgeHandler`의 `navigate-tab`(홈 연속 공부 카드 → 기록, 출발 탭은 `lib/activeTab.ts`) + `app/(tabs)/_layout.tsx`의 Android 뒤로가기 홈 복귀 — 사용자에겐 전부 같은 탭 이동이라 한 이벤트, 경로만 `via`         |
| `camera_permission_gate_resolved`                                                           | `result` (`granted/denied/already_denied/error`), `prompted`, `room_type` (`single/social`)                      | `lib/cameraPermissionGate.ts` — `nativeBridgeHandler`가 start-session은 single, request-camera-gate는 social로 호출                                                                                                                                                  |
| `permission_denied_viewed` / `permission_denied_settings_opened` / `permission_denied_left` | `left.reason` (`back_home/permission_granted/back`)                                                              | `app/permission-denied.tsx` — 노출은 마운트 1회(네이티브 화면은 페이지뷰가 없어 노출도 이벤트), 이탈은 `beforeRemove`에서 한 번                                                                                                                                      |
| `recommended_update_prompted` / `recommended_update_answered`                               | `latest_version`, `answered.action` (`update/later/dismissed`)                                                   | `lib/recommendedUpdateAlert.ts` — OS 알림창이라 웹은 모른다. 노출 ↔ 응답은 같은 순간이 아니고(사용자가 읽는 시간) 묻는 질문도 다르다                                                                                                                                 |
| `push_notification_opened`                                                                  | `route` (쿼리 제거)                                                                                              | `lib/pushBootstrap.ts` — 푸시가 켜지면 쓰는 자리, 지금은 0건                                                                                                                                                                                                         |
| `invite_deep_link_opened`                                                                   | `has_code`                                                                                                       | `app/social/join.tsx` — 유니버설 링크·App Links·스킴·Install Referrer·알림이 전부 합류하는 앱 진입 경로. 웹 `invite_link_opened`(브라우저 포함, 페이지 진입)와는 다른 질문                                                                                           |
| `webview_load_failed` / `webview_retry_pressed` / `webview_recovery_started`                | `path`, `load_failed.reason` (`config/error/http`), `recovery.reason` (`process_terminated/render_process_gone`) | `RemoteWebViewHost` — 실패 폴백 노출·"다시 시도" 터치(네이티브 버튼이라 autocapture 밖)·렌더러 사망 복구 진입. 셋 다 그 웹뷰로는 못 나가 큐를 거친다. Android는 호스트마다 사망 통보가 오지만 `requestGlobalWebViewRecovery`가 복구를 실제로 시작한 첫 통보만 남긴다 |

**이 통로로 못 잡는 것**: **네이티브** 강제 업데이트 알림창(BY-586 이후 바이너리 — 웹뷰가 아예 마운트되지 않고, 큐는 메모리라 업데이트 후 재실행에서 사라진다. 구버전 바이너리가 보는 **웹** 강제 업데이트 모달은 웹이 `force_update_prompted`·`force_update_store_opened`로 직접 찍는다), `/contact` 문서 내비게이션 중(구 문서 파괴~새 문서 준비 사이). 푸시 권한 요청은 개발 빌드 전용이라 이벤트가 없다.

## 웹(`apps/web`) — 브리지 수신

- `lib/bridge.ts` `parseToWebMessage`: `track-event`를 형식 검증한다(이름 형식 위반은 통째로 버림, 객체·배열 값과 형식 밖 키는 그 항목만 제거).
- `lib/nativeAnalytics.ts` `useNativeAnalyticsRelay`: `App`에서 한 번 마운트. **구독을 건 뒤** `analytics-ready`를 보낸다 — 네이티브가 신호를 받자마자 큐를 비우므로 순서가 바뀌면 유실.
- `lib/amplitude.ts` `trackNativeShellEvent`: `track(name, { ...properties, source: "native" }, { time: atMs })`. `time`은 발생 시각이라 큐를 거쳐 늦게 와도 타임라인이 맞다. 세션 귀속은 SDK가 전송 시각(`Date.now()`)으로 판단하므로 옛 시각이 세션을 새로 열지 않는다.

## 웹(`apps/web`) — 명시 이벤트 최종 카탈로그 (2026-09-05 최종 검토)

룸 안팎에서 웹이 아는 행동은 웹이 직접 찍는다 — 브리지가 아니다. `room_type`은 #97(BY-472)이 `useStudyRoomSession`에 넣은 값을 그대로 쓴다(`single`/`social`). 함수는 전부 `lib/amplitude.ts`의 "BY-616 확장" 절 이후. 속성은 enum·boolean·수만 — 닉네임·목표 문구·초대코드·날짜 값 금지.

| 화면          | 이벤트                                                                                                                                                                                                                                                                                                                             | 발신                                                                                                                                                                                                                                                                                                 |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 세션(S3)      | `study_session_started {room_type, restored}` · `study_session_paused {trigger, room_type}` · `study_session_resumed {pause_sec, trigger, room_type}` · `study_session_distracted {status, duration_sec, room_type}` · `study_session_ended {…, away/phone/device/pause_count}` · `camera_flipped {ok, facing, reason, room_type}` | `useStudyRoomSession` — `restored`는 복원 진입(같은 세션의 두 번째 시작, 완주율 분모에서 제외용). 전이 이벤트는 `applyState`·`pause`·`resume`이 **실제로 전이했을 때만**. 비집중은 구간이 닫힐 때 한 건, 종료 이벤트의 `*_count`는 같은 집계의 세션 요약                                             |
| 세션(S3)      | `study_session_exit_requested/cancelled {room_type}` · `session_notice_confirmed {notice: auto_end/sub_minute, room_type}` · `session_simple_mode_toggled {on}` · `session_orientation_changed {orientation, room_type}`                                                                                                           | `RoomPage`·`LiveRoomSession` — 회전은 `useSessionOrientationAnalytics`(뷰포트 비율, 방향이 실제로 바뀔 때만). 심플 모드는 싱글룸 전용                                                                                                                                                                |
| 결과(S4)      | `study_result_confirmed {room_type, via: cta/close}` · `study_result_distraction_toggled {status, expanded}`                                                                                                                                                                                                                       | `ResultPage`·`DistractionStatsCard`. 결과 화면 노출은 페이지뷰 `/room/:id/result`·`/social/room/:id/result`가 이미 갖는다(별도 `_viewed` 없음)                                                                                                                                                       |
| 홈(S1)        | `focus_start_tapped {destination: guide/session}` · `session_recovery_prompted {focus_sec}` · `session_recovery_confirmed`                                                                                                                                                                                                         | `HomeTabPage`·`useLaunchSessionRecovery`. 연속 공부 카드 → 기록은 네이티브 `tab_pressed {via: card}`, 가이드 카드는 `guide_entered {entry: home-card}`                                                                                                                                               |
| 온보딩(G)     | `guide_entered {entry}` · `guide_step_viewed {step, entry, method}` · `guide_finished {reason, step, entry}`                                                                                                                                                                                                                       | `OnboardingGuideFlow` — `entry`는 `focus-start`(홈 "집중 시작" 첫 실행) / `home-card`(홈 가이드 카드) / `settings`(설정 "측정 기준 안내"). 진입 이벤트는 스텝 1 첫 노출과 같은 순간이지만 유입을 묻는 이벤트라 따로 둔다                                                                             |
| 소셜          | `social_room_create_failed {reason}` · `social_room_camera_toggled {on}` · `social_room_camera_on_dismissed` · `social_room_background_returned {hidden_sec, expired}`                                                                                                                                                             | `SocialHomePage`·`LiveRoomSession`·`useBackgroundGraceWatch`. 나머지 소셜 이벤트(생성·입장·퇴장·초대·피어)는 #97                                                                                                                                                                                     |
| 기록(S5)      | `records_date_selected {is_today, has_records}` · `records_month_changed {delta, method: button/swipe}`                                                                                                                                                                                                                            | `RecordsPage`·`MonthCalendar` — 스와이프는 클릭이 아니라 autocapture 밖                                                                                                                                                                                                                              |
| 설정·프로필   | `settings_row_pressed {row}` · `os_settings_opened {source: settings_tab}` · `profile_save_submitted {changed_*}` · `profile_save_succeeded/failed {reason}`                                                                                                                                                                       | `SettingsPage`·`ProfilePage`                                                                                                                                                                                                                                                                         |
| 공통          | `error_retry_pressed {screen}` · `error_fallback_reloaded` · `screen_back_pressed {path}` · `force_update_prompted {source: web, app_version, min_version}` · `force_update_store_opened {source: web}`                                                                                                                            | `ErrorState`(`screen` prop 필수)·`ContactPage`·`ErrorFallback`·`ScreenBackHeader`·`useForceUpdateGate`(노출)·`App`(스토어 이동). 웹 강제 업데이트 모달은 구버전 바이너리(`nativeUpdateGate` 표시 없음) 전용이고, 라우트 트리를 대체해 뜨므로 페이지뷰가 노출을 대변하지 못해 노출 이벤트를 따로 둔다 |
| user property | `camera_permission_granted`                                                                                                                                                                                                                                                                                                        | #97 `appLifecycleAnalytics` — 설정 화면의 `camera-permission` 응답(이벤트가 아니라 상태)                                                                                                                                                                                                             |

### 2026-09-05 최종 검토 — 원칙과 판단

같은 날 두 차례 방향이 바뀌었다. 1차 확장에서 "붙일 수 있는 요소는 전부"로 45개까지 넓혔다가, 2차 검토에서 "autocapture `Element Clicked`가 클릭을 다 잡으니 DOM에 없는 의미만"으로 16개로 줄였다. 최종 검토는 **"중복만 없다면 가능한 이벤트는 전부 Amplitude에"**(사용자 요청)를 기준으로 되돌리고 더 넓혔다 — 결과 화면·소셜·홈의 행동과 온보딩 진입 경로가 명시 이벤트로 있어야 한다는 요구가 직접 있었다.

- **autocapture는 우리 이벤트가 아니다.** `[Amplitude] Element Clicked`는 SDK 소유의 안전망이다 — 요소 텍스트·aria-label만 알고 의미(룸 종류·스텝·결과)는 모르며, 스와이프·회전·서버 응답·네이티브 버튼은 아예 못 본다. 그래서 명시 이벤트와 겹쳐도 중복으로 보지 않는다. (2차 검토가 뺀 클릭 17종을 전부 되살린 근거.)
- **중복의 정의**: 같은 사건을 같은 뜻으로 두 번 찍는 것. 같은 순간에 **다른 질문**의 이벤트가 겹치는 것은 아니다 — 노출 ↔ 결과(`permission_denied_viewed` ↔ 게이트 `denied`), 알림창 노출 ↔ 응답, 앱 진입 ↔ 페이지 진입(`invite_deep_link_opened` ↔ `invite_link_opened`), 종료 요청 ↔ 종료 확정, 비집중 건별 ↔ 종료 집계, 가이드 진입 ↔ 스텝 1 노출. 이 저장소에는 `study_session_started` ↔ 페이지뷰 `/room/:id`라는 같은 종류의 선례가 이미 있다.
- **그래서 막은 진짜 중복**: ① Android 뒤로가기 홈 복귀는 `hardware_back_pressed`가 아니라 `tab_pressed {via: hardware_back}` — 탭 이동을 두 이름으로 세지 않는다. ② 렌더러 사망은 호스트 4개가 통보를 받아도 `webview_recovery_started` 한 건. ③ `study_session_started`는 복원 진입에서 같은 세션에 두 번 나므로 `restored`로 가른다(완주율 분모는 `restored = false`). ④ 웹 라우트의 노출은 페이지뷰가 이미 갖는다 — `study_result_viewed` 같은 `_viewed`를 웹에 더 두지 않는다(네이티브 화면·알림창만 `_viewed`/`_prompted`).
- **볼륨은 제외 사유가 아니다.** `study_session_distracted`(세션당 수십 건)는 현재 사용자 규모에서 Amplitude 플랜 한도에 영향을 주지 않는 수준이고, 건별 길이 분포는 여기서만 나온다. 종료 이벤트의 카운트는 퍼널 필터용 요약으로 함께 둔다.
- **새로 더한 것**: 네이티브 `webview_recovery_started`, `tab_pressed {via: hardware_back}`; 웹 `guide_entered {entry}`, `session_orientation_changed`, `session_simple_mode_toggled`, `social_room_create_failed`, `study_session_started.restored`.
- **안 더한 것**: `screen_load_failed`(조회 실패 노출 — 재시도 터치가 `error_retry_pressed {screen}`으로 있고, 실패 자체는 Sentry 몫), 푸시 수신(사용자 행동이 아니고 정책 미정), 네이티브 강제 업데이트 알림창(위 "못 잡는 것"), `study_result_viewed`(페이지뷰와 같은 질문).

### 배포 상태와 확인 순서

- **운영 Amplitude에는 아직 #97(BY-472)·#124(BY-616) 둘 다 없다.** 지금 보이는 것은 그 이전의 세션 3종·페이지뷰·autocapture뿐이라, 결과·소셜·홈·온보딩 이벤트가 "안 잡히는 것처럼" 보이는 것이 맞다. #97 → #124 순서로 머지되고 Vercel 배포가 끝나면 웹 이벤트는 현재 앱으로 바로, 네이티브 이벤트는 다음 TestFlight 빌드부터 들어온다.
- 온보딩 진입 경로는 `guide_entered`를 `entry`로 나누면 되고, 같은 `entry`가 `guide_step_viewed`·`guide_finished`에도 실려 진입 → 완료 퍼널을 `entry`로 세그먼트할 수 있다.

## 확정한 결정

- 네이티브 Amplitude SDK는 도입하지 않는다(위 배경). 웹뷰가 아예 마운트되지 않는 강제 업데이트 화면의 이벤트는 이 통로로 잡을 수 없고, 필요가 증명될 때 SDK를 검토한다.
- 웹이 스스로 아는 일(공유 시트 요청·라우팅·룸 안의 행동)은 네이티브 카탈로그에 넣지 않는다 — 같은 사건을 두 발신부에서 찍게 된다. 포/백그라운드 전환은 반대로 네이티브만 한 번에 판정할 수 있어 네이티브 몫이다.
- `set-tab-bar`·`set-back-gesture`·`motion-sensor` 같은 저수준 브리지 메시지는 이벤트화하지 않는다(카탈로그 문서의 "잡음이 신호를 덮음").
- #97(BY-472)을 dev 위로 리베이스하고 정리했다(2026-09-05): `app_foregrounded`/`app_backgrounded`는 네이티브 `app-state` 발신자가 없어 한 번도 찍히지 않았고 보내도 웹뷰 수만큼 중복되므로 릴레이를 빼고 이 티켓의 네이티브 단일 sink로 옮겼다. `camera_permission_result`는 게이트 쪽을 `camera_permission_gate_resolved`가 더 자세히 갖고, 설정 화면 응답은 `camera_permission_granted` user property로 바꿨다. `invite_link_opened`(웹, 브라우저 포함)와 `invite_deep_link_opened`(네이티브, 앱이 링크로 열림)는 다른 질문이라 둘 다 유지 — `is_webview` user property로 가른다.
- PR #124의 base는 #97 브랜치다. 세션 내부 이벤트가 `room_type`에 의존하므로 #97 → #124 순서로 머지한다.

## 테스트

- `apps/mobile/lib/__tests__/nativeAnalytics.test.ts`: 즉시 전달, 큐 보관·순서, 이중 전달 없음, 활성 sink 교대, 상한.
- `apps/mobile/components/__tests__/RemoteWebViewHost.test.tsx`: focused+ready에서만 주입, 큐 flush, 비포커스 무시, 포커스 회복 시 인계, 복구 진입 시 준비 해제, onLoadEnd는 준비 유지, 로드 실패·재시도·config 이벤트.
- `apps/mobile/components/__tests__/RemoteScreen.test.tsx`: `suppressTabBarMessages` → sink 여부.
- 발신부 각각: `TabBar.test.tsx`, `permission-denied.test.tsx`, `cameraPermissionGate.test.ts`, `recommendedUpdateAlert.test.ts`, `pushBootstrap.test.ts`, `social-join-redirect.test.tsx`, `nativeBridgeHandler.test.ts`(room_type).
- `apps/web`: `nativeBridge.test.ts`(파싱·검증), `nativeAnalytics.test.tsx`(구독→신호 순서·릴레이), `amplitude.test.ts`(`source`·`time`, 확장 이벤트 전부의 속성 모양).
- 확장: `apps/mobile/lib/__tests__/appStateAnalytics.test.ts`(background/active 한 쌍·inactive 무시·첫 active 무시·음수 방지), `__tests__/root-layout-font-gate.test.tsx`(AppState 배선), `__tests__/permission-denied.test.tsx`(노출·beforeRemove 이탈 사유), `__tests__/tabs-layout.test.tsx`(뒤로가기 홈 복귀 = `tab_pressed {via: hardware_back}`, 홈 탭은 없음), `RemoteWebViewHost.test.tsx`(재시도 이벤트, iOS 사망 1건, Android 호스트 2개 통보에 1건); `apps/web`: `useStudyRoomSession.analytics.test.tsx`(시작 `restored`·정지/재개/비집중/전환), `useSessionOrientationAnalytics.test.ts`(방향이 바뀔 때만·둘 다 와도 1건·언마운트), `useBackgroundGraceWatch.test.tsx`, `useLaunchSessionRecovery.test.tsx`, `HomeTabPage.test.tsx`, `settingsPage.test.tsx`, `amplitude.test.ts`(전 이벤트의 이름·속성 모양).

## 실기기 검증 방법 (2026-09-05 정정)

"머지 전에 Amplitude에서 확인"은 성립하지 않는다 — 키가 운영 웹에만 있고, 네이티브 이벤트는 새 바이너리가 있어야 운영 Amplitude에 닿는다. 머지 전 확인 대상은 **브리지 타이밍**(`analytics-ready` 순서, 백그라운드 웹뷰 주입, `beforeRemove` 발화)이고, 그건 지금 깔린 개발 빌드로 본다(BY-616은 JS만 바꿔 재빌드가 필요 없다).

- 기기의 개발 빌드(09-04, `aef0d43`)에 Metro로 이 브랜치 번들을 내려준다(번들은 ngrok, 실행은 `devicectl --payload-url`). 웹은 로컬 Vite를 mkcert HTTPS 또는 ngrok으로 열고 `.env.local`의 `WEB_BASE_URL`로 지정한다(`apps/mobile/CLAUDE.md` "웹 dev 서버로 화면 띄우기").
- 도착 확인은 Safari Web Inspector(설정 → Safari → 고급 → 웹 속성)로 웹뷰 콘솔을 본다. 개발 빌드에서만 `webviewDebuggingEnabled`가 켜진다(iOS 16.4+ 필수). 키 없는 로컬 웹은 SDK가 초기화되지 않으므로 순서·속성을 보려면 `trackNativeShellEvent`·`track` 호출부에 임시 `console.debug`를 넣고 확인 뒤 되돌린다 — 09-05 검증 때 썼던 Metro `[analytics] → 웹` 로그와 웹 `[amplitude:dev]` 개발 추적 모드는 검증이 끝나 제거했다(검증용 코드를 남기지 않는다).
- 확인 시나리오: ① 홈 → 소셜 탭 터치 — `tab_pressed {tab: social, from_tab: home}`가 **한 번** 도착. ② 권한 미결정 기기에서 "집중 시작" → OS 다이얼로그 거부 → S2-3 → 홈으로 돌아가기 — `camera_permission_gate_resolved`·`permission_denied_viewed`·`permission_denied_left {back_home}`이 홈 복귀 뒤 순서대로 도착하고 `time`이 실제 순서를 따른다. ③ 앱 백그라운드 → 복귀 — `app_backgrounded`, `app_foregrounded {background_sec}`. ④ 룸에서 일시정지 5초 → 재개 — `study_session_paused/resumed {pause_sec: 5}`. ⑤ 소셜룸 카메라 끄기 → 백그라운드 → 복귀 — `social_room_camera_toggled {on: false}`, `study_session_paused {BACKGROUND}`는 이미 정지라 없음, `social_room_background_returned`.
- Amplitude 콘솔 확인은 머지 후: 웹 이벤트는 Vercel 배포 직후 현재 앱으로도 바로, 네이티브 이벤트는 다음 TestFlight 빌드부터. 확인 계정은 "제외 대상 노이즈" 코호트에 넣는다.
