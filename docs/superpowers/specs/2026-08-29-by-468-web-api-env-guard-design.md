# 웹 API 주소 환경 파생과 운영 오지정 빌드 차단 (BY-468)

- 대상: `apps/web`
- 관련 티켓: BY-468
- 작성일: 2026-08-29

## 배경

웹의 API 주소는 Vercel 대시보드의 `VITE_API_BASE_URL` 자유 입력값이다. 값이 틀리거나 스코프가 잘못 지정돼도 아무것도 걸리지 않고, preview 스코프에는 값이 없어 `/api` 요청이 SPA fallback의 `index.html`을 200으로 받는다. 과거 이 값에 운영 주소가 들어가 개발 트래픽이 운영 DB로 흘러간 사고가 있다.

주소를 사람이 입력하지 않고 빌드 컨텍스트가 결정하게 바꾼다. 환경과 주소가 어긋나면 빌드를 실패시킨다. Vercel은 실패한 빌드를 승격하지 않으므로 실패 모드는 장애가 아니라 배포 거부다.

## 변경 1: 주소 결정 모듈 (`apps/web/scripts/resolveApiBase.ts` 신설)

빌드 타임 순수 모듈이다. `vite.config.ts`가 부르고, vitest가 직접 테스트한다.

### 환경 신호

- `VITE_DEPLOY_ENV`(명시)가 있으면 그것을, 없으면 `VERCEL_ENV`를 쓴다.
- 값이 `production`·`preview`가 아니면 `development`로 본다 (기존 `DEPLOY_ENV` 계산과 동일).
- 명시 신호를 앞에 둔 이유: 운영 웹을 CloudFront로 전환하면 빌드가 GitHub Actions로 넘어가 `VERCEL_ENV`가 없다. 그때 워크플로가 `VITE_DEPLOY_ENV=production`을 주입한다.

### 매핑과 우선순위

- 대시보드(환경변수) `VITE_API_BASE_URL`이 있으면 그 값을 쓴다 (운영 무중단 — 제거는 별도 작업).
- 없으면 매핑: `production` → `https://api.sunqstudio.kr`(현재 운영), `preview` → `https://api-dev.focusmakers.app`, `development` → 빈 값 (로컬은 Vite 프록시 경유).

### 가드 규칙

- 운영 API 호스트 목록: `api.sunqstudio.kr`, `api.focusmakers.app` (신·구 병행).
- `production` 빌드: 결정된 주소의 호스트가 운영 목록에 없으면 throw (빌드 실패). 신·구 어느 쪽이든 허용 — 도메인 전환 날 대시보드 값만 바꾸면 된다.
- 비운영 빌드(`preview`·`development`): 결정된 주소의 호스트가 운영 목록에 있으면 throw. 대시보드 스코프를 "Production and Preview"로 잘못 바꾸는 실수가 여기서 걸린다.
- 호스트 추출 시 URL 파싱이 실패하면 `https://`를 붙여 검사용으로만 재파싱한다 (BY-464와 동일 — 스킴 누락 오타로 가드가 우회되지 않게).
- 파싱 방향은 비대칭이다. `production`은 fail-closed — 호스트를 못 뽑는 값(빈 값 포함)도 운영 목록에 없는 것이므로 throw. 비운영은 차단만 담당하므로 호스트를 못 뽑는 값은 통과한다 (형식 검증은 가드의 일이 아니다).

## 변경 2: `vite.config.ts` 연결

- 기존 `DEPLOY_ENV` 계산을 모듈 호출로 대체하고, `deployDefines`에 `__API_BASE__`를 추가한다.
- `DEV_API_PROXY_TARGET`(BY-452의 fail-loud 프록시 타깃)이 운영 API 호스트를 가리키면 throw — dev 서버 기동이 실패한다. 같은 모듈의 호스트 검사를 재사용한다.

## 변경 3: `src/lib/api.ts`와 타입 선언

- `API_BASE_URL`을 `import.meta.env.VITE_API_BASE_URL ?? ""`에서 `__API_BASE__` define으로 바꾼다. 호출부 3곳은 변경 없다.
- `vite-env.d.ts`에 `__API_BASE__: string` 선언을 추가하고, `ImportMetaEnv`의 `VITE_API_BASE_URL` 선언을 지운다 (이제 런타임 코드가 읽지 않는다).

## 테스트 (`apps/web/scripts/__tests__/resolveApiBase.test.ts` 신설)

- production + 대시보드 값 있음 → 대시보드 값 반환 (운영 무중단 고정).
- preview + 대시보드 값 없음 → `https://api-dev.focusmakers.app`.
- development → 빈 값.
- `VITE_DEPLOY_ENV`가 `VERCEL_ENV`보다 우선한다.
- production인데 주소가 운영 호스트가 아니면 throw (개발 주소·빈 값 각각).
- production에서 신·구 운영 호스트는 둘 다 통과한다.
- preview에서 운영 호스트(신·구 각각)면 throw.
- preview에서 스킴 없는 운영 호스트도 throw.
- 프록시 타깃 검사: 운영 호스트면 throw, 개발 주소는 통과.

## 완료 조건 검증

- preview 실동작(api-dev로 JSON 수신)은 PR preview 배포에서 확인한다.
- Production 무변화는 "대시보드 값 우선" 테스트와 빌드 성공으로 확인한다.

## 범위 밖

- Vercel 대시보드의 `VITE_API_BASE_URL` 제거는 별도 작업이다 (preview 검증 후).
- 웹 운영 도메인(`web.focusmakers.app`) 연결·CloudFront 전환은 별도 티켓이다.
- 로컬 프록시의 미설정 fail-loud는 BY-452에 이미 있다.
