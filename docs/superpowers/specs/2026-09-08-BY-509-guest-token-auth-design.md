# BY-509 비회원 토큰 인증 설계

- 티켓: BY-509 (스토리), BY-527 (토큰 인프라), BY-528 (신원 단일화·파라미터 제거)
- 짝 티켓: BY-526 (백엔드)
- 상태: 승인 (2026-09-07 도식 페이지 기준, 2026-09-08 문서화)
- 도식: https://claude.ai/code/artifact/7880759f-846c-4abe-bb34-b489b392060c

## 배경

지금 앱의 신원은 정수 `userId` 하나다. 네이티브가 `POST /api/users`로 발급받아 SecureStore에 저장하고, 웹뷰 URL에 `?userId=N`으로 붙여 넘기며, 웹은 라우트마다 URL 쿼리를 다시 읽어 API 요청의 query·path·body에 싣는다. 서버는 요청에 실린 userId를 그대로 믿는다.

백엔드는 이 방식을 토큰으로 바꾼다. `POST /api/users`가 access·refresh 토큰 쌍을 함께 돌려주고, 이후 모든 요청은 `Authorization: Bearer` 헤더로 인증하며, 서버가 토큰에서 userId를 꺼낸다. 명세는 `.ai` 저장소 `product/specs/BY-383-소셜로그인-인증인가.md`에 있고, 구현은 backend `feature/BY-383-auth-contract` 브랜치에 있다. 2026-09-08 기준 백엔드 `dev`는 인증이 꺼져 있고(BY-627에서 JWT 코드 파킹), BY-526은 착수 전이다.

## 목표

- 네이티브가 토큰 쌍을 발급·보관·갱신하고, 웹뷰가 access 토큰으로 API를 호출한다.
- 웹의 신원 읽기가 한 곳으로 모여, 출처를 URL 쿼리에서 토큰으로 바꿀 때 라우트를 건드리지 않는다.
- 백엔드가 전환된 뒤 userId 파라미터와 `?userId=` 쿼리를 걷어낸다.
- PC 브라우저 클라이언트가 생길 때 웹의 토큰 출처 하나만 더 꽂으면 되게 한다.

## 비목표

- 소셜 로그인 연동 (BY-383 후속 FE 티켓)
- PC 브라우저의 쿠키 기반 refresh 구현
- 같은 계정 다른 기기의 공부 세션 잠금 (백엔드 명세 확정 후)
- Amplitude user_id 매핑 변경 (BY-530), 강제 업데이트 결합 검증 (BY-531)

## 토큰 체계 (백엔드 명세 요약)

| 토큰    | 형식                            | 수명             | 용도                                     |
| ------- | ------------------------------- | ---------------- | ---------------------------------------- |
| access  | JWT HS256, `sub`=userId         | 30분             | 모든 인증 요청의 `Authorization: Bearer` |
| refresh | 불투명 UUID, 서버는 해시만 저장 | 30일, 1회용 회전 | access 재발급 전용                       |

- 재사용된 refresh가 들어오면 서버는 탈취로 보고 그 사용자의 refresh를 전량 폐기한다. 그래서 클라이언트의 갱신 직렬화가 필수다.
- 만료 판단은 서버의 401만 믿는다. 클라이언트는 `exp`를 미리 계산하지 않는다.
- `POST /api/users`·`POST /api/auth/refresh`에는 `Authorization` 헤더를 붙이지 않는다.

## 토큰이 사는 곳

