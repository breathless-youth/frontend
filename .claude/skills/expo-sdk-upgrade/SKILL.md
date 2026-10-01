---
name: expo-sdk-upgrade
description: "FocusMakers 모노레포(pnpm hoisted)에서 apps/mobile의 Expo SDK를 54에서 57로 올리는 저장소 전용 실행 지침. 작업 순서, hoisted 설치 함정, 바꾸면 안 되는 설정, 검증 명령, 변경 지점 목록(references/touchpoints.md)을 담는다. 범용 OSS 스킬 expo-upgrade 위에 덧씌워 쓰며 둘이 다르면 이 스킬이 우선한다. 'expo 버전 올려', 'SDK 57', 'expo install --fix', 'RN 0.86', 'expo-doctor 경고', 'useIsFocused import 바꾸기', 'jest-expo 올리기', 'eas.json 이미지 고정 제거', 'SDK 문서 갱신', '의존성 정렬 다시', '업그레이드 typecheck 수정', '이전 결과 기반으로 보완', '재실행', '업데이트', '수정' 같은 요청에 반드시 이 스킬을 사용할 것. 패치 파일 재타깃은 pnpm-patch-retarget, 전체 흐름 조율은 expo-upgrade-orchestrator가 맡는다. SDK 58·NativeTabs 이관·NativeWind v5는 범위가 아니다."
---

# Expo SDK 업그레이드 (저장소 전용)

`expo-upgrade-executor`가 BY-803·805·806을 수행할 때 읽는 지침이다. 범용 절차는 OSS 스킬 `.claude/skills/expo-upgrade/SKILL.md`에 있다. 이 문서는 그 위에 이 저장소의 결정과 함정만 더한다. 파일별 변경 지점은 `references/touchpoints.md`에 모았다.

## 먼저 읽을 것

1. `.claude/skills/expo-upgrade/SKILL.md`: 범용 순서와 Hermes V1 경고.
2. `.claude/skills/expo-upgrade/references/react-navigation-to-expo-router.md`: SDK 56부터 `@react-navigation/*`를 직접 import하지 않는 이유.
3. `references/touchpoints.md`: 이번 작업에서 바꿀 파일과 바꾸지 않을 파일 전체.
4. `apps/mobile/CLAUDE.md`: 네이티브 설정을 왜 그렇게 두었는지. 이 문서의 규칙을 깨는 변경은 빌드가 통과해도 허용하지 않는다.
5. `.claude/skills/doc-writing/SKILL.md`: 문서·주석을 고칠 때 문체와 금지 용어.

## 이미 정한 것

사용자가 승인한 결정이다. 다시 묻지 않고 이대로 진행한다.

| 항목 | 결정 |
|---|---|
| 목표 SDK | 57 (`expo ~57.0.26`). 55·56은 Hermes V1 메모리 회귀, 58은 베타라 제외한다 |
| `@react-native-firebase/*` | 26.3.3 유지, messaging 패치도 손대지 않는다. RN 0.86에서 빌드가 깨질 때만 다시 본다 |
| `eas.json` iOS 이미지 | 네 프로필의 `macos-sequoia-15.6-xcode-26.2` 고정을 지운다. SDK 57 기본 이미지가 Xcode 26.2 미만이면 고정을 되살린다 |
| 최소 iOS | 16.4로 오른다. iOS 15 사용자 비율은 고려하지 않는다 |
| NativeWind | v4 유지(`nativewind` 4.2.x, `react-native-css-interop` 0.2.7). v5로 가지 않는다 |
| 범위 밖 | SDK 58, NativeTabs 이관(BY-770), React Compiler 켜기, OSS 스킬의 그 밖의 정리 제안 |

OSS 스킬이 정리를 권해도 빌드에 꼭 필요할 때만 따른다. 필요해서 따랐다면 이유를 보고서에 적는다.

## 작업 순서

오케스트레이터는 이 순서를 두 번에 나눠 호출한다. 모드 `deps`가 1~6단계, 모드 `code-docs`가 7~9단계다.

### 1. 셸 준비

비대화형 셸에서는 `pnpm`이 PATH에 없을 수 있다. `pnpm --version`이 실패하면 스크래치 디렉터리에 셰임을 만든다. `expo install`도 내부에서 `pnpm`을 부르므로 이 단계를 건너뛰면 `ENOENT`가 난다.

