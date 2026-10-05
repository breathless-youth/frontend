# BY-673 토큰 전송 경로 가드 보강

- 티켓: BY-673 (스토리 BY-509의 마지막 하위 작업)
- 출처: CodeRabbit의 BY-528 PR(#163) 리뷰 지적 두 건

## 문제

1. `apps/web/scripts/resolveApiBase.ts`의 production 검사는 호스트만 보고 스킴은 보지 않는다. 운영 주소에 `http://api.focusmakers.app`을 넣어도 빌드가 통과한다. 그러면 HTTP 요청의 `Authorization`과 STOMP CONNECT 프레임의 Bearer가 평문으로 나간다. STOMP 주소는 `API_BASE_URL`의 `http`를 `ws`로 바꿔 만들기 때문이다.
2. `apps/web/src/lib/api.ts`의 `apiFetch`는 토큰 출처가 있으면 요청이 어느 origin으로 가든 Bearer를 붙인다. 지금 호출부는 전부 `${API_BASE_URL}/api/...`라 문제가 드러나지 않았지만, 외부 URL을 넘기는 호출부가 하나라도 생기면 access 토큰이 그 서버로 나간다.

## 결정

| 항목             | 결정                                                | 이유                                                                                 |
| ---------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------ |
| https 강제 범위  | production만                                        | 티켓 완료 조건 그대로. preview 가드는 운영 호스트만 막는다는 원칙을 유지한다         |
| 다른 origin 요청 | 토큰 없이 보낸다. 401이 와도 갱신·재시도하지 않는다 | 티켓 문구 그대로. 갱신은 우리 서버 토큰의 일이라 외부 응답과 무관하다                |
| API origin 기준  | `new URL(API_BASE_URL, location.href).origin`       | 값이 비어 있는 로컬(same-origin 프록시)에서는 저절로 현재 origin이 된다. 분기가 없다 |
| 파싱 실패        | 두 곳 모두 실패 쪽으로 처리한다(fail-closed)        | 운영 빌드는 거부하고, apiFetch는 다른 origin으로 본다                                |

## 설계

### 1. resolveApiBase — 운영 https 강제

production 분기에서 호스트 검사 뒤에 스킴 검사를 하나 더 둔다. `new URL(apiBase).protocol`이 `https:`가 아니거나 파싱이 실패하면 던진다.

다음 값은 호스트 검사를 통과하던 것이 이제 실패한다.

- `http://api.focusmakers.app`: 평문
- `api.focusmakers.app`: 스킴이 없어 런타임에서는 상대 경로가 되어 운영이 깨진다
- `api.focusmakers.app:443`: `api.focusmakers.app:`이 스킴으로 파싱된다

preview와 development는 바꾸지 않는다.

### 2. apiFetch — 다른 origin에는 토큰을 싣지 않는다

기존의 "토큰 출처가 없으면 그냥 보낸다" 조기 반환 조건을 `source === null || !isApiOrigin(input)`으로 넓힌다. API-Version 헤더는 지금처럼 붙는다.

`isApiOrigin(input)`은 요청 URL(Request 입력이면 `.url`, 아니면 `String(input)`)을 `location.href` 기준으로 풀어 origin을 비교한다. 상대 경로는 같은 origin이다.

## 테스트

- resolveApiBase: production에서 위 세 값이 각각 던진다
- apiFetch (토큰 출처가 있는 상태)
  - 다른 origin 문자열 URL에는 Authorization이 없다
  - 다른 origin Request 입력에도 Authorization이 없다
  - 다른 origin이 401을 줘도 갱신을 요청하지 않고 한 번만 보낸다
  - 같은 origin을 절대 URL로 넘기면 Bearer가 붙는다

## 범위 밖

- preview https 강제
- 다른 origin 요청에 예외 던지기
- STOMP 코드 수정 (1번 검사로 함께 막힌다)
