# BY-762 Expo SDK 54 → 57 업그레이드 설계

## 배경·목표

- `apps/mobile`은 Expo Go와 SDK를 맞추려고 SDK 54에 고정돼 있었다.
- 2026-07-28부터 앱이 Expo Go로 뜨지 않고 Dev Client로만 돌아서 그 고정 사유가 사라졌다.
- SDK 55·56은 Hermes V1 메모리 회귀가 있고 SDK 58은 베타라서 목표는 SDK 57이다.
- 스크린타임 iOS 스파이크(BY-743)보다 먼저 끝내서 새 네이티브 작업을 SDK 57 위에서 시작한다.

### 목표

- `apps/mobile`이 SDK 57 번들 버전으로 정렬되고 lint·typecheck·test·`expo-doctor`·Android export가 통과한다.
- pnpm 패치 3개가 새 버전에 적용돼 iOS 탭 바 위 흰 줄, FCM 토큰 실패, 앞으로가기 스와이프 문제가 돌아오지 않는다.
- 실기기 체크리스트, EAS staging 빌드, Sentry 스택트레이스가 SDK 54 때와 같게 동작한다.

## 범위·범위 밖

### 범위

| 패키지                                             | 현재                          | 목표                                     |
| -------------------------------------------------- | ----------------------------- | ---------------------------------------- |
| `expo`                                             | `~54.0.36`                    | `~57.0.26`                               |
| `react-native`                                     | `0.81.5`                      | `0.86.3`                                 |
| `react`, `react-dom`, `react-test-renderer`        | `19.1.0`                      | `19.2.3`                                 |
| `expo-router`                                      | `~6.0.24`                     | `~57.0.24`                               |
| `react-native-reanimated`, `react-native-worklets` | `~4.1.7`, `0.5.1`             | `4.5.1`, `0.10.1`                        |
| `react-native-screens`                             | `4.16.0`                      | `~4.26.0`                                |
| `react-native-safe-area-context`                   | `~5.6.2`                      | `~5.7.0`                                 |
| `react-native-webview`                             | `13.15.0`                     | `13.16.1`                                |
| `react-native-svg`                                 | `15.12.1`                     | `15.15.4`                                |
| `@sentry/react-native`                             | `~7.2.0`                      | `~7.11.0`                                |
| `@expo/metro-runtime`                              | `~6.1.2`                      | `~57.0.16`                               |
| `jest-expo`                                        | `~54.0.17`                    | `~57.0.5`                                |
| `babel-preset-expo`, `eslint-config-expo`          | `~54.0.12`, `~10.0.0`         | `--fix` 결과(`~57.0.13`, `~57.0.2` 예상) |
| 그 밖의 `expo-*` 15개                              | 54 계열                       | `bundledNativeModules`의 `~57.0.x`       |
| `typescript` (mobile)                              | `~5.9.3`                      | `~6.0.3`                                 |
| `nativewind`, `react-native-css-interop`           | `^4.2.1`(해석 4.2.6), `0.2.6` | `^4.2.7`, `0.2.7`                        |
| `@types/react`                                     | `~19.2.17`                    | 유지(권장 범위 `~19.2.4`를 이미 만족)    |
| `apps/web`의 `react`, `react-dom`                  | `19.1.0`                      | `19.2.3`                                 |

- 패치 3개의 키와 고정 테스트, 패치 파일명을 적은 주석·문서를 새 버전에 맞춘다.
- `useIsFocused` import 5곳과 테스트 mock 6곳을 `expo-router` 기준으로 바꾼다.
- `eas.json` iOS 이미지 고정, 버전 고정 테스트 2개, `apps/mobile/CLAUDE.md`, README 두 개, 런북 두 개를 고친다.
- 업그레이드 하네스(에이전트 3개, 스킬 3개, 루트 `CLAUDE.md` 안내)와 이 설계 문서를 같은 브랜치에 커밋한다(계획 문서는 gitignore 대상이라 커밋하지 않는다).

