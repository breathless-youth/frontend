# BY-417 CalVer 버전 체계 설계

- 대상: `apps/mobile`, `apps/web`, 저장소 루트 스크립트·CI·문서
- 관련 티켓: BY-417 부모, 하위 BY-633·BY-634·BY-635·BY-636·BY-637, 관련 BY-418·BY-487·BY-586·BY-608
- 작성일: 2026-09-07
- 승인: 2026-09-07 브레인스토밍에서 확정

## 배경

팀은 매주 개발한 것을 그 주에 배포한다. 그런데 앱 버전은 `1.0.2`에 멈춰 있고 웹은 버전 자체가 없다. 버전을 봐도 그것이 언제 나간 것인지 알 수 없고, 사용자가 설정 화면에서 읽어 주는 값과 우리가 배포한 것을 맞춰 보기도 어렵다. 이 설계는 앱과 웹이 같은 주차 번호를 공유하는 CalVer 체계를 세우고, 번호를 올리는 스크립트와 이를 지키는 CI 검사, 사용자에게 보여 줄 라벨까지 함께 정한다.

## 현재 상태

- 앱 버전은 `apps/mobile/app.json`의 `expo.version`이 `1.0.2`이고, 웹은 `apps/web/package.json`의 `version`이 `0.0.0`으로 사실상 비어 있다.
- 빌드 번호는 `eas.json`의 `appVersionSource: remote`와 production 프로필의 `autoIncrement`로 EAS가 원격 관리하며 현재 Android versionCode는 8, iOS buildNumber는 5다.
- `app.json`의 `ios.buildNumber: "1"`과 `android.versionCode: 3`은 원격 관리에서 무시되는 값이라 EAS가 제거를 권고한다.
- 사용자 노출은 `apps/web/src/routes/SettingsPage.tsx`의 `버전 정보` 행 하나이고, 값은 앱 셸의 `apps/mobile/lib/remoteQueryParams.ts`가 `Constants.expoConfig?.version`을 쿼리 `appVersion`으로 실어 보낸 것이다.
- 그 값을 `apps/web/src/features/settings/settingsInfo.ts`의 `appVersionLabel`이 표시하고, 값이 없으면 `UNKNOWN_APP_VERSION_LABEL`인 `알 수 없음`이 나온다.
- `docs/runbooks/release.md`는 저장소 단일 semver 태그 `vX.Y.Z`를 버전의 단일 출처로 적었지만 `v0.1.0` 한 번 뒤로는 쓰이지 않는다.
- `.github/workflows/release.yml`이 그 태그로 GitHub Release를 만들고 `.github/release.yml`이 릴리즈 노트 분류를 설정하며, `.github/workflows/pr-label.yml`이 PR 제목 접두어로 라벨을 붙인다.
- 강제·권장 업데이트 판정은 `apps/mobile/lib/forceUpdate.ts`와 `apps/web/src/features/force-update/version.ts`가 `^\d+\.\d+\.\d+$` 패턴을 검사한 뒤 숫자 세그먼트를 비교하고, 기준값은 Remote Config의 `min_supported_version`과 `latest_version`이다.
- 앱과 웹의 호환 분기는 capability 쿼리인 `share`·`cameraGate`·`nativeUpdateGate`로 하고 버전 번호로 분기하지 않는다.
- Amplitude identify가 `app_version` 사용자 속성으로 같은 값을 보낸다(`apps/web/src/lib/amplitude.ts`).
- 웹 Sentry release 이름은 `vite.config.ts`의 `__RELEASE__`이고 `VERCEL_GIT_COMMIT_SHA` 앞 7자리이며, `vite-env.d.ts`가 `__DEPLOY_ENV__`·`__RELEASE__`·`__API_BASE__`를 선언한다.
- 플랫폼 판별은 `apps/web/src/features/social-room/storeLink.ts`의 `detectStorePlatform(userAgent, maxTouchPoints)`가 `"android" | "ios" | null`을 돌려준다.

## 결정

### 버전 형식

- 기계가 읽는 버전은 플랫폼별 `YY.WW.P` 세 자리 정수이고, 앱의 원천은 `apps/mobile/app.json`의 `expo.version`, 웹의 원천은 `apps/web/package.json`의 `version`이다.
- 두 값은 릴리즈 PR인 `dev` → `main`에서 올린다.
- 주차는 ISO 8601을 따라 월요일에 시작하고 `YY`도 ISO 주 기준 연도를 쓴다.
- 주차가 바뀌면 `P`는 0부터 다시 시작한다.
- `WW`와 `P`에는 0을 채우지 않는다. `27.1.0`이지 `27.01.0`이 아니다. iOS 버전 문자열은 정수 세그먼트로 비교되어 앞자리 0이 안전하지 않다.
- 앱의 `P`는 같은 주차 안에서 몇 번째 스토어 제출인지를 뜻하며 EAS 빌드 번호와 다르다. EAS 번호는 실패한 빌드에도 오르기 때문이다.
- 웹의 `P`는 같은 주차 안에서 몇 번째 `main` 배포인지를 뜻한다.
- 연말과 연초에는 `26.53`과 `27.1`이 섞일 수 있고 이때 `27.1`이 더 최신이다.

