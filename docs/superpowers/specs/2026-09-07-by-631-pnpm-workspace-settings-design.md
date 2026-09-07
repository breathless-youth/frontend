# pnpm 설정을 package.json에서 pnpm-workspace.yaml로 이동

## 배경

- 이 저장소는 설치 시점에 라이브러리 코드를 고치는 패치 세 개를 쓴다(`expo-constants`, `@react-native-firebase/messaging`, `react-native-webview`).
- 패치 목록과 빌드 스크립트 허용 목록은 루트 `package.json`의 `pnpm` 필드에 있다.
- 저장소가 고정한 pnpm 10.28.2는 이 필드를 읽지 않는다. 설치할 때마다 `The "pnpm" field in package.json is no longer read by pnpm` 경고가 나온다.
- 지금 패치가 적용되는 이유는 `pnpm-lock.yaml`에 같은 목록이 복사되어 있어서다. 의존성을 추가하면 pnpm이 설정과 lockfile을 비교해 lockfile을 다시 쓰고, 설정이 비어 있으니 목록이 빠진다. 패치는 오류 없이 사라진다.

## 결정

- `onlyBuiltDependencies`와 `patchedDependencies`를 `pnpm-workspace.yaml`로 옮기고 `package.json`의 `pnpm` 필드를 지운다. pnpm 10의 공식 설정 위치다.
- `packageManager` 고정은 그대로 둔다. CI의 `pnpm/action-setup@v4`와 EAS가 이 필드로 버전을 읽는다.
- pnpm 버전을 내리는 방법은 쓰지 않는다. 필드 폐기는 되돌아오지 않는 방향이라 언젠가 같은 작업을 다시 해야 한다.
- 테스트에서 YAML 파서를 새로 들이지 않는다. 문자열 검사로 충분하다.

## 변경

### pnpm-workspace.yaml

- `packages` 아래에 `onlyBuiltDependencies` 배열과 `patchedDependencies` 맵을 `package.json`과 같은 값으로 적는다.
- 이 파일이 설정의 단일 출처라는 한 줄 주석을 둔다.

### package.json

- `pnpm` 필드를 삭제한다.

### `webviewPatch.test.ts`

- 고정 대상을 `package.json`에서 `pnpm-workspace.yaml`로 바꾼다.
- 범위를 패치 세 개 전부로 넓힌다. 이 티켓의 목적이 패치 유실 방지라 셋 다 같은 값이다.
- `package.json`에 `pnpm` 필드가 없다는 단언을 추가한다. 누가 다시 거기에 적으면 무시되므로 테스트가 막아야 한다.
- 웹뷰 패치 내용 단언(`setBackgroundColor`, `RCTUIColorFromSharedColor`)은 유지한다.

## 테스트

- `pnpm-workspace.yaml`이 패치 세 개의 키와 경로를 선언한다.
- `pnpm-workspace.yaml`이 `onlyBuiltDependencies`에 `@sentry/cli`, `esbuild`, `unrs-resolver`를 담는다.
- 루트 `package.json`에 `pnpm` 필드가 없다.
- 패치 파일 세 개가 존재하고, 웹뷰 패치는 배경색 전달 변경을 담는다.

## 검증

- `pnpm install`에서 `pnpm` 필드 경고가 사라진다.
- `pnpm-lock.yaml`을 지우고 다시 설치해도 lockfile의 `patchedDependencies`에 세 개가 남고, `node_modules`의 세 라이브러리에 패치 블록이 있다.
- 재설치로 lockfile이 바뀌면 그 차이도 같이 커밋한다.
- lint, typecheck, test가 통과한다.