### 범위 밖

- NativeTabs 전환은 BY-770에서 한다.
- NativeWind v5와 Tailwind v4 전환은 하지 않는다.
- SDK 58은 베타라 보지 않는다.
- React Compiler 켜기와 OSS `expo-upgrade` 스킬의 그 밖의 정리 제안은 따르지 않는다.
- CI는 고치지 않고 `expo-doctor` 단계도 추가하지 않는다.
- `@react-native-firebase/*`를 26.4.x로 올리지 않는다.
- `eas-build-pre-install`의 `brew install cmake` 같은 예전 잔재는 이번에 정리하지 않는다.

## 결정표

| 항목                       | 결정                                                                                                                                    | 이유                                                                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 정렬 방식                  | `expo install` 한 번과 `--fix`로 일괄 정렬하고 실패를 하나씩 고친다                                                                     | Expo가 검증한 조합은 SDK 57 번들 목록 하나뿐이다                                                                                                        |
| `@react-native-firebase/*` | 26.3.3 유지, lockfile이 26.4.x로 해석하면 `"26.3.3"`으로 정확히 고정한다                                                                | messaging 패치가 26.3.3 키에 묶여 있고 26.4.0 변경 기록에 패치 내용이 없다                                                                              |
| webview 패치               | 13.16.1로 재타깃한다                                                                                                                    | 13.16.0·13.16.1 변경은 Android `setIgnoreErrFailedForThisURL` 되돌림, iOS 인라인 CPP 연산자, iOS nil `NSString` SIGABRT 수정뿐이다                      |
| webview 패치 범위          | 배경색 전달과 앞으로가기 제스처 차단 hunk를 둘 다 유지한다                                                                              | Fabric 배경색 전달과 BY-775 앞으로가기 차단은 업스트림에 없다                                                                                           |
| expo-constants 패치        | 해석 버전(57.0.20)으로 재타깃하고, 깨끗이 적용되지 않으면 뗀다                                                                          | 경로 공백 대비 예방용이다. 57.0.20 podspec은 같은 두 줄을 인용 없이 유지한다                                                                            |
| `eas.json` iOS 이미지      | 네 프로필의 `macos-sequoia-15.6-xcode-26.2` 고정을 지운다                                                                               | SDK 57 기본 이미지가 `macos-tahoe-26.5-xcode-26.6`이라 Firebase 12.12+가 요구하는 Xcode 26.2 이상을 만족한다. 실행 시점에 26.2 미만이면 고정을 되살린다 |
| `firebaseConfig.test.ts`   | "모든 프로필이 Xcode 26.2 이미지" 단언을 "어떤 프로필도 `ios.image`를 고정하지 않는다"로 바꾼다                                         | 고정을 지우면 기존 단언이 실패한다                                                                                                                      |
| `metaSdkConfig.test.ts`    | `expo-tracking-transparency` 범위 `~6.0.8`을 SDK 57 범위로 바꾼다                                                                       | 번들 버전 범위를 고정하는 테스트다                                                                                                                      |
| 최소 iOS                   | 16.4로 오르는 것을 받아들인다                                                                                                           | iOS 15 사용자 비율은 고려하지 않기로 했다                                                                                                               |
| `useIsFocused`             | 소스 5곳이 `expo-router` 루트에서 가져온다                                                                                              | expo-router 57.0.24의 `build/exports.d.ts`가 내보내고, `@react-navigation/native`는 선언된 의존성이 아니다                                              |
| 테스트 mock 6곳            | mock 대상을 `expo-router`로 바꾸고 통째 mock 2곳은 factory에 `useIsFocused`를 더한다                                                    | import 지정자와 mock 지정자가 같아야 mock이 걸린다                                                                                                      |
| `apps/web` React           | 19.2.3으로 맞춘다                                                                                                                       | hoisted 설치라 React 사본이 둘이면 `Invalid hook call`이 난다                                                                                           |
| NativeWind                 | `nativewind` 4.2.7과 `react-native-css-interop` 0.2.7                                                                                   | nativewind 4.2.7이 css-interop 0.2.7에 정확히 의존해서 직접 의존성도 맞춰야 사본이 하나다                                                               |
| `apps/mobile/CLAUDE.md`    | "SDK 54 고정, 업그레이드 제안 금지"를 "SDK 57 고정, 다음 업그레이드는 티켓으로만"으로 바꾸고 링크를 v57.0.0으로 고친다                  | 고정 취지는 유지하고 번호만 현재에 맞춘다                                                                                                               |
| README·런북                | README 두 개의 SDK·RN·Router 번호, `expo-go-connection.md`의 SDK 줄, `local-dev-build.md`의 낡은 패치 문장과 배포 타깃 16.4 절을 고친다 | 문서 번호가 `package.json`과 어긋나면 QA가 실패로 잡는다                                                                                                |
| 하네스                     | 같은 브랜치에 커밋한다                                                                                                                  | 다음 SDK 업그레이드에서 그대로 다시 쓴다                                                                                                                |