### 전환 시점

- 전환은 다음 스토어 제출부터 적용한다. Remote Config의 `latest_version`은 새 빌드가 스토어에 실제로 노출된 뒤 새 형식으로 게시한다. 먼저 게시하면 기존 사용자에게 아직 받을 수 없는 버전의 권장 업데이트가 뜬다.
- `min_supported_version`은 이번에 바꾸지 않는다.
- `26.20.x` 같은 값은 기존 패턴 검사를 그대로 통과하고 숫자 세그먼트 비교에서 `1.0.2`보다 크므로 비교 코드는 변경하지 않는다.
- 첫 값은 이번 주차인 `26.37.0`을 두 파일에 넣고, 실제 주차는 릴리즈 PR에서 `release:bump`를 돌릴 때 확정된다.

### 사용자 노출 라벨

- 라벨 형식은 `YY.WW.<A|I><앱 P>.<웹 P>`이고 예시는 `26.20.A12.20`이다.
- 앱과 웹의 주차가 다르면 `26.19.A3 / 26.20.2`처럼 두 값을 나란히 적는다.
- 앱 버전이 없는 브라우저 단독 접속에서는 웹 버전만 보여 준다.

### 그 밖

- changesets는 도입하지 않는다. CalVer를 지원하지 않고 `app.json`을 인식하지 못하며 릴리즈 노트 자동화는 지금 필요하지 않다.
- 브랜치는 `feature/BY-417-calver-versioning`이고 base는 `dev`다.

## 버전 스크립트

- `scripts/bump-version.mjs`에 순수 함수 `isoWeek(date)`를 두고 `{ yy, ww }`를 돌려준다.
- `nextVersion(current, date)`는 현재 값의 주차가 오늘과 같으면 `P + 1`을, 다르거나 파싱할 수 없으면 `YY.WW.0`을 돌려준다.
- `0.0.0`이나 `1.0.2` 같은 비CalVer 값은 자연히 "다른 주차"로 취급되므로 첫 전환을 위한 별도 분기가 필요 없다.
- CLI 플래그는 `--web`이 `apps/web/package.json`의 `version`을, `--app`이 `apps/mobile/app.json`의 `expo.version`을 올리며 둘을 함께 줄 수 있다.
- 모르는 플래그가 오거나 플래그가 없으면 사용법을 출력하고 종료 코드 1로 끝낸다.
- JSON은 두 칸 들여쓰기와 끝 개행을 유지해 prettier와 같은 형식으로 쓰고, 그 결과 diff가 한 줄로 남는다.
- 테스트는 `scripts/bump-version.test.mjs`에 Node 내장 `node:test`로 쓰고 새 의존성을 넣지 않는다.
- 테스트 케이스는 `26.53`에서 `27.1`로 넘어가는 연말 경계, 같은 주에 다시 돌렸을 때의 `P + 1`, 비CalVer 현재값에서 `YY.WW.0`, ISO 주차 계산 대표값이다.
- 루트 `package.json`에 `release:bump`를 `node scripts/bump-version.mjs`로, `test:scripts`를 `node --test scripts/*.test.mjs`로 추가한다.
- CI quality job이 `pnpm test:scripts`를 돌리며 turbo 태스크로는 만들지 않는다.

## 웹 버전 주입과 라벨

- `vite.config.ts`가 이미 import한 `fs`로 `./package.json`을 읽어 `define`에 `__WEB_VERSION__`을 추가한다.
- `npm_package_version`은 `vite build`를 직접 부르면 비어 있어 쓰지 않는다.
- `vite-env.d.ts`에 `declare const __WEB_VERSION__: string`을 선언하고, `__RELEASE__`가 같은 방식으로 vitest에서도 동작하는 것을 확인했다.
- 라벨 함수 시그니처는 `appVersionLabel(appVersion: string | null, webVersion: string, platform: "android" | "ios" | null)`이다.
- 앱과 웹이 모두 `YY.WW.P`로 파싱되고 주차가 같으며 플랫폼을 알 수 있으면 `YY.WW.<A|I><앱 P>.<웹 P>`를 만든다.
- 앱 버전이 없으면 웹 버전만 돌려준다.
- 주차가 다르거나 플랫폼을 판별할 수 없거나 앱이 `1.0.2` 같은 구형식이면 모두 `<앱> / <웹>` 형태로 돌려준다.
- `UNKNOWN_APP_VERSION_LABEL`은 삭제한다. 웹 버전이 빌드 상수라 항상 있고 둘 다 없는 경우가 생기지 않는다.
- `SettingsPage.tsx`는 쿼리 `appVersion`, `__WEB_VERSION__`, `detectStorePlatform(navigator.userAgent, navigator.maxTouchPoints)`를 라벨 함수에 넘긴다.
- 기존 테스트 `apps/web/src/features/settings/__tests__/settingsInfo.test.ts`를 새 시그니처로 고치고 같은 주차 Android, 같은 주차 iOS, 주차 다름, 앱 버전 없음, 플랫폼 null, 구형식 앱 버전을 덮는다.

