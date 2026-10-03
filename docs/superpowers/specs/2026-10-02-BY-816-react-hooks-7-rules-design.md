# BY-816 react-hooks 7 컴파일러 규칙 지적 정리 설계

## 배경

- BY-762(Expo SDK 57)에서 `eslint-config-expo` 57이 `eslint-plugin-react-hooks`를 5에서 7로 올렸다. 7은 React Compiler의 분석기를 lint에 넣어 컴파일러가 안전하게 메모할 수 없는 패턴을 오류로 알린다.
- `RemoteScreen.tsx`와 `RemoteWebViewHost.tsx`에서 11건이 잡혀 두 파일 상단에서 규칙을 끄고 넘어갔다. 이 티켓이 그 지시문을 걷어낸다.
- 앱은 React Compiler를 쓰지 않으므로 지금 동작 결함은 없다. 그러나 규칙이 가리키는 패턴은 React가 보장하지 않는 동작에 기대고 있고, 컴파일러를 켜려면 0이어야 한다.

### 목표

- 두 파일 상단의 `eslint-disable` 블록이 사라진다.
- 웹뷰 복원·탭 바 메시지 억제·사망 복구 동작이 바뀌지 않는다. 두 파일의 기존 테스트가 변경 없이 그대로 판정한다.
- 같은 업그레이드로 생긴 모바일 lint 경고 10건도 0으로 만든다.

## 실측 (origin/dev, `eslint --no-inline-config`)

| 파일                    | 규칙                                      | 건수 | 위치                                |
| ----------------------- | ----------------------------------------- | ---- | ----------------------------------- |
| `RemoteScreen.tsx`      | `react-hooks/immutability`                | 3    | 115·122·152행                       |
| `RemoteScreen.tsx`      | `react-hooks/preserve-manual-memoization` | 1    | 145행                               |
| `RemoteWebViewHost.tsx` | `react-hooks/refs`                        | 7    | 223~228행, 전부 `target` useMemo 안 |

- RemoteScreen 4건은 `backLocked`·`darkScreen`·`lastTabBarMessageRef` 선언이 이를 쓰는 `onRecoveryStart`·`onLoadEnd` 콜백보다 뒤에 있어 생긴다. 선언을 콜백 앞으로 옮기면 4건이 전부 사라지는 것을 확인했다.
- RemoteWebViewHost 7건은 `target` useMemo가 렌더 중 `restoreRef.current`를 읽기 때문이다. `retryKey`를 값은 쓰지 않는 의존성으로 넣어 재계산을 유도하는 구조라 `exhaustive-deps` 지시문도 하나 더 달려 있다.

## 확정 결정

| 번호 | 결정                                  | 내용                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | RemoteScreen                          | state·ref 선언을 콜백 앞으로 옮긴다. 로직 변경 없음                                                                                                                                                                                                                                                                                                                                                                                              |
| 2    | RemoteWebViewHost                     | `retryKey` state를 문서 세대 state `doc: { key, baseUrl, restore }`로 바꾼다. 재마운트를 일으키는 두 곳(재시도 버튼, Android 전역 복구 리스너)에서 그 시점의 `restoreRef.current`와 베이스 URL 설정을 읽어 `setDoc`에 싣고, `target`은 `doc`의 `baseUrl`·`restore`만 읽는다                                                                                                                                                                      |
| 3    | `exhaustive-deps` next-line 지시문    | 결정 2로 `retryKey` 의존성이 사라지므로 함께 제거                                                                                                                                                                                                                                                                                                                                                                                                |
| 4    | 테스트의 `require()`                  | `jest.resetModules` 뒤 새 모듈을 읽는 자리다. 이 jest 설정은 동적 `import()`를 `require`로 바꿔 주지 않아(`--experimental-vm-modules` 없이는 실패) `await import()`는 쓸 수 없다. `metaAdsSdk.test.ts`(2곳)는 `jest.requireActual`·`jest.requireMock`으로 바꾼다. 둘 다 모듈 레지스트리를 거쳐 `resetModules` 의도가 유지되고 `no-require-imports`에 걸리지 않는다. `orientation.test.ts`(3곳)는 기존 사유 주석과 지시문이 이미 있어 그대로 둔다 |
| 5    | `typeof import("x")` 타입 표기        | 파일 상단 `import type * as X from "x"`로 바꾼다(7곳)                                                                                                                                                                                                                                                                                                                                                                                            |
| 6    | `lib/orientation.ts`의 lazy `require` | 의도된 지연 로드이고 사유 주석과 next-line 지시문이 이미 있다. 그대로 둔다                                                                                                                                                                                                                                                                                                                                                                       |

## 구조

### RemoteWebViewHost의 문서 세대