## 접근 방식 비교

| 안             | 방법                                                                   | 판단                                                                                                   |
| -------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| A. 일괄 정렬   | `expo install expo@~57.0.26` 뒤 `--fix`로 한 번에 맞추고 실패를 고친다 | 택했다. 검증된 조합 하나로 바로 가고, 실패가 한 곳에 모인다                                            |
| B. 단계 정렬   | 55, 56을 거쳐 57로 간다                                                | 택하지 않았다. 중간 조합은 Expo가 보장하지 않고 55·56은 Hermes 회귀까지 있으며 검증 시간이 두 배다     |
| C. 새 스캐폴드 | SDK 57 템플릿을 새로 만들고 코드를 다시 붙인다                         | 택하지 않았다. `app.config.ts` 가드, config plugin, 패치 3개, metro·babel 구성을 전부 다시 붙여야 한다 |

## 실행 구조

하네스는 `expo-upgrade-orchestrator` 스킬이 조율하고 `task-workflow` 5단계 안에서 돈다.

| Phase | 담당                                  | 하는 일                                                       | 하위 티켓   |
| ----- | ------------------------------------- | ------------------------------------------------------------- | ----------- |
| 1     | 리더                                  | 브랜치와 선행 PR 확인, `decisions.md`·`prerequisites.md` 작성 | BY-762      |
| 2     | `expo-upgrade-executor` (`deps`)      | 패치 키 임시 정리, 의존성 정렬, `useIsFocused` 소스 import    | BY-803      |
| 3     | `native-patch-maintainer`             | 패치 재타깃, 패치 키, 고정 테스트, 패치 파일명 주석·문서      | BY-804      |
| 3     | `expo-upgrade-executor` (`code-docs`) | 테스트 mock, `eas.json`, 버전 고정 테스트, 문서               | BY-805, 806 |
| 4     | `upgrade-qa`                          | 모듈마다 M1~M4, 마지막에 M5 통합                              | 전부        |
| 5     | 사용자                                | 로컬 Dev Client 빌드, 실기기 체크리스트, EAS staging, Sentry  | BY-807      |
| 6     | 리더                                  | 요약, 커밋 계획, 채점, 승인 뒤 커밋                           | BY-762      |

- Phase 3의 두 에이전트는 QA M1이 통과해 lockfile 해석이 정해진 뒤에 병렬로 돈다.
- `pnpm install`과 `pnpm patch-commit`은 Phase 3에서 패치 담당만 돌린다.
- `useIsFocused` 소스 import는 Phase 2에서 바꾼다. expo-router 57이 react-navigation에 의존하지 않아 바꾸지 않으면 typecheck가 통과하지 않는다.

### 커밋 단위