| 층          | 무엇                  | 어디                                                                                       | 이유                                                                                                                                                                                       |
| ----------- | --------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 네이티브 셸 | refresh·access·userId | SecureStore 키 `focuson.auth` 하나에 JSON, 접근 등급 `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` | 한 키에 묶어야 회전 도중 앱이 죽어도 쌍이 어긋나지 않는다. `THIS_DEVICE_ONLY`가 없으면 iCloud 키체인 동기화로 refresh가 다른 기기에 복사되고, 1회용 토큰을 두 기기가 써서 전량 폐기가 난다 |
| 웹뷰 문서   | access·userId         | JS 메모리 변수                                                                             | 페이지에 Amplitude·GA4·Sentry 스크립트가 있어 저장소는 노출 표면이 넓다. 렌더러가 죽으면 다시 받는다                                                                                       |
| 어디에도    | 토큰                  | URL 쿼리, localStorage, 쿠키, JWT 안의 개인정보                                            | URL은 분석·에러 추적으로 새고, JWT는 웹뷰 JS에서 읽힌다                                                                                                                                    |

refresh 토큰은 웹뷰에 전달되지 않는다.

## 구성 요소

### 네이티브 `lib/auth.ts` (신규)

- `ensureAuth(): Promise<AuthState | null>`: 저장된 토큰이 있으면 반환, 없으면 기기 UUID로 `POST /api/users`를 호출해 저장 후 반환. 진행 중인 프라미스를 공유한다(`ensureUserRegistered`의 패턴 그대로).
- `refreshAuth(): Promise<AuthState | null>`: `POST /api/auth/refresh`. 앱 전체에서 진행 중인 갱신은 하나뿐이다. 200이면 두 토큰을 교체 저장한다. 401이면 저장을 지우고 `ensureAuth()`로 재등록한다. 네트워크 오류면 저장을 유지하고 `null`을 돌려준다.
- `subscribeAuth(listener)`: 토큰이 바뀔 때마다 알린다. 마운트된 모든 `RemoteWebViewHost`가 구독해 자기 문서에 `auth-token`을 주입한다.
- 기존 `ensureUserRegistered()`는 `ensureAuth()`의 userId만 돌려주는 얇은 함수로 남긴다. 호출부(`RootLayout`, `remoteQueryParams`)는 그대로다.

### 설치 이관

- 첫 실행에 `focuson.auth`가 없고 `focuson.userId`만 있으면, 저장된 기기 UUID로 재등록해 토큰을 받고 옛 키를 지운다. 재등록은 멱등이라 같은 userId가 돌아온다.
- 서버가 다른 userId를 돌려주면 서버 값을 따른다.

### 브리지 메시지 (`packages/types/src/bridge.ts`)

| 방향          | 메시지                                        | 언제                                   |
| ------------- | --------------------------------------------- | -------------------------------------- |
| 웹 → 네이티브 | `{ type: "auth-ready" }`                      | 웹이 `auth-token` 구독을 건 직후       |
| 웹 → 네이티브 | `{ type: "request-token-refresh" }`           | 웹이 401을 받았을 때                   |
| 네이티브 → 웹 | `{ type: "auth-token", userId, accessToken }` | `auth-ready` 응답, 갱신·재등록 뒤 전파 |

- `auth-ready`는 `home-ready`·`analytics-ready`와 같은 handshake다. 구독을 건 뒤 보내야 응답이 버려지지 않는다.
- 전파 대상은 포커스된 문서 하나가 아니라 마운트된 모든 호스트(탭 4개 + 세션 모달)다. 이벤트 브리지의 단일 sink 규칙과 정반대이며, 이유는 다른 탭이 다음 요청에서 401을 맞지 않게 하기 위해서다.
- 두 파서(`apps/web/src/lib/bridge.ts`, `apps/mobile/lib/webBridge.ts`)는 대칭이다.

### 웹 신원 모듈 (`apps/web/src/lib/userId.ts`)

- `parseUserId(raw)`: 기존 그대로.
- `readUserId(search: string): number | null`: URL 쿼리 문자열에서 읽는다. React 밖(Amplitude 초기화, 라우트 추적기, 온보딩 콜백)이 쓴다.
- `useUserId(): number | null`: 라우트가 쓰는 훅. A단계에서는 `useSearchParams`를 읽고, C단계에서 토큰 출처를 읽도록 본문만 바뀐다.
- 라우트 8곳과 비훅 호출부 3곳이 이 둘로 모인다. 모듈 스코프 저장소를 A단계에 도입하지 않는 이유는 `MemoryRouter`의 `?userId=` 진입으로 신원을 주는 기존 테스트 54파일을 그대로 회귀망으로 쓰기 위해서다.

