# 공부 세션 제출 앱 경로 삭제 설계 (BY-614)

## 배경

세션 종료 시 `POST /api/study-sessions` 제출은 `apps/web/src/features/study-session/submitStudySession.ts`가 담당한다. 지금은 브리지 존재 여부로 경로가 갈린다. 앱 WebView면 `submit-session` 메시지로 네이티브 `apps/mobile/lib/sessionSubmitRelay.ts`에 HTTP 호출을 대행시키고, 브라우저면 직접 `fetch`한다.

대행 경로는 2026-07-30 백엔드가 CORS 헤더를 보내지 않던 시절의 우회였다(BY-335). BY-449 이후 같은 WebView가 `PUT /api/study-sessions/active`를 `API-Version` 커스텀 헤더까지 붙여 직접 보내고 있고 앱에서 정상 동작한다. 같은 호스트에 같은 헤더를 붙인 POST가 막힐 이유가 없다. BY-449 설계 문서는 최종 제출의 대행 분기 제거를 별도 작업으로 남겼고, 이 문서가 그 작업이다.

## 목표

- 제출 경로를 웹의 `fetch` 하나로 정리한다.
- 브리지 대행 경로, 관련 메시지 타입, 네이티브 처리 코드와 테스트를 전부 삭제한다.
- 새 코드는 추가하지 않는다.

## 범위 밖

- 웹 직접 경로에 시간 상한을 두지 않는다. 30초 상한은 브리지가 단방향 통로라 응답이 영영 오지 않을 수 있어서 둔 장치였고 `fetch`에는 그 사유가 없다.
- `docs/handoff/2026-08-01-by-332-배포와-세션제출-검증.md`는 당시 기록이라 손대지 않는다.
- 다른 브리지 메시지(`start-session`, `share`, `motion-sensor` 등)는 건드리지 않는다.

## 호환성

웹은 원격 URL로 로드되고 앱에 번들이 동봉돼 있지 않다. 웹이 `submit-session`을 보내지 않으면 구버전 앱의 대행 코드는 호출되지 않는 코드가 된다. 새 앱과 옛 웹 조합은 생기지 않는다. 따라서 배포 순서를 맞출 필요가 없다.

## 설계

### 제출 모듈

`submitStudySession`은 브리지 유무를 보지 않고 항상 `apiFetch`로 `POST /api/study-sessions`를 보낸다. 앱 WebView와 브라우저가 같은 코드를 탄다.

실패 처리는 현행 브라우저 경로 그대로다. 응답이 `!ok`면 `parseApiError`로 status를 가진 `ApiError`를 throw한다. 호출부 `useStudyRoomSession`은 이미 그 에러의 `message`를 오류 화면에 띄우고 있어 손대지 않는다.

`buildSessionRequest`와 클램프 로직은 그대로 둔다.

### 삭제 대상

#### 웹 (`apps/web`)

- `src/features/study-session/bridge/submitViaNative.ts` 삭제.
- `src/features/study-session/bridge/__tests__/submitViaNative.test.ts` 삭제.
- `src/features/study-session/submitStudySession.ts`에서 `isNativeBridgeAvailable`·`submitViaNative` import와 분기, "전송 경로가 둘이다" 주석 삭제.
- `src/lib/bridge.ts`에서 `parseToWebMessage`의 `submit-result` 분기, `StudySessionResponse` import, `postToNative` 주석의 `submit-session` 언급 삭제.
- `src/features/study-session/bridge/__tests__/nativeBridge.test.ts`에서 `submit-result` 케이스 5건 삭제 후 `src/lib/__tests__/bridge.test.ts`로 이동. 이 테스트는 이미 `lib/bridge.ts`를 검증하고 있어 `bridge/` 폴더는 비게 되므로 폴더를 없앤다.
- `CLAUDE.md`의 네이티브 브리지 절에서 `submit-session` 타임아웃 문장 삭제.

#### 타입 (`packages/types`)

- `src/bridge.ts`에서 `SubmitSessionMessage`·`SubmitResultMessage` 정의, `ToNativeMessage`·`ToWebMessage` 유니온의 해당 항목, `./index` 타입 import 삭제.
- `src/index.ts`에서 두 타입 re-export 삭제.

#### 모바일 (`apps/mobile`)

- `lib/sessionSubmitRelay.ts`와 `lib/__tests__/sessionSubmitRelay.test.ts` 삭제.
- `lib/nativeBridgeHandler.ts`에서 `submit-session` case와 `relaySessionSubmit` import 삭제.
- `lib/webBridge.ts`에서 `submit-session` 파싱 case와 `SubmitSessionMessage` import 삭제.
- `lib/__tests__/nativeBridgeHandler.test.ts`에서 relay mock과 대행 테스트 1건 삭제.
- `lib/__tests__/tabBarVisibility.test.ts`에서 relay mock 삭제.
- `lib/__tests__/webBridge.test.ts`에서 `submit-session` 파싱 케이스 3건 삭제. "따옴표·개행이 섞인 문구" 테스트는 검증 자체를 남겨야 하므로 `submit-result`의 `message` 대신 `reset-route`의 `path`를 쓰도록 바꾼다.
- `CLAUDE.md`의 "네이티브 `fetch`는 두 곳뿐" 전제를 `lib/userApi.ts` 한 곳으로 갱신.
- `components/RemoteScreen.tsx`, `components/RemoteWebViewHost.tsx`, `app/room/[id].tsx` 주석에서 대행 언급 삭제.

## 테스트

새 테스트는 없다. 기존 `submitStudySession.test.ts`의 브라우저 경로 4건(성공, 400 message, ApiError status, message 없는 실패)이 그대로 단일 경로 검증이 된다.

## 완료 조건

- 앱 iOS와 Android에서 세션을 끝내면 결과 화면까지 정상으로 도달한다.
- 브라우저에서 세션을 끝내면 결과 화면까지 정상으로 도달한다.
- `apps/web`, `apps/mobile`, `packages/types` 어디에도 `submit-session`·`submit-result`·`submitViaNative`·`sessionSubmitRelay` 문자열이 남지 않는다.
- typecheck, lint, web vitest, mobile jest가 모두 통과한다.