| 순서 | 커밋 제목                                                                           | 담당              | 내용                                                                                                                                                                                                                                                           |
| ---- | ----------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `chore(mobile): expo sdk 57로 올리고 pnpm 패치를 새 버전에 맞춘다 (BY-803, BY-804)` | executor, patcher | `package.json` 두 개, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `patches/`(옛 패치 2개 삭제, 새 패치 2개 추가), `webviewPatch.test.ts`, `RemoteWebViewHost.tsx`와 그 테스트, `useIsFocused` 소스 5곳, `TabBar.tsx`, `session-room.test.tsx`, `RemoteScreen.tsx` |
| 2    | `test(mobile): useIsFocused mock을 expo-router로 바꾼다 (BY-805)`                   | executor          | 탭 화면 테스트 6개, `orientation.test.ts`, `jest.config.js`, `jest/mockWorklets.js`                                                                                                                                                                            |
| 3    | `chore(mobile): eas 이미지 핀을 지우고 sdk 57 버전 범위를 고정한다 (BY-806)`        | executor          | `eas.json`, 버전 고정 테스트 2개                                                                                                                                                                                                                               |
| 4    | `docs: sdk 57 기준으로 문서를 갱신한다 (BY-806)`                                    | executor          | `apps/mobile/CLAUDE.md`, README 두 개, 런북 두 개                                                                                                                                                                                                              |
| 5    | `chore: expo 업그레이드 하네스를 추가한다 (BY-762)`                                 | 리더              | `.claude/` 에이전트 3개와 스킬 3개, 루트 `CLAUDE.md`, 이 설계 문서                                                                                                                                                                                             |

- 커밋 제목은 commitlint `subject-case` 때문에 한글이나 소문자로 시작한다.
- 커밋 1 하나로 설치·타입체크·lint가 통과한다.
- 의존성과 패치 키·패치 파일은 lockfile이 서로를 가리키므로 커밋 1에 함께 둔다.
- RN 0.86 타입 대응(`TabBar.tsx`, `session-room.test.tsx`)과 `RemoteScreen.tsx`·`RemoteWebViewHost.tsx`의 eslint 예외 지시문도 커밋 1에 넣는다.
- `eas.json`과 버전 고정 테스트는 `chore` 커밋 3에, 문서는 `docs` 커밋 4에 나눠 넣는다.
- `apps/mobile/eslint.config.mjs`는 origin/dev와 같아 어느 커밋에도 넣지 않는다.
- 두 에이전트가 함께 고치는 `apps/mobile/CLAUDE.md`와 `local-dev-build.md`는 통째로 커밋 4에 넣는다(hunk를 나누는 `git add -p`는 비대화형 셸에서 쓸 수 없다).
- 계획 문서는 gitignore 대상이라 커밋 5에 넣지 않는다.
- 커밋은 `task-workflow` 5-2 승인과 7-0 외부 채점이 끝난 뒤에만 하고, 푸시는 따로 승인받는다.

### 머지 시점

- 브랜치 작업은 지금 시작한다.
- dev 머지는 PR #219(dev → main 26.40.0 릴리즈)가 머지되고 그 SDK 54 production 빌드가 나간 뒤에 한다.
- PR #179(BY-697)는 `apps/mobile/package.json`에 `expo-haptics`를 더한다. 먼저 머지되면 이 브랜치를 rebase하고 `expo-haptics`를 `~57.0.3`으로 맞춘다.

## 검증

### 명령

- `pnpm --filter mobile lint`, `pnpm --filter mobile typecheck`, `pnpm --filter mobile test`
- `pnpm --filter web lint`, `pnpm --filter web typecheck`
- 웹 테스트는 파일 단위로 `pnpm --filter web exec vitest run <파일>`을 쓰고, 전체 스위트는 다른 에이전트가 돌지 않을 때만 돌린다.
- `(cd apps/mobile && npx expo-doctor)`
- `pnpm --filter mobile exec expo export --platform android` (CI와 같다)
- `pnpm install --frozen-lockfile`, `pnpm format:check` (CI와 같다)

### 경계면 대조