### 웹 토큰 출처 (`apps/web/src/lib/auth/`)

- `TokenSource` 인터페이스: `getAccessToken(): Promise<string | null>`, `refresh(): Promise<string | null>`, `getUserId(): number | null`, `subscribe(listener)`.
- 구현은 이번에 `bridgeTokenSource` 하나다. 구독을 건 뒤 `auth-ready`를 보내고, `auth-token`을 받아 메모리에 든다. `refresh()`는 `request-token-refresh`를 보내고 다음 `auth-token`을 기다린다. 문서 안에서 동시에 온 갱신 요청은 대기 프라미스 하나로 묶는다.
- 브리지가 없으면(브라우저 단독) 출처가 없고, `apiFetch`는 기다리지 않고 헤더 없이 보낸다.
- PC 확장 때 `cookieTokenSource`가 여기 추가된다. 그 구현은 `POST /api/auth/refresh`를 `credentials: include`로 호출한다.

### `apiFetch` (양쪽)

- 웹: 출처가 있으면 첫 access 토큰을 기다린 뒤 `Authorization: Bearer`를 붙여 보낸다. 401이면 `refresh()` 뒤 새 토큰으로 1회만 재시도하고, 재시도도 401이면 그대로 돌려준다. 이미 재시도한 요청은 다시 갱신하지 않는다.
- 네이티브: 등록·갱신 두 호출뿐이라 헤더 부착 대상이 없다. `Authorization`을 붙이지 않는 것을 테스트로 고정한다.

## 흐름

### 부팅과 첫 요청

1. `RootLayout`이 `ensureAuth()`를 부른다. 강제 업데이트 게이트와 병렬이다.
2. 저장된 토큰이 없으면 `POST /api/users { deviceId }`로 받아 `focuson.auth`에 저장한다.
3. `remoteQueryParams`는 userId가 확보된 뒤에만 웹뷰를 마운트한다(기존 동작).
4. 웹 문서가 구독을 걸고 `auth-ready`를 보낸다.
5. 네이티브가 `auth-token { userId, accessToken }`으로 답한다.
6. `apiFetch`가 첫 토큰을 받은 뒤 `Authorization` 헤더를 붙여 요청한다.

### 만료와 갱신

1. 문서가 401을 받으면 `request-token-refresh`를 보낸다. 문서 안의 동시 401은 한 번만 보낸다.
2. 네이티브 `refreshAuth()`는 진행 중인 갱신이 있으면 그 결과를 기다린다.
3. 200이면 두 토큰을 교체 저장하고 모든 호스트에 `auth-token`을 전파한다.
4. 각 문서는 대기 중이던 요청을 새 토큰으로 1회 재시도한다.
5. 갱신이 401이면 저장을 지우고 재등록해 새 쌍을 전파한다. 네트워크 오류면 저장을 유지하고 요청만 실패로 끝낸다.

## 단계

| 단계 | 티켓       | 내용                                                                                                                                 | 깨지는 것                          |
| ---- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| A    | BY-528 1차 | 신원 모듈 `readUserId`·`useUserId` 도입, 호출부 11곳 치환. 출처는 URL 쿼리 그대로                                                    | 없음                               |
| B    | BY-527     | 네이티브 `lib/auth.ts`, 브리지 메시지, 웹 `TokenSource`와 `apiFetch` Bearer 부착, 갱신·재시도·복구·이관. userId 파라미터는 계속 전송 | 없음 (백엔드가 헤더를 무시할 뿐)   |
| C    | BY-528 2차 | `?userId=` 쿼리와 API 함수 18개의 userId 인자 제거, `useUserId`가 토큰 출처를 읽음, STOMP 인증, 스크러빙 테스트 전제 정리            | BY-526 dev 배포 전에는 앱이 깨진다 |

