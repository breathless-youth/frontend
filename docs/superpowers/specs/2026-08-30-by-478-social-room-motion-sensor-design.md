# BY-478 소셜룸 기기 센서 감지 미동작 수정 — 설계

날짜: 2026-08-30
티켓: [BY-478](https://breathless-youth.atlassian.net/browse/BY-478)

## 문제

소셜룸에서 기기 조작(`DEVICE`) 감지가 동작하지 않는다. 싱글룸은 정상이다.

- 웹 쪽은 `LiveRoomSession.tsx`가 `createDeviceHandlingDetector()`를 싱글룸과 동일하게 연동했고 `motion-sensor: {enabled: true}`를 정상 전송한다.
- 소셜룸은 전용 네이티브 화면 없이 소셜 탭 WebView(`app/(tabs)/social.tsx`, 딥링크는 `app/social/join.tsx`) 안에서 SPA 라우팅으로 진입한다.
- 두 호스트는 공용 핸들러 `lib/nativeBridgeHandler.ts`를 쓰는데 switch문에 `motion-sensor` case가 없어 메시지가 버려진다.
- 싱글룸만 전용 화면 `app/room/[id].tsx`의 화면 로컬 `onBridgeMessage` 오버라이드로 `motion-sensor`를 처리해 정상이다.

## 결정 사항 (사용자 승인 완료)

- 구현 접근: 별도 릴레이 모듈 + 공용 핸들러에 case 한 줄 (A안).
- 포그라운드 복귀 동작: 웹이 켜둔 상태였으면 네이티브가 센서를 재시작한다 (웹 detector의 `start()`는 멱등이라 복귀 시 `motion-sensor: true`를 다시 보내지 않기 때문).
- 싱글룸의 화면 로컬 오버라이드는 그대로 둔다. 오버라이드가 `motion-sensor`를 가로채고 return하므로 공용 case와 이중 실행되지 않는다.

## 구조

### 새 파일: `apps/mobile/lib/motionSensorRelay.ts`

`createMotionSensorRelay(source, appState?)` 팩토리와 기본 싱글턴을 둔다.

- `handle(message, reply)`: `motion-sensor` 메시지를 받아 `enabled`에 따라 `source.start()` / `source.stop()`을 부르고, 최근 `reply` 통로와 "웹이 켜둔 상태" 플래그를 갱신한다.
- 첫 사용 시 `source.subscribe()`로 boolean 변화를 받아 최근 `reply`로 `device-handling` 메시지를 회신한다.
- AppState 리스너: 백그라운드 진입 시 `source.stop()`, active 복귀 시 웹이 켜둔 상태였으면 `source.start()`.
- 센서 어댑터는 기존 `createDeviceMotionSource()`(`lib/deviceMotionSource.ts`)를 그대로 쓴다. `start()`/`stop()`은 이미 멱등이고, `stop()`이 창을 비우고 `false`로 닫는 동작도 이미 있다.
- 테스트는 `DeviceMotionSource`와 AppState를 주입해 검증한다 (expo-sensors 실호출 없음).

### 수정: `apps/mobile/lib/nativeBridgeHandler.ts`

switch에 `case "motion-sensor"` 하나를 추가해 싱글턴 릴레이의 `handle`로 넘긴다.

## 수명 정리

- 웹 detector의 `stop()`이 일시정지·카메라 전환·unmount에서 `motion-sensor: false`를 보내므로 평상시 정리는 웹 신호로 된다.
- 웹이 신호를 못 보내는 경로(WebView 파괴, 앱 강제 종료 직전 백그라운드)는 AppState 가드가 백그라운드 진입 시 센서를 끄는 것으로 막는다.
- 소셜 탭 WebView는 탭 전환에도 살아 있으므로 화면 단위 cleanup은 필요 없다.

## 완료 조건 (티켓과 동일)

- 소셜룸 세션 중에 기기를 들면 딴짓 감지가 동작한다.
- 딥링크로 들어온 소셜룸에서도 동일하게 동작한다.
- 앱을 백그라운드로 보내면 센서가 꺼지고, 웹이 켜둔 상태였으면 복귀 시 다시 켜진다.
- 싱글룸 동작은 기존과 동일하다.

## 범위 밖

- 웹(`apps/web`) 변경 없음.
- 싱글룸 화면(`app/room/[id].tsx`) 변경 없음.
- 감지 판정 로직(`deviceMotion.ts`)과 임계값 변경 없음.