- 패치 키와 `pnpm-workspace.yaml`, lockfile의 `patch_hash`, `webviewPatch.test.ts` 문자열이 같은 버전을 가리킨다.
- `eas.json`의 각 프로필과 `firebaseConfig.test.ts` 단언이 같은 의도를 말한다.
- 소스의 `useIsFocused` import 지정자와 테스트의 `jest.mock` 지정자가 같다.
- README·런북·`apps/mobile/CLAUDE.md`의 번호가 `package.json`과 `patches/` 실제 값과 같다.

### 실기기 (BY-807)

- iOS·Android 로컬 Dev Client를 새로 빌드한다.
- iOS에서 FCM 토큰이 발급된다.
- 다크 모드 웹뷰 배경이 테마 색이고 탭 바 위 흰 줄이 없다.
- 싱글룸·소셜룸만 회전하고 나머지 화면은 세로로 잠긴다.
- 스킴 딥링크와 App Link·Universal Link가 열린다.
- 강제 업데이트 게이트가 `min_supported_version`에 맞게 뜬다.
- iOS에서 앞으로가기 스와이프가 막히고 뒤로 스와이프 미리보기는 보인다.
- EAS staging 빌드가 성공하고 Sentry 스택트레이스가 원본 소스 위치로 풀린다.
- 이 티켓은 성능이나 사용량 수치를 바꾸는 작업이 아니라 AS-IS/TO-BE 측정값을 두지 않는다.

## 실패 경로

| 상황                                             | 대응                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `expo install --fix`가 peer 의존성 충돌로 멈춘다 | 충돌한 패키지와 요구 범위를 보고하고 멈춘다                                                 |
| 패치가 새 버전에 적용되지 않는다                 | 업스트림 diff로 유지·제거를 판정하고 결론과 근거를 보고서에 남긴다                          |
| RN 0.86·React 19.2 타입 오류                     | 코드로 고친다. `any`와 `ts-ignore`는 쓰지 않는다                                            |
| 동작을 바꿔야만 고쳐지는 오류                    | 고치지 않고 "차단됨"으로 보고한다                                                           |
| lockfile이 Firebase를 26.4.x로 해석한다          | 네 패키지를 `"26.3.3"`으로 정확히 고정한다                                                  |
| React 사본이 둘이다                              | `apps/web`과 `react-test-renderer` 번호를 맞추고, 그래도 남으면 `pnpm why react`를 보고한다 |
| SDK 57 기본 이미지가 Xcode 26.2 미만이다         | 이미지 고정과 원래 단언을 되살린다                                                          |
| QA 같은 모듈이 두 번 실패한다                    | 재시도를 멈추고 양쪽 값과 선택지를 사용자에게 보인다                                        |
| 실기기 항목 하나가 실패한다                      | 그 항목에 걸린 하위 작업만 다시 돌리고 그 항목만 다시 확인받는다                            |

## 참고

- Jira: BY-762(상위), BY-803 의존성 정렬, BY-804 패치, BY-805 `useIsFocused`·mock, BY-806 설정·문서, BY-807 실기기 검증
- 관련 티켓: BY-770 NativeTabs, BY-775 앞으로가기 스와이프 차단, BY-697 `expo-haptics`(PR #179), PR #219 dev → main 릴리즈
- 런북: `docs/runbooks/local-dev-build.md`, `docs/runbooks/expo-go-connection.md`
- 하네스: `.claude/skills/expo-upgrade-orchestrator/SKILL.md`, `.claude/skills/expo-sdk-upgrade/SKILL.md`, `.claude/skills/expo-sdk-upgrade/references/touchpoints.md`, `.claude/skills/pnpm-patch-retarget/SKILL.md`
- 에이전트: `.claude/agents/expo-upgrade-executor.md`, `.claude/agents/native-patch-maintainer.md`, `.claude/agents/upgrade-qa.md`
- 계획: `docs/superpowers/plans/2026-10-01-BY-762-expo-sdk-57-upgrade.md`