```bash
mkdir -p "$SCRATCH/bin"
printf '#!/bin/sh\nexec corepack pnpm "$@"\n' > "$SCRATCH/bin/pnpm" && chmod +x "$SCRATCH/bin/pnpm"
export PATH="$SCRATCH/bin:/opt/homebrew/bin:$PATH"
```

Node는 24(`.nvmrc`)여야 한다. `node --version`으로 확인한다.

### 2. 패치 키 임시 정리

`pnpm-workspace.yaml`의 `patchedDependencies`에서 `react-native-webview@13.15.0`과 `expo-constants@18.0.13` 두 줄을 지운다. 패치 파일은 지우지 않는다. 버전이 바뀌면 pnpm 10은 쓰이지 않는 패치를 오류로 처리해 설치가 멈추기 때문이다. 두 패치는 Phase 3에서 `native-patch-maintainer`가 새 버전 키로 되살린다. messaging 줄은 버전이 같으므로 지우지 않는다. 보고서에 "임시 제거 2건"을 반드시 적는다.

### 3. Expo 본체와 정렬

```bash
pnpm --filter mobile exec expo install expo@~57.0.26
pnpm --filter mobile exec expo install --fix
```

`--fix`가 고치지 않는 항목은 `references/touchpoints.md` 1절 표대로 손으로 맞춘다. `react-test-renderer`, `apps/web`의 `react`·`react-dom`, mobile `typescript`, `react-native-css-interop`이 여기에 해당한다. 버전을 바꾼 뒤에는 저장소 루트에서 `pnpm install`을 한 번 돌린다.

### 4. hoisted 설치 확인

`node-linker=hoisted`라 패키지가 루트 `node_modules`로 올라가고, 버전이 갈리는 패키지만 각 앱 아래에 남는다. 이 구조에서 생기는 문제를 확인한다.

- React 사본이 하나인지 본다. `find node_modules apps/*/node_modules -maxdepth 2 -path '*/react/package.json'`로 찾은 파일의 `version`이 전부 `19.2.3`이어야 한다. 사본이 둘이면 jest와 Metro에서 `Invalid hook call`이 난다. 다른 패키지 아래에 깊이 숨은 사본은 이 명령에 안 잡히므로 `pnpm why react`로 한 번 더 본다.
- `react-native`, `react-native-reanimated`, `react-native-worklets`도 사본이 하나인지 같은 방법으로 본다.
- `@react-native-firebase/*` 네 패키지가 lockfile에서 `26.3.3`으로 해석되는지 `pnpm-lock.yaml`에서 확인한다. `^26.3.3` 범위라 lockfile을 새로 만들면 26.4.x로 올라갈 수 있다. 올라갔으면 네 패키지를 `"26.3.3"` 정확한 버전으로 적어 고정하고 보고서에 적는다.
- `@react-navigation/native`가 설치본에서 사라졌는지 본다. 사라졌다면 5단계가 필수다.

### 5. 소스 import 이관

`useIsFocused`를 `@react-navigation/native` 대신 `expo-router`에서 가져온다. 대상 5개 파일은 touchpoints 3절에 있다. expo-router 57은 react-navigation에 의존하지 않아서 이 단계 없이는 typecheck가 통과하지 않는다. 그래서 테스트 mock 이관(7단계)보다 먼저 한다.

설치된 `node_modules/expo-router/build/exports.d.ts`에 `useIsFocused`가 있는지 먼저 확인한다. 없으면 OSS 참조 문서대로 `expo-router/react-navigation`을 쓰고, 7단계의 mock 대상도 같은 지정자로 맞춘다.

### 6. 1차 검증

```bash
(cd apps/mobile && npx expo-doctor)
pnpm --filter mobile typecheck
pnpm --filter mobile lint
pnpm --filter web typecheck
pnpm --filter web lint
```

- `expo-doctor` 경고는 하나씩 판단한다. 위 "이미 정한 것"에 해당하는 경고(Firebase 버전, NativeWind 등)는 의도된 것으로 보고서에 남기고 고치지 않는다.
- typecheck 오류는 RN 0.86·React 19.2 타입 변화에 맞춰 최소한으로 고친다. 동작을 바꾸는 수정이 필요하면 멈추고 보고서에 적는다.

### 7. 테스트 mock 이관 (BY-805)

