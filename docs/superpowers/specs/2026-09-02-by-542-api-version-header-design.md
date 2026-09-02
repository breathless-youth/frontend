# BY-542 버전 기반 API 연동 설계

## 배경

백엔드가 BY-541에서 `API-Version` 요청 헤더 기반 버전닝을 도입했다. 헤더가 없으면 v1로 동작하므로 지금 프론트가 고장나는 것은 없지만, 공통 레이어에 기본 헤더 `API-Version: 1`을 미리 넣어두면 이후 버전 전환이 상수 변경 한 번으로 끝난다. 미지원 버전은 서버가 400으로 거부하고, 커스텀 헤더 CORS는 서버에서 이미 허용돼 있다.

현재 프론트에는 공통 fetch 래퍼가 없다. 웹은 `apps/web/src/lib/api.ts`에 `API_BASE_URL` 상수와 에러 파서만 있고 여러 API 모듈에서 `fetch()`를 직접 호출한다. 실제로 훑어보니 웹 14곳, 모바일 2곳(`apps/mobile/lib/userApi.ts`, `apps/mobile/lib/sessionSubmitRelay.ts`)이었다.

## 설계

`fetch`와 시그니처가 같은 얇은 래퍼 `apiFetch`를 앱마다 하나씩 둔다.

- 웹: `apps/web/src/lib/api.ts`에 추가한다.
- 모바일: `apps/mobile/lib/api.ts`에 추가한다.
- 래퍼는 헤더를 `Headers`로 정규화한 뒤, `API-Version`이 없을 때만 기본값 `"1"`을 넣고 전역 `fetch`에 위임한다.
- `fetch`와 시그니처가 같아 `Request` 입력도 받는다. `init.headers`가 없으면 `Request`가 실어 온 헤더를 기준으로 삼아 그 헤더를 유실하지 않는다.
- 호출부가 `API-Version`을 직접 지정하면 그 값이 그대로 나간다 (별도 오버라이드 옵션 없음).
- 기본 버전 상수는 각 앱의 래퍼 안에 리터럴로 둔다 (두 앱은 독립 배포라 공유 패키지로 묶지 않는다).
- REST 호출부 16곳(웹 14, 모바일 2)에서 `fetch` → `apiFetch`로 교체한다.

## 범위 밖

- STOMP WebSocket 통신은 REST 버전닝 대상이 아니다.
- `axios`·`ky` 도입은 토큰 방식 로그인 이후 별도 검토한다. 이번에 호출부를 래퍼 한 곳으로 모아두면 그때 래퍼 내부만 교체하면 된다.
- v2 헤더 전환은 첫 breaking change 티켓에서 진행한다.

## 에러 처리

래퍼는 에러를 다루지 않는다. 실패 응답 처리는 기존 `parseApiError`·`parseErrorMessage`가 호출부에서 그대로 담당한다.

## 테스트

- 웹 vitest, 모바일 jest 각각 래퍼 단위 테스트를 둔다.
- 케이스: 기본 헤더 `API-Version: 1` 주입, 호출부가 넘긴 기존 헤더 보존, 호출부의 `API-Version` 명시 시 기본값 대신 그 값 사용, `Request` 입력의 헤더 보존과 그 `API-Version` 우선.
- 기존 API 테스트들은 전역 `fetch`를 mock하고 호출 인자를 검사한다. 래퍼가 헤더를 `Headers`로 더하면서 init 객체가 바뀌므로, 정확 일치 단언은 `expect.objectContaining`으로 완화해 URL·method·body만 확인하도록 바꾼다.