```
function readWebBaseUrl(): string | null   // getWebBaseUrl()이 throw하면 null
type RestoreTarget = { path: string; query?: Record<string, string> };
type DocGeneration = { key: number; baseUrl: string | null; restore: RestoreTarget | null };

const [doc, setDoc] = useState<DocGeneration>(() => ({ key: 0, baseUrl: readWebBaseUrl(), restore: null }));

// 재마운트를 일으키는 두 곳만 세대를 올린다. 그 시점의 복원 경로와 베이스 URL을 함께 싣는다.
function nextGeneration(): void  // 핸들러·리스너에서만 호출
  const restore = restoreRef.current;
  const baseUrl = readWebBaseUrl();
  setDoc((d) => ({ key: d.key + 1, baseUrl, restore }));

const { baseUrl, restore } = doc;
target = useMemo(() => baseUrl === null ? null : build(baseUrl, path, query, restore), [path, query, baseUrl, restore]);
<WebView key={doc.key} source={{ uri: target.uri }} />
```

- `restoreRef`는 그대로 둔다. `report-screen` 핸들러가 쓰고, 세대를 올리는 핸들러가 읽는다. 둘 다 이벤트 핸들러라 렌더 중 ref 접근이 아니다.
- 베이스 URL은 초기 state와 `nextGeneration`에서 읽어 세대에 싣는다. 재시도 한 번으로 설정 누락과 로드 실패를 같이 다시 시도하는 기존 의도가 유지되고, `target`에 쓰지 않는 의존성이 필요 없다.
- iOS 프로세스 종료는 지금처럼 `reload()`만 부르고 세대를 올리지 않는다. 바뀌지 않는다.

### 바뀌지 않는 것

- `restoreRef`에 복원 경로를 기록하는 시점(`report-screen` 수신), 복원 경로가 반영되는 시점(재마운트), 전역 복구 채널, `enterRecovery`.
- RemoteScreen의 모든 콜백 본문과 의존성 배열.
- `lib/orientation.ts`의 지연 로드.

## 실패 경로

- 보고된 경로가 없으면 `doc.restore`가 `null`이라 원래 경로로 연다. 기존과 같다.
- 복구 중(`recoveringRef`)에 전역 복구 요청이 또 오면 리스너가 `false`를 돌려주고 세대를 올리지 않는다. 기존과 같다.
- 설정 누락(`getWebBaseUrl` throw)은 `baseUrl`이 null이라 `target === null`로 실패 폴백이 뜨고, 재시도가 세대를 올려 다시 읽는다. 설정이 계속 없으면 `baseUrl`·`restore`가 그대로 null이라 `target`이 같은 `null`이고 `webview_load_failed(config)` 이벤트는 마운트당 한 번만 남는다. 기존과 같다.

## 테스트

### 기존 테스트로 판정하는 것

- `RemoteWebViewHost.test.tsx` 전부. 특히 "렌더러 사망 재마운트는 보고된 경로·쿼리로 연다", "보고가 없으면 재마운트는 원래 경로다", "전역 복구는 복구 중인 호스트를 건너뛴다", "베이스 URL 미설정은 config 사유로 마운트당 한 번만 남긴다".
- `RemoteScreen.test.tsx` 전부.

### 새로 쓰는 테스트

- `RemoteWebViewHost.test.tsx`에 3건. "로드 실패 뒤 다시 시도도 보고된 경로로 연다"는 기존 테스트가 전역 복구 재마운트의 복원만 보고 재시도 버튼 경로는 보지 않아 추가했다. 지금 코드에서도 통과하는 고정 테스트라 리팩토링 전에 넣어 두 구조가 같은 동작임을 잠근다. "설정 누락으로 실패한 뒤 설정이 생기면 다시 시도가 그 베이스 URL로 연다"는 베이스 URL을 읽는 자리가 memo에서 세대 전환으로 옮겨져 그 경로를 잠근다. "iOS 프로세스 종료는 보고된 경로가 있어도 reload만 한다"는 세대를 올리지 않는 결정을 잠근다.

### lint

- `pnpm --filter mobile lint`가 오류 0·경고 0.
- `eslint --no-inline-config`로 두 파일을 돌려도 컴파일러 규칙 오류 0.

## 실기기

- iPhone·Android Dev Client로 탭 전환·바텀시트 열림·설정→문의 이동·앱 재시작 시 탭 바 상태가 이전과 같은지 본다.
- Android에서 `chrome://inspect`나 개발자 옵션 "WebView 렌더러 종료"로 렌더러 사망 복구를 한 번 일으켜 소셜룸 경로가 복원되는지 본다.

## 커밋 단위

| 순서 | 커밋                                                                         | 범위                         |
| ---- | ---------------------------------------------------------------------------- | ---------------------------- |
| 1    | `refactor(mobile): 원격 화면의 state·ref 선언을 콜백 앞으로 옮긴다 (BY-843)` | 선언 이동, 상단 지시문 제거  |
| 2    | `refactor(mobile): 웹뷰 복원 경로를 문서 세대 state로 넘긴다 (BY-844)`       | `doc` state, 지시문 2개 제거 |
| 3    | `chore(mobile): react-hooks 7 업그레이드 경고를 정리한다 (BY-845)`           | 테스트 import 정리           |
| 4    | `docs: react-hooks 7 규칙 정리 설계를 기록한다 (BY-816)`                     | 이 문서                      |

## 범위 밖

- React Compiler 켜기. 조건과 순서는 Jira BY-816의 "React Compiler 메모".
- 웹의 컴파일러 규칙 위반 41건(`eslint-plugin-react-hooks` 5.2라 아직 안 돌고 있다).
