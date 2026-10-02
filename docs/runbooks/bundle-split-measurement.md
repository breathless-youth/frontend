# 번들 분리 측정 런북

관측 SDK 지연 로딩과 비탭 라우트 코드 분할 전후로 초기 JS 크기와 로딩 성능을 비교한다. 설계는 `docs/superpowers/specs/2026-09-29-by784-lazy-sdk-route-split-design.md`.

지표

| 지표       | 정의                                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| 초기 JS    | 빌드 manifest에서 `index.html`이 정적 import로 닿는 JS 파일을 모두 더한 raw·gzip 크기                                  |
| Lighthouse | 모바일(devtools 스로틀링), 페이지마다 3회 돌려 점수·FCP·LCP·bootup의 중앙값을 쓴다                                     |
| 세션 진입  | 폰 Chrome에서 `/room/1` 진입 시점의 FCP와 `readyAtMs`. direct(바로 진입)와 via-home(홈을 거쳐 진입) 두 경로로 측정한다 |

## 준비

- 코드를 바꾸기 전에 기준선을 먼저 만든다(`apps/web`에서).

```bash
pnpm perf:build:bundle before
PANEL=1 pnpm perf:build:bundle before-panel
```

- 코드를 바꾼 뒤에는 같은 방식으로 after를 만든다.

```bash
pnpm perf:build:bundle after
PANEL=1 pnpm perf:build:bundle after-panel
```

## 크기 측정

```bash
pnpm perf:measure:bundle before after
```

표와 함께 `.perf/results/bundle-<시각>.json`에 저장된다. 지연 JS 중 가장 큰 8개 파일도 함께 기록된다.

## Lighthouse 측정

```bash
pnpm perf:measure:lighthouse before after
```

`/home?userId=7`과 `/social/join?code=ABCD12`를 대상으로 두 빌드를 번갈아 돌린다. 백엔드 없이 여는 `/home`은 스켈레톤이라 데이터가 채워진 화면의 수치가 아니다. 결과는 `.perf/results/lighthouse-<시각>/summary.{json,md}`에 저장된다.

## 세션 진입 측정 (Android 실기기, 폰 Chrome)

1. 서버 두 개를 띄운다.

```bash
PORT=4630 pnpm perf:serve .perf/dist-before-panel
PORT=4631 pnpm perf:serve .perf/dist-after-panel
```

2. 포트를 연결한다.

```bash
adb reverse tcp:4630 tcp:4630
adb reverse tcp:4631 tcp:4631
adb forward tcp:9222 localabstract:chrome_devtools_remote
```

3. 포트마다 `direct`와 `via-home`을 3회씩 돌린다.

```bash
pnpm perf:measure:room-entry 4630 direct
pnpm perf:measure:room-entry 4630 via-home
pnpm perf:measure:room-entry 4631 direct
pnpm perf:measure:room-entry 4631 via-home
```

카메라 권한은 포트마다 폰에서 처음 한 번 허용해야 한다. 결과는 표준 출력에 JSON 한 줄씩 찍힌다.

데스크톱 CPU 감속은 워커에 걸리지 않으므로 세션 진입 비교에는 쓰지 않는다. 세션 진입 비교는 실기기 결과로만 한다.

### 측정할 때 걸렸던 것

- 빌드를 다시 만들면 측정 서버도 다시 띄운다. 서버가 띄울 때의 파일 목록을 기억해 지워진 옛 엔트리를 계속 내준다.
- 폰 Chrome에는 탭을 하나만 남긴다. 스크립트가 뒤에 있는 탭에 붙으면 이동이 미뤄져 결과가 나오지 않는다.
- 다른 기기나 에뮬레이터가 함께 붙어 있으면 `ANDROID_SERIAL`로 폰을 지정한다.
- Chrome을 처음 띄우면 로그인 안내 화면이 나오므로 먼저 닫아 둔다.

## 측정 결과(2026-09-29)

기준은 dev `d23d037e`로 만든 `before` 빌드다. 두 빌드 모두 가짜 키를 넣은 운영형 빌드다.

### 초기 JS

| 빌드   |    초기 raw | 초기 gzip | 기준 대비 |
| ------ | ----------: | --------: | --------: |
| before | 1,423,531 B | 448,354 B |      기준 |
| after  | 1,014,986 B | 322,373 B |    −28.7% |

### Lighthouse 모바일(devtools 스로틀링, 3회 중앙값)

| 페이지         | 빌드   | 점수 | FCP=LCP | bootup |
| -------------- | ------ | ---: | ------: | -----: |
| `/home`        | before |   78 |  3.86 s | 375 ms |
| `/home`        | after  |   87 |  3.13 s | 357 ms |
| `/social/join` | before |   79 |  3.91 s | 377 ms |
| `/social/join` | after  |   87 |  3.13 s | 356 ms |

백엔드 없이 연 `/home`은 측정 서버가 흉내 낸 통계로 그려진 화면이다.

### 세션 진입(Galaxy A23, 폰 Chrome, 중앙값)

| 진입         | 빌드   |    FCP | 검출기 준비(문서 시작 기준) |
| ------------ | ------ | -----: | --------------------------: |
| 바로 열기    | before | 840 ms |                    3,322 ms |
| 바로 열기    | after  | 729 ms |                    2,871 ms |
| 홈 거쳐 열기 | before | 398 ms |                    2,504 ms |
| 홈 거쳐 열기 | after  | 358 ms |                    2,453 ms |

- before의 바로 열기는 두 번에 나눠 6회 측정했고, after는 3회 측정했다.
- 처음에는 세션 화면도 lazy로 바꿨는데, 이때 세션 진입 FCP가 바로 열기 854→1,088 ms, 홈 거쳐 열기 394→649 ms로 오히려 늘었다.
- 새 문서로 열린 세션 웹뷰가 Suspense 폴백을 먼저 그리고 React 19의 300 ms reveal 스로틀을 기다렸기 때문이다.
- 그래서 세션 화면은 정적 import로 되돌렸고, 위 표는 되돌린 뒤의 결과다.
