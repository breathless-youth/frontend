# 모바일 운영 도메인 focusmakers.app 전환과 개발 빌드 가드 (BY-464)

- 대상: `apps/mobile`
- 관련 티켓: BY-464
- 작성일: 2026-08-29

## 배경

앱의 운영 API·웹 주소가 `app.config.ts`에 `sunqstudio.kr`로 들어가 있다. 도메인을 `focusmakers.app`으로 바꾼다.

- 안드로이드: 플레이스토어에 올라가지 않아 첫 출시 전에 새 주소를 반영하면 안드로이드 빌드에는 옛 주소가 남지 않는다.
- iOS: 이미 출시되어 옛 주소를 부르는 빌드가 있으므로 `sunqstudio` 쪽 백엔드는 당분간 함께 살려 둔다.

개발 빌드는 `.env.local`의 `API_BASE_URL`·`WEB_BASE_URL`을 그대로 신뢰하고 있는 상황이다.

## 변경 1: 운영 주소 전환 (`app.config.ts`)

- `PROD_API_BASE_URL`을 `https://api.focusmakers.app`으로 바꾼다.
- `PROD_WEB_BASE_URL`을 `https://web.focusmakers.app`으로 바꾼다.
- `APP_VARIANT=production` 분기 구조는 그대로 둔다.

선행 조건: `api.focusmakers.app`(T1)과 `web.focusmakers.app`(T2)이 실제로 서비스 중이어야 하고, 백엔드 운영 CORS에 `web.focusmakers.app`이 추가 배포(T3)되어 있어야 한다. 이 코드는 선행 전에 병합할 수 있으나, 운영 빌드와 안드로이드 출시는 선행 완료 후에만 진행한다.

## 변경 2: 개발 빌드 가드 (`app.config.ts`)

개발 분기(`APP_VARIANT`가 `production`이 아닐 때)에서 환경변수 값이 운영 호스트를 가리키면 설정 평가 시점에 `Error`를 던진다. `expo start`와 빌드가 즉시 실패하므로 조용히 운영으로 붙는 일이 없다.

### 가드 규칙

- 검사 대상은 `API_BASE_URL`과 `WEB_BASE_URL` 두 변수다.
- 운영 호스트 목록: `api.sunqstudio.kr`, `api.focusmakers.app`, `web.sunqstudio.kr`, `web.focusmakers.app`.
- 값이 비어 있으면 통과한다 (기존의 안전 기본값 동작 유지).
- URL로 파싱되지 않는 값은 통과한다. 가드의 역할은 운영 차단 하나이고, 형식 검증까지 하면 기존에 동작하던 값을 깨뜨릴 수 있다.
- 에러 문구에 어느 변수가 문제인지와 개발 주소(`api-dev`)를 쓰라는 안내를 담는다.
- `production` 분기는 가드를 타지 않는다. 환경변수를 아예 무시하는 기존 설계가 그대로 방어하고, 기존 테스트가 이 동작을 고정하고 있다.

`WEB_BASE_URL`도 검사하는 이유: 개발 빌드의 웹뷰가 운영 웹 번들을 로드하면 그 번들이 운영 API를 부르므로, API 직접 호출과 같은 오염 경로가 된다.

## 변경 3: `.env.local.example` 신설 (`apps/mobile`)

- 키는 `API_BASE_URL`, `WEB_BASE_URL` 두 개다.
- 실제 개발 서버 주소는 적지 않는다. 인증이 꺼져 있는 동안 개발 서버 주소는 곧 누구나 쓸 수 있는 DB 주소이므로, 값은 팀 내부에서 공유받는다.

## 테스트 (`appConfigVariant.test.ts`)

- 기존 운영 주소 단언 2건을 `focusmakers.app`으로 갱신한다.
- 추가: 개발 분기에서 `API_BASE_URL`이 운영 호스트면 throw 한다.
- 추가: 개발 분기에서 `WEB_BASE_URL`이 운영 호스트면 throw 한다.
- 기존 "production은 환경변수를 무시한다" 테스트는 운영 주소만 갱신하고 유지한다.

## 범위 밖

- `sunqstudio` 관련 코드 삭제는 하지 않는다. iOS 레거시 빌드가 계속 쓴다.
- `.env.local` 실제 값의 `api-dev` 전환은 별도 티켓(T9)이다.
- ATS 설정과 `eas.json`은 변경하지 않는다.