touchpoints 3절 표대로 6개 테스트를 고친다. 통째 mock factory(`social.test.tsx`, `tabs-layout.test.tsx`)에 `useIsFocused`를 더하는 것을 빠뜨리기 쉽다. 그다음 `pnpm --filter mobile exec jest <파일>`로 파일 단위로 돌린다.

### 8. 설정 갱신 (BY-806)

- `eas.json` 이미지 고정 제거와 `firebaseConfig.test.ts` 갱신. 기본 이미지 확인 절차는 touchpoints 4절에 있다.
- `metaSdkConfig.test.ts`의 `expo-tracking-transparency` 버전 단언 갱신.
- `app.config.ts`의 plugin 옵션이 57에서도 받아들여지는지 `expo config`로 확인. 방법은 touchpoints 4절에 있다.

### 9. 문서 갱신 (BY-806)

touchpoints 4절 표의 파일을 고친다. 패치 파일명이 나오는 절은 패치 담당 몫이니 건드리지 않는다. 같은 파일을 함께 고치므로 Write로 파일 전체를 다시 쓰지 말고 Edit로 자기 절만 바꾼다.

## 바꾸지 않는 것

touchpoints 5절이 전체 목록이다. 특히 자주 깨지는 것만 다시 적는다.

- `metro.config.js`를 `getDefaultConfig`로 되돌리지 않는다. 빌드와 소스맵 업로드가 성공해도 Sentry 스택트레이스가 압축된 채 남는다.
- `expo-build-properties`의 `forceStaticLinking`에서 `react-native-fbsdk-next`를 빼지 않는다. 빠지면 iOS 빌드가 `_OBJC_CLASS_$_RCTConvert` 미정의 심볼로 깨진다.
- `package.json`에 `expo.autolinking.exclude`를 넣지 않는다. Firebase Analytics 이벤트가 오류 없이 사라진다.
- `npx expo prebuild --clean`으로 만든 `ios/`·`android/`는 gitignore 대상이다. 커밋하지 않는다.
- `.github/workflows/ci.yml`에 `expo-doctor` 단계를 추가하지 않는다.

## 검증 명령 모음

| 목적 | 명령 | 주의 |
|---|---|---|
| 모바일 단일 테스트 | `pnpm --filter mobile exec jest <경로>` | 다른 에이전트가 설치 중이면 모듈을 못 찾는 오류가 날 수 있다. 끝난 뒤 다시 돌린다 |
| 모바일 전체 테스트 | `pnpm --filter mobile test` | 다른 에이전트가 돌고 있을 때는 돌리지 않는다 |
| 웹 단일 테스트 | `pnpm --filter web exec vitest run <경로>` | `pnpm --filter web test -- <경로>`는 필터가 무시된다 |
| 웹 전체 테스트 | `pnpm --filter web test` | 다른 에이전트와 동시에 돌리면 경합으로 타임아웃이 난다 |
| Expo 진단 | `(cd apps/mobile && npx expo-doctor)` | |
| 번들 확인(CI와 같음) | `pnpm --filter mobile exec expo export --platform android` | 산출물 `dist/`는 커밋하지 않는다 |
| lockfile 확인(CI와 같음) | `pnpm install --frozen-lockfile` | 모든 설치가 끝난 뒤 |
| 포맷(CI와 같음) | `pnpm format:check` | `.claude/skills`는 제외 대상이지만 `docs/`·README·`CLAUDE.md`는 검사한다 |

빌드 명령을 `| tail`로 파이프하지 않는다. 종료 코드가 `tail`의 것으로 바뀌어 실패가 성공처럼 보인다. 긴 출력은 파일로 리다이렉트하고 그 파일을 읽는다.

## 보고서 형식

모드별로 `_workspace/`에 하나씩 쓴다. 형식은 같다.

```markdown
# {모드} 보고서

## 상태
모듈 완료 | 차단됨 | 일부 완료

## 버전 변경
| 패키지 | 이전 | 이후 | 근거(--fix·수동·결정표) |

## 바꾼 파일
- 절대경로: 무엇을 왜

## 임시 조치
- 예: patchedDependencies 2줄 임시 제거

## 검증
- 실행한 명령과 종료 코드, 실패면 출력 일부

## 남은 일·질문
```

"통과할 것" 같은 추측은 쓰지 않는다. 돌리지 못한 검증은 "미실행"과 이유를 적는다.
