# BY-1030 앱 푸시 토큰 서버 등록 설계

- 상태: 설계 승인(2026-10-28)
- 티켓: BY-1030 (상위 BY-1028, 선행 BE BY-1029)
- 백엔드 결정: backend `docs/adr/0035-server-direct-fcm-push.md`

## 목표

서버가 사용자별 알림을 보낼 수 있도록 앱이 FCM 토큰을 서버에 등록한다. 알림을 열었을 때 어떤 알림이 어느 화면으로
열렸는지 분석 이벤트로 남긴다.

## 등록

`apps/mobile/lib/pushTokenRegistration.ts`의 함수 하나가 등록을 맡는다.

1. `ensureAuth()`로 access 토큰을 얻는다. 없으면 건너뛴다(다음 시점에 다시 한다).
2. `getPushToken()`으로 FCM 토큰, `getPushPermissionStatus()`로 OS 권한 상태를 읽는다.
3. `PUT /api/push-tokens` (`API-Version: 1`)에 `{ token, platform, notificationsEnabled }`를 보낸다.
   `platform`은 `IOS`·`ANDROID`, `notificationsEnabled`는 권한 상태가 `granted`인지다.
4. 401이면 갱신(`refreshAuth`) 뒤 한 번 다시 보낸다. 웹뷰가 이미 토큰을 바꿔 뒀으면 그 토큰을 쓴다(`launchGoal.ts`와 같은 방식).
5. 실패는 경고 로그만 남기고 던지지 않는다. 토큰 값은 로그에 남기지 않는다.
6. 같은 프로세스에서 마지막으로 성공한 (사용자, 토큰, 권한) 조합과 같으면 다시 보내지 않는다.

### 등록 시점

| 시점                                | 위치                                                        |
| ----------------------------------- | ----------------------------------------------------------- |
| 앱 실행마다, 권한 요청이 끝난 뒤    | `app/_layout.tsx`의 `ensurePushPermission()` 다음           |
| FCM 토큰 갱신                       | `startPushMessaging`의 토큰 갱신 구독                       |
| 사용자 ID 변경                      | `subscribeAuth`에서 사용자 ID가 마지막 등록과 다를 때만     |
| 포그라운드 복귀 때 권한 상태가 바뀜 | `AppState` `active`에서 권한 상태가 마지막 등록과 다를 때만 |

## 결정

1. **권한을 거부한 기기도 등록한다.** `notificationsEnabled=false`로 보낸다. 서버는 권한이 꺼진 기기에도 보낸다(ADR-0035
   결정 4) — 설정에서 다시 켠 기기가 바로 받고, 죽은 토큰이 `UNREGISTERED`로 지워진다.
2. **포그라운드 복귀 때 권한이 바뀌었으면 다시 등록한다.** 클릭률의 분모(`notifications_enabled`)를 다음 실행까지 기다리지 않고 맞춘다.
   권한 상태만 읽고 같으면 아무것도 보내지 않는다.
3. **`type`이 없는 알림(콘솔 캠페인)은 이벤트에 `type`을 싣지 않는다.** Amplitude에서 값 없음으로 보여 서버 발송과 구분된다.
4. **`fallback`은 의도와 다르게 홈으로 갔을 때만 `true`다.** link가 없거나, 허용 범위 밖이거나, 앱에 없는 경로라 홈으로 간
   경우다. link가 원래 홈(`/`·`/home`)이면 `false`다.

## 알림 열림 이벤트

`push_notification_opened`

| 속성       | 값                                                                     |
| ---------- | ---------------------------------------------------------------------- |
| `route`    | 실제로 연 화면 경로(쿼리 제외). 앱에 없는 경로라 홈으로 갔으면 `/`     |
| `fallback` | 결정 4                                                                 |
| `type`     | 알림 data의 `type`. 없으면 싣지 않는다                                 |
| `push_id`  | 알림 data의 `push_id`. 없으면 싣지 않는다(첫 서버 시나리오부터 생긴다) |

## 계약

- `packages/types` `API_ENDPOINTS.pushTokens` = 버전 `1` (백엔드 Swagger 기본값).
- 요청 타입 `PushTokenRegisterRequest { token; platform: "IOS" | "ANDROID"; notificationsEnabled }`.

## 배포 순서

백엔드 운영 배포가 먼저다. 운영 백엔드에 경로가 없을 때 이 앱이 나가면 등록이 실패하고 경고만 남으며, 다음 실행에 다시 한다.

## 검증할 위험

Android에서 RNFB `hasPermission`이 실제 알림 표시 여부와 맞는지 확인한다. Android 13+는 앱이 `POST_NOTIFICATIONS`를
선언하지 않아 알림이 표시되지 않는데, 이때 `false`가 나와야 한다. 에뮬레이터에서 확인한다.
