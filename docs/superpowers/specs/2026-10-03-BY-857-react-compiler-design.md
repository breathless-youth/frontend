# BY-857 웹·모바일 React Compiler 켜기 설계

## 배경

- BY-816(모바일 11건)과 BY-849(웹 41건)로 두 앱의 `eslint-plugin-react-hooks` 7 컴파일러 규칙 위반을 정리했다. 남은 것은 웹의 사유 주석 3곳뿐이다.
- `react-compiler-healthcheck` 기준선: 웹 190/190(StrictMode 있음), 모바일 34/34(StrictMode 없음). 측정 장치를 더한 뒤에는 191·35로 센다. 두 앱 모두 비호환 라이브러리 없음.
- `babel-plugin-react-compiler` 1.0.0은 이미 모노레포 루트에 있다(`@expo/metro-runtime`, `@react-native-firebase/analytics` 경유). React 19.2.3이 `react/compiler-runtime`을 제공한다.
- 웹 운영 번들 기준선(2026-10-03, `06083cd8`): JS gzip 합계 382,086바이트, 17개 파일, `react.memo_cache_sentinel` 문자열 1건(React 런타임 자체).

### 목표

- 두 앱에서 컴파일러를 켜고 lint·typecheck·테스트가 그대로 통과한다.
- 컴파일러가 실제로 적용됐다는 증거를 번들에서 확인한다.
- 켜기 전후 수치(웹 번들 gzip, A23 `RoomPage` 커밋 횟수)를 PR에 남긴다.

## 확정 결정

| 번호 | 결정              | 내용                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | 켜는 방식         | 웹은 `vite.config.ts`의 `react()`에 `babel: { plugins: [["babel-plugin-react-compiler", {}]] }`. 모바일은 `app.json`에 `"experiments": { "reactCompiler": true }`. 환경변수 게이트나 annotation 모드는 쓰지 않는다                                                                                                                                                                                                 |
| 2    | 플러그인 옵션     | 빈 객체. `target`은 React 19 기본값, `compilationMode`는 기본(전체)                                                                                                                                                                                                                                                                                                                                                |
| 3    | 의존성            | 웹 devDependencies에 `babel-plugin-react-compiler`를 `1.0.0`으로 고정해 추가한다. 모바일은 프리셋이 가져오므로 추가하지 않는다                                                                                                                                                                                                                                                                                     |
| 4    | 기존 메모이제이션 | `useMemo`·`useCallback`·`memo`는 손대지 않는다. 제거는 후속 티켓                                                                                                                                                                                                                                                                                                                                                   |
| 5    | 옵트아웃          | 오동작하는 컴포넌트만 `"use no memo"`로 빼고 바로 아래에 이유 주석을 단다                                                                                                                                                                                                                                                                                                                                          |
| 6    | 적용 증거         | 웹은 운영 번들에서 `react.memo_cache_sentinel` 문자열 수(기준선 1)를 센다. 모바일은 Metro dev 번들에서 같은 문자열을 센다. babel-preset-expo는 `app.json`의 `experiments`를 직접 읽지 않고 Expo CLI가 매니페스트 번들 URL에 붙이는 `transform.reactCompiler=true` 쿼리로 컴파일러를 켜므로, 확인은 그 쿼리를 포함한 URL(`/apps/mobile/index.bundle?platform=android&dev=true&transform.reactCompiler=true`)로 한다 |
| 7    | 측정 장치         | `App.tsx`에서 `RoomPage` 라우트를 React `<Profiler id="RoomPage">`로 감싸고, `import.meta.env.DEV`일 때만 10초마다와 언마운트 때 커밋 횟수·actualDuration 합계를 `console.info`로 남긴다. 운영 번들에서는 조건이 접혀 제거된다. `LiveRoomPage`는 대상 밖                                                                                                                                                           |
| 8    | 측정 절차         | A23 Dev Client에서 세션 60초(일시정지 없이) 뒤 종료, `chrome://inspect`로 WebView 콘솔의 마지막 요약을 읽는다. 켜기 전(이 브랜치의 Profiler만 넣은 커밋)과 켠 뒤를 같은 절차로 잰다                                                                                                                                                                                                                                |
| 9    | Skeleton          | `apps/mobile/components/ui/Skeleton.tsx`의 shared value 접근을 `.value`에서 `.set()`·`.get()`으로 바꾼다. 저장소 스킬 `expo-animation`이 컴파일러 안전 방식으로 권하는 형태다                                                                                                                                                                                                                                      |
| 10   | 테스트            | 새 단위 테스트는 없다. vitest가 `vite.config.ts`를 공유해 컴파일된 코드로 돌고, jest는 Expo CLI의 URL 쿼리를 거치지 않아 컴파일러가 꺼진 채로 돈다. 모바일의 컴파일된 코드 회귀 판정은 Dev Client 실기기 확인이 맡는다. Profiler 래퍼는 DEV 전용이라 테스트하지 않는다                                                                                                                                             |
| 11   | 배포              | 웹 먼저 `main` 릴리즈, 모바일은 다음 앱 빌드. 설정 변경은 `dev`로 가는 PR 하나                                                                                                                                                                                                                                                                                                                                     |