C단계는 BY-526이 dev에 배포되고 아래 항목이 확정된 뒤에만 시작한다.

## 결정

| #   | 결정           | 내용                                                                                           |
| --- | -------------- | ---------------------------------------------------------------------------------------------- |
| D0  | 순서           | A → B → C                                                                                      |
| D1  | base           | `dev`                                                                                          |
| D2  | 토큰 소유      | 네이티브 단독, SecureStore 한 키                                                               |
| D3  | 웹뷰 전달      | `auth-ready` handshake + `auth-token` 메시지. URL 주입 금지                                    |
| D4  | 웹의 userId    | `auth-token`에 함께 실린다. JWT를 웹에서 디코딩하지 않는다                                     |
| D5  | 401 처리       | 문서는 갱신 요청만, 네이티브가 single-flight, 모든 호스트에 전파, 1회 재시도                   |
| D6  | 갱신 실패 복구 | 401은 재등록, 네트워크 오류는 토큰 유지                                                        |
| D7  | 설치 이관      | 옛 키만 있으면 재등록 후 옛 키 삭제                                                            |
| D8  | STOMP          | 보류. 권장은 CONNECT 프레임 `Authorization` 헤더                                               |
| D9  | 스크러빙       | Sentry·GA4·Amplitude URL 정제 코드는 유지, 테스트 전제만 정리                                  |
| D10 | 브라우저 단독  | 토큰 없음, 저장 없음. PC는 `cookieTokenSource`로 별도 티켓                                     |
| D11 | 쿼리 키        | react-query 키의 userId는 유지                                                                 |
| D12 | 컷오버         | BY-526 dev 배포 → C 검증 → 앱 빌드 → 운영 컷오버와 동시에 Remote Config `minimum_version` 상향 |

## 테스트 전략

- A단계: `readUserId`·`useUserId`에 새 테스트를 두고, 기존 54파일 웹 테스트를 회귀망으로 쓴다.
- B단계: 병렬 401 N개 → refresh 1회, 재시도 후 401 → 갱신 루프 없음, refresh 401 → 재등록, 네트워크 오류 → 토큰 유지, 설치 이관, 브리지 파싱 양쪽 대칭, 전파 대상이 모든 호스트, `auth-ready` 발신이 구독 뒤인 것, `POST /api/users`·`/api/auth/refresh`에 `Authorization` 미부착.
- 실기기: `web-dev` 배포본에서 `Authorization` 프리플라이트 확인(로컬 Vite 프록시는 same-origin이라 못 본다), iOS·Android에서 만료 → 갱신 → 재시도.

## 백엔드에 확인할 것

- BY-526 범위: userId 파라미터가 빠질 엔드포인트 목록, STOMP 인증 방식, BY-609 MDC의 SecurityContext 전환 시점.
- access JWT에 `sid`(refresh 패밀리 id) 클레임을 실을 수 있는지. 기기 간 공부 잠금의 주인 판정에 쓴다.
- 세션 시작 잠금과 409 응답, 잠금 유예 시간.
- refresh 응답을 쿠키로도 내려줄 수 있는지(PC 전용).
- Apple nonce 대조, 계정 삭제 시 Apple 토큰 폐기, PC용 aud 허용, Kakao 이메일 동의 정책.

## PC 확장 대비 (이번 범위 밖, 설계만)

- 셸이 없으므로 refresh는 API가 내려주는 HttpOnly 쿠키(`SameSite=Lax`)에 두고 access는 메모리에 둔다.
- 웹과 API가 같은 사이트(`focusmakers.app`)여야 쿠키가 통한다. `web.sunqstudio.kr`에서는 안 된다.
- 같은 계정 다른 기기의 공부는 서버가 계정당 활성 세션 하나를 잠가 막는다. 다중 기기 로그인 자체는 허용한다.