## CI 검사와 워크플로 정리

- `scripts/check-version.mjs`가 `bump-version.mjs`의 파서와 비교 함수를 import해 PR의 두 값이 형식에 맞는지, base 대비 올랐는지 검사한다.
- base 값은 `git show <base>:<path>`로 읽는다.
- 웹은 직전 `main`보다 반드시 커야 하고, 앱은 작지만 않으면 통과시켜 앱을 건너뛰는 주를 허용한다.
- 실패하면 어떤 파일의 어떤 값이 왜 문제인지 출력하고 종료 코드 1로 끝낸다.
- `ci.yml`에 `version-check` job을 추가하고 `github.event_name == 'pull_request' && github.base_ref == 'main'`일 때만 돌린다.
- base 값이 아직 CalVer가 아니어도 숫자 세그먼트 비교만 하므로 첫 전환 PR이 통과한다.
- `.github/workflows/release.yml`과 `.github/release.yml`을 삭제한다. 쓰이지 않는 태그를 전제로 한 자동화다.
- `pr-label.yml`은 남기고 주석의 "릴리즈 노트 분류를 잇기 위한 것"이라는 서술만 "PR 목록에서 라벨로 걸러 보기 위한 것"으로 고친다.

## 값 변경과 문서

- `app.json`의 `expo.version`과 `apps/web/package.json`의 `version`을 `26.37.0`으로 바꾼다.
- `app.json`의 `ios.buildNumber`와 `android.versionCode`를 삭제한다. 이 두 키를 단언하는 모바일 테스트는 없다.
- `docs/runbooks/release.md`를 삭제하고 `docs/releases.md`에 "버전 규칙" 절을 추가한다.
- 그 절에는 형식, 주차 기준, 패치 번호의 뜻, 전환 시점, 연말 예외, `release:bump` 사용법, CI 검사 규칙을 담는다.
- 태그 규칙인 `ios/<버전>-<빌드번호>`와 `android/<버전>-<빌드번호>`는 그대로 두고 버전 자리만 CalVer로 바뀐다.
- `docs/screens/SCR-S6-settings.md`의 버전 행 예시를 새 라벨 형식으로 고친다.
- `apps/web/CLAUDE.md`의 define 목록에 `__WEB_VERSION__`을 추가한다.
- `apps/mobile/CLAUDE.md`에 버전 원천이 `expo.version`이고 빌드 번호는 EAS 원격 관리라는 한 줄을 추가한다.

## 티켓 분할

| 티켓   | 범위                                                                                      | 선행           |
| ------ | ----------------------------------------------------------------------------------------- | -------------- |
| BY-633 | `bump-version.mjs`와 테스트, 루트 스크립트, 두 파일의 첫 값 `26.37.0`, `app.json` 키 삭제 | 없음           |
| BY-634 | `__WEB_VERSION__` 주입, `appVersionLabel` 재작성, `SettingsPage` 연결, 테스트 갱신        | BY-633         |
| BY-635 | `check-version.mjs`, `ci.yml`의 `version-check` job, 워크플로 삭제와 주석 수정            | BY-633         |
| BY-636 | `docs/releases.md` 버전 규칙 절, `release.md` 삭제, 화면·CLAUDE.md 문서 갱신              | BY-634, BY-635 |
| BY-637 | 전환 릴리즈와 운영 반영                                                                   | 코드 머지      |

## 기각한 대안

- changesets 도입은 CalVer를 지원하지 않고 `app.json`을 인식하지 못하며 지금 필요한 것이 릴리즈 노트 자동화가 아니라서 기각한다.
- git 태그에서 버전을 유도하는 방식은 Vercel 기본 클론 깊이가 10이라 태그가 보이지 않고 `VERCEL_DEEP_CLONE=true`가 필요해서 기각한다. 파일 두 개를 원천으로 두는 쪽이 더 단순하다.
- 빌드 시점에 버전을 자동 계산하는 방식은 `P`를 상태 없이 계산할 수 없어 기각한다.
- 앱을 매주 반드시 제출하는 규칙은 변경 없는 제출을 만들어 심사 부담만 늘어서 기각한다.

## 범위 밖

- 웹 Sentry release 이름은 커밋 SHA 그대로 두고, 앱 Sentry release는 플러그인이 자동 생성하므로 손대지 않는다.
- 앱과 웹의 호환 분기는 capability 쿼리를 그대로 쓴다.
- 백엔드 `API-Version: 1` 헤더는 이 체계와 무관하다.
- Remote Config `min_supported_version`은 이번에 바꾸지 않는다.
- EAS 빌드 번호 관리 방식은 지금대로 원격에 맡긴다.
- 스토어 제출, Remote Config 게시, Amplitude 대시보드 조정 같은 운영은 코드가 머지된 뒤 BY-637에서 한다.