## 작업 단위

| 순서 | 단위            | 변경                                       | 검증                                                                                   |
| ---- | --------------- | ------------------------------------------ | -------------------------------------------------------------------------------------- |
| 0    | 측정 장치       | `App.tsx` Profiler 래퍼(DEV 전용)          | lint·typecheck·vitest, dev 서버에서 콘솔 요약 확인                                     |
| 1    | A23 기준선 측정 | 코드 변경 없음                             | 60초 세션 커밋 횟수 기록                                                               |
| 2    | 웹 켜기         | `vite.config.ts`, `package.json`, lockfile | lint·typecheck·vitest, 운영 빌드 sentinel 수·gzip, healthcheck 191/191(측정 장치 포함) |
| 3    | 모바일 켜기     | `app.json`, `Skeleton.tsx`                 | lint·typecheck·jest, Metro 번들 sentinel 수, healthcheck 35/35                         |
| 4    | 실기기          | 없음                                       | iPhone 회귀, A23 60초 측정(켠 뒤) + 회귀                                               |

## 컴파일에서 빠지는 함수 (최종 리뷰 실측, babel-plugin-react-compiler 1.0.0 logger)

healthcheck는 191/191·35/35를 보고하지만 플러그인을 직접 돌리면 아래 함수(웹 8·모바일 1)는 건너뛴다. 기본 `panicThreshold`가 `none`이라 빌드 경고 없이 원본 그대로 나간다. 동작은 바뀌지 않지만 컴파일러 효과도 없다.

| 앱     | 함수                                                   | 사유                                                 |
| ------ | ------------------------------------------------------ | ---------------------------------------------------- |
| 웹     | `RoomPage.tsx` `RoomSessionScreen`                     | catch 없는 try(finally)                              |
| 웹     | `useStudyRoomSession`                                  | `??=`와 try/finally                                  |
| 웹     | `LiveRoomSession`                                      | 렌더 중 ref 접근 판정(채널 생성 자리)                |
| 웹     | `useVisionReadyTracking.ts` `useTrackedVisionDetector` | 렌더 중 ref 접근 판정(검출기 생성 자리)              |
| 웹     | `InviteCodeJoinPage`                                   | `exhaustive-deps` 억제 주석(컴파일러 기본 억제 목록) |
| 웹     | `SocialHomePage`                                       | `??=`                                                |
| 웹     | `useAmbientSound`                                      | `??=`                                                |
| 웹     | `useBackgroundGraceWatch`                              | `??=`                                                |
| 모바일 | `app/_layout.tsx`                                      | `??=`                                                |

세션 화면의 몸통(`RoomSessionScreen`·`useStudyRoomSession`)이 빠지므로 이번 측정의 개선폭은 작게 나올 수 있다. `??=`를 풀어 쓰고 try/finally를 나누면 컴파일되지만 이 티켓 범위 밖이다(후속 티켓 후보).

### 측정 지표 해석

컴파일러는 커밋 수(setState 횟수)를 줄이지 않고 한 커밋에서 다시 렌더되는 컴포넌트 수를 줄인다. 그래서 전후 비교의 주 지표는 `actualMs` 합계이고, `commits`는 보조 지표다(비슷하면 정상).

## 바뀌지 않는 것

- 컴포넌트·훅 코드(Skeleton 한 곳 제외), 세션 집계·소셜룸·Vision 로직, 공유 패키지, `eslint.config`.

## 실패 경로

- 컴파일러를 켜고 테스트가 깨지면 깨진 컴포넌트 단위로 원인을 찾고, 코드로 못 풀면 `"use no memo"`와 이유 주석.
- NativeWind와 충돌하면 `babel.config.js` 프리셋 옵션 순서를 조정한다. 해결이 안 되면 모바일만 끄고 티켓과 이 문서에 기록한다.
- 기기 회귀는 해당 화면만 `"use no memo"`.

## 커밋 단위

| 순서 | 커밋                                                                                                       | 범위                                       |
| ---- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 1    | `chore(web): 세션 화면 커밋 횟수를 개발 빌드에서 기록한다 (BY-861)`                                        | `App.tsx`                                  |
| 2    | `build(web): 웹에 React Compiler를 켠다 (BY-858)`                                                          | `vite.config.ts`, `package.json`, lockfile |
| 3    | `build(mobile): 모바일에 React Compiler를 켜고 Skeleton의 shared value 접근을 get·set으로 바꾼다 (BY-859)` | `app.json`, `Skeleton.tsx`                 |
| 4    | `docs: 설계 문서에 React Compiler 켜기를 기록한다 (BY-857)`                                                | 이 문서                                    |

## 범위 밖

- 수동 메모이제이션 제거, Expo SDK 58, `eslint-plugin-react-compiler`, 모바일 StrictMode 도입.
