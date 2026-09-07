# index.html OG 태그와 구 도메인 참조 정리

## 배경

- `apps/web/index.html`의 `og:url`·`og:image`가 폐기 예정인 구 도메인 `web.sunqstudio.kr`을 가리킨다.
- 크롤러는 절대 주소만 읽으므로 구 도메인이 죽으면 초대 링크 미리보기 이미지가 깨지고, 카드에 찍히는 주소가 실제 초대 링크와 어긋난다.
- 구 도메인 참조는 `resolveApiBase.ts`의 웹 프로덕션 API 기본값, `settingsInfo.ts` 주석에도 남아 있다.
- 모바일은 BY-464로 이미 `focusmakers.app`을 운영으로 쓴다. `app.config.ts`의 가드 목록과 `legacyHosts`는 iOS 레거시 빌드와 이미 공유된 링크를 위해 유지해야 한다.

## 결정

- base 브랜치는 `dev`다. 구 도메인이 아직 살아 있어 급하지 않고, 다음 dev→main 릴리즈로 운영에 반영된다.
- `index.html`의 두 OG 주소를 `web.focusmakers.app`으로 바꾼다. `og-image.png`는 `apps/web/public/`에 있어 새 도메인에서도 같이 서빙된다.
- `resolveApiBase.ts`의 production 기본값을 `https://api.focusmakers.app`으로 바꾼다. 가드 목록 `PROD_API_HOSTS`는 신·구 둘 다 유지한다.
- `settingsInfo.ts` 주석의 도메인 표기를 정정한다.
- `app.config.ts`의 가드 목록·`legacyHosts`는 유지하고, 삭제 조건을 주석 한 줄로 남긴다.
- 문서(`docs/`)의 sunqstudio 언급은 그 시점 기록이라 바꾸지 않는다.

## 변경

### apps/web/index.html

- `og:url`을 `https://web.focusmakers.app/`로 바꾼다.
- `og:image`를 `https://web.focusmakers.app/og-image.png`로 바꾼다.

### apps/web/scripts/resolveApiBase.ts

- `API_BY_ENV.production`을 `https://api.focusmakers.app`으로 바꾼다.
- `PROD_API_HOSTS`는 그대로 둔다.

### apps/web/src/features/settings/settingsInfo.ts

- 주석의 `web.sunqstudio.kr`을 `web.focusmakers.app`으로 정정한다.

### apps/mobile/app.config.ts

- 가드 목록·`legacyHosts`는 그대로 두고, 삭제 조건을 주석으로 남긴다.

## 테스트

- `resolveApiBase.test.ts`: 대시보드 값이 없으면 production 기본값이 `https://api.focusmakers.app`이다.
- `indexHtml.test.ts`: index.html에 `sunqstudio` 문자열이 없다. `og:url`·`og:image`가 `web.focusmakers.app`을 가리킨다.

## 위험

- `resolveApiBase.ts`의 production 기본값은 대시보드 `VITE_API_BASE_URL`이 없을 때만 쓰인다. 대시보드에 값이 있으면 런타임은 바뀌지 않는다. 가드가 신·구 둘 다 허용해 도메인 전환 시 대시보드 값만 바꾸면 된다.

## 완료 조건

- `index.html`에 `sunqstudio` 문자열이 없다.
- 웹 프로덕션 빌드의 API 기본값이 `api.focusmakers.app`이다.
- lint, typecheck, test가 통과한다.
