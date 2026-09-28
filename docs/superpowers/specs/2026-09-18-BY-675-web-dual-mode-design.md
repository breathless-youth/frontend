# BY-675 웹 이중 모드 설계

토큰 출처가 없는 문서에서 웹이 BY-528 이전 방식으로 요청하게 하는 분기. 컷오버 작전서 C안의 2단계다.

- 티켓: BY-675
- 작전서: https://claude.ai/artifact/CeJzkMCtbVzxGBZdEAHaAJ
- 되돌리는 대상: BY-528 (PR #163)

## 배경

BY-528에서 요청의 `userId`를 걷어내고 소켓도 CONNECT 헤더 인증으로 바꿨다. 그 결과 신 웹은 토큰을 주는 신 앱에서만 동작하게 됐다.

컷오버 순서를 검토하니 앱·웹·API를 같은 순간에 바꿀 방법이 없었다. 웹 배포는 2분, 스토어 반영은 몇 시간, 사용자 업데이트는 며칠이 걸린다. 강제 업데이트 게이트는 지난 실행에서 받아 둔 값으로 판정해서 구 앱에 닿기까지 실행이 두 번 필요했다. 그 사이 구 앱 사용자는 신 웹을 보고 깨진다.

그래서 웹이 구 앱과 신 앱을 둘 다 받는다. 백엔드는 토큰 없는 요청을 `userId` 파라미터로 받아주는 이중 지원을 하기로 했다(2026-09-18 확답).

## 목표

- 웹을 먼저 배포해도 구 앱 사용자가 깨지지 않는다.
- 토큰 출처가 있는 문서(신 앱)의 동작은 바뀌지 않는다.
- 구 앱이 사라진 뒤 이 분기를 지우기 쉽다.

## 분기 조건

분기 헬퍼 하나를 `lib/userId.ts`에 둔다.

```ts
/** 토큰 출처가 없는 문서가 URL로 받은 신원. 있으면 구 방식(userId 파라미터)으로 요청한다. */
export function legacyUserId(): number | null {
  if (getTokenSource() !== null) return null;
  return parseUserId(new URLSearchParams(window.location.search).get(USER_ID_PARAM));
}
```

조건은 "토큰 출처 없음"과 "URL에 `userId` 있음" 둘 다다. 구 앱은 모든 문서 URL에 `?userId=N`을 붙이므로, BY-528 이전에 라우트가 `useSearchParams`로 읽어 넘기던 값과 같은 출처다.

출처도 없고 URL에도 없으면 현재 동작(신 방식)으로 간다. 신원 없이 구 방식으로 보내도 어차피 서버가 받지 못하고, 이 규칙 덕에 기존 테스트가 바뀌지 않는다. 기존 테스트는 출처도 URL `userId`도 없이 돈다.

## 접근 선택

세 가지를 비교했다.

- A. URL에서 읽는 헬퍼 하나, 함수 시그니처는 그대로. 분기가 `lib` 안에 갇히고 호출부 12곳을 건드리지 않는다. 지울 때도 헬퍼와 분기만 지운다. 택했다.
- B. BY-528 이전처럼 `userId` 인자를 시그니처에 되살린다. 함수는 순수해지지만 호출부 12곳과 테스트를 다시 고치고, 지울 때 또 고친다. 신 앱에서는 쓰지 않는 인자가 남는다.
- C. `apiFetch` 안에서 자동으로 `userId`를 끼운다. 경로 치환과 본문 주입까지 하려면 `apiFetch`가 요청 의미를 알아야 해서 과하다.

A의 대가는 API 함수가 `window.location`을 읽는다는 점이다. 순수 빌더(`buildSessionRequest`, `buildActiveSnapshotRequest`)는 손대지 않고 `apiFetch` 직전에만 본문을 합쳐 그 영향을 좁힌다.

## HTTP 요청

각 함수 안에서 `const legacy = legacyUserId()`를 읽은 뒤 아래처럼 가른다. 함수 시그니처는 바뀌지 않는다.

| 종류                                                                                                                                                    | `legacy !== null`                                    | `legacy === null` (현재) |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------ |
| 프로필 조회·수정 (`profileApi.ts`)                                                                                                                      | `/api/users/${legacy}/profile`                       | `/api/users/me/profile`  |
| 통계 세 곳 (`statsApi.ts`), 세션 상세 (`studySessionApi.ts`), 활성 조회 (`restoreActiveSession.ts`), 복구 (`closeStaleSession.ts`), 퇴장 (`roomApi.ts`) | 쿼리에 `userId=` 추가                                | 그대로                   |
| 세션 제출 (`submitStudySession.ts`), 활성 보고 (`reportActiveSession.ts`), 방 참여 (`roomApi.ts`), rtc-stats (`rtcStatsApi.ts`)                         | `JSON.stringify({ ...req, userId: legacy })`         | 그대로                   |
| 방 생성 (`roomApi.ts`)                                                                                                                                  | 본문 `{ userId }`와 `Content-Type: application/json` | 본문 없음                |

`Authorization` 헤더는 `apiFetch`가 토큰 출처가 있을 때만 붙이므로 legacy 경로에는 붙지 않는다. 이 부분은 바뀌지 않는다.

`API-Version` 헤더는 이 구현에서 토큰 부착 여부로 갈린다. 토큰을 붙인 요청은 `2`, 붙이지 않은 요청은 `1`을 보내고, 호출부가 직접 지정한 값은 그대로 우선한다.

> **이 규칙은 구조적으로 틀렸었고 BY-723(#192)이 걷어냈다.** 버전은 **엔드포인트 단위**라 토큰 부착 여부로 정할 값이 아니다. 이 티켓이 부르는 경로가 전부 v2여서 결과만 우연히 맞았고, v1인 새 경로(`/api/stats/study-days`, `/api/subjects`)를 붙이는 순간 400이 났다. 지금은 위 "토큰 부착 여부로 갈린다"가 아니라 `packages/types`의 `API_ENDPOINTS` 레지스트리를 쓴다 — 호출부가 엔드포인트 키를 넘기면 `apiVersionFor`가 그 엔드포인트 버전을 보낸다. 표와 규칙은 [BY-509 설계 문서](./2026-09-08-BY-509-guest-token-auth-design.md)의 `API-Version` 절에 있다.

쿼리가 이미 있는 요청(`?date=`, `?from=&to=`)은 `&userId=`로 잇고, 없는 요청은 `?userId=`로 시작한다. `getStreak`는 범위가 없을 때 쿼리가 비므로 두 경우를 모두 처리한다.

## 소켓

`stompRoomChannel.ts`에서 채널 생성 시 `legacyUserId()`를 한 번 읽어 둔다. 구 앱 문서의 신원은 문서 수명 동안 바뀌지 않는다.

- `brokerURL`은 legacy가 있으면 `${wsBase}/ws?userId=${legacy}`, 없으면 `${wsBase}/ws`다.
- `beforeConnect`는 토큰 출처가 있으면 지금 그대로 갱신 뒤 `Authorization: Bearer`를 붙이고, 토큰을 못 얻으면 연결을 멈춘다.
- 토큰 출처가 없고 legacy가 있으면 `connectHeaders = {}`로 헤더 없이 붙는다. 연결을 멈추지 않는다.
- 토큰 출처도 legacy도 없으면 지금처럼 연결을 멈춘다.

## 타입

`packages/types/src/index.ts`에서:

- `StudySessionCreateRequest`, `ActiveSessionSnapshotRequest`, `RoomJoinRequest`, `RtcStatRequest`에 `userId?: number`를 더한다.
- `RoomCreateRequest`를 `{ userId: number }`로 되살린다. legacy 경로에서만 쓴다.

## 신원 읽기

`readUserId`, `useUserId`, `useIdentityPending`은 바뀌지 않는다. `useIdentityPending`은 출처가 없으면 이미 `false`다.

## 테스트

기존 테스트는 바꾸지 않는다.

- `userId.test.tsx`: `legacyUserId` 3건. 출처 있음이면 `null`, 출처 없음과 URL `userId`면 그 값, 둘 다 없으면 `null`.
- 각 API 테스트 파일(`profileApi`, `statsApi`, `studySessionApi`, `roomApi`, `rtcStatsApi`, `closeStaleSession`, `restoreActiveSession`, `submitStudySession`, `reportActiveSession`)에 "출처 없음 + `?userId=7`" 케이스를 하나씩 더해 경로·쿼리·본문과 `Authorization` 부재를 단언한다.
- `stompRoomChannel.test.ts`: legacy면 `brokerURL`에 `?userId=`가 붙고 CONNECT 헤더가 비며 `deactivate`가 불리지 않는 것, 출처도 legacy도 없으면 지금처럼 `deactivate`되는 것.

URL은 `window.history.replaceState(null, "", "/home?userId=7")`로 만들고, 출처는 `getTokenSource`를 `vi.mock`으로 `null`로 둔다. 기존 `tokenSource.test.ts`와 `userId.test.tsx`가 같은 방식을 쓴다.

## 검증

- 브라우저에서 `/home?userId=N`으로 열면 구 앱과 같은 조건이다. 홈·기록·프로필·소셜룸을 이 경로로 본다. 백엔드 이중 지원이 개발 API에 들어와야 200을 받는다.
- 개발 API에 이중 지원이 들어온 뒤 09-06 STG 빌드(구 앱)를 실기기에 붙여 확인한다.
- 신 앱 경로는 09-18 STG 검증을 통과했고 이 작업이 건드리지 않으므로, 기존 테스트가 그대로 통과하는 것으로 확인한다.

## 제거

`legacyUserId` 위에 `ponytail:` 주석 한 줄로 "구 앱 퇴출 뒤 이 헬퍼와 `legacy` 분기를 전부 지운다"를 남긴다. 지울 때 `legacyUserId`를 검색하면 분기가 다 잡힌다. 제거는 별도 티켓이다.

## 범위 밖

- API 쪽 이중 지원. BE 티켓이 생기면 BY-675에 연결한다.
- 이중 모드 제거. 구 앱 퇴출 뒤 별도 티켓.
- 최소 버전 상향. BY-531.
