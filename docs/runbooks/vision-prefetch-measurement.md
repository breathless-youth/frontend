# Vision 사전로딩 전후 측정 런북

홈이 통계를 그린 뒤 유휴 시간에 MediaPipe 자원(로더 JS·wasm·모델)을 미리 받는 변경의 효과를 잰다. 같은 커밋을 두 번 빌드해 비교한다.

| 빌드 | 명령                                  | 동작                                                                   |
| ---- | ------------------------------------- | ---------------------------------------------------------------------- |
| 전   | `pnpm --filter web perf:build:before` | `VITE_VISION_PREFETCH=off`라 미리 받지 않는다(변경 전 dev와 같은 동작) |
| 후   | `pnpm --filter web perf:build:after`  | 기본 동작으로, 홈 유휴 시간에 미리 받는다                              |

산출물은 `apps/web/.perf/dist-before`, `apps/web/.perf/dist-after`이고 gitignore 대상이다.

## 측정 빌드가 비우는 값

두 빌드 스크립트는 셸에 무엇이 export돼 있든 아래 값을 빈 문자열로 덮어쓴다. 측정 중 요청이나 이벤트가 운영 도구로 나가지 않게 하기 위해서다.

- `VITE_AMPLITUDE_API_KEY`, `VITE_SENTRY_DSN`, `VITE_GA4_MEASUREMENT_ID`를 비워 Amplitude·Sentry·GA4로 이벤트가 나가지 않는다.
- `VITE_API_BASE_URL`, `VITE_DEPLOY_ENV`를 비워 API 주소가 같은 출처 `/api`로 정해지고, 셸에 `VERCEL_ENV`가 있어도 실제 API 호스트로 매핑되지 않는다.
- `SENTRY_AUTH_TOKEN`을 비워 소스맵 업로드 플러그인이 꺼진다.
- `VITE_PERF_PANEL=1`을 넣어 세션 화면 왼쪽 위에 측정 패널을 띄운다.

그래서 측정 빌드의 API 호출은 모두 측정 서버의 목 응답을 받는다. 목 응답은 `GET /api/stats`, `GET /api/stats/streak`, `GET /api/dday`, `PUT /api/study-sessions/active`뿐이고 나머지 경로는 404다. 진행 중 세션 조회의 404는 "이어받을 세션 없음"이라 정상이다.

## 측정 패널 읽기

| 항목       | 뜻                                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------------- |
| 사전로딩   | 이 빌드가 미리 받는가(`on`/`off`)                                                                   |
| 검출기     | 검출기가 준비되기 전에만 보이고 값은 `준비 전`이다                                                  |
| 로딩→준비  | 검출기가 로딩을 시작해 준비될 때까지다. Amplitude `vision_detector_ready`의 `load_ms`와 같은 값이다 |
| 문서→준비  | 세션 문서가 열린 뒤 준비까지다. 솔로 세션처럼 새 문서로 열렸을 때만 의미가 있다                     |
| wasm, 모델 | 캐시 판정과 이번 요청의 전송량(KB, 반올림)                                                          |

캐시 판정은 Resource Timing에서 본문이 네트워크를 건넌 근거가 있을 때만 `miss`로 본다.

- `miss`는 본문 크기가 0보다 크고 전송량이 그 이상인 경우다.
- `hit`은 그 밖의 경우로, 디스크 캐시(0 B)와 304 재검증(헤더 수백 B)이 여기 든다. WebKit은 304 재검증의 본문 크기를 0으로 주지만 전송량이 있으므로 `hit`이다.
- `unknown`은 항목이 없거나 크기 값이 모두 0인 경우이고, 이때는 서버 로그로 판정한다.

패널은 전송량을 KB로 반올림하므로 304 재검증은 `0 KB`로 보인다. 바이트 단위 값은 같은 측정값을 담은 `window.__visionPerf`에서 읽는다.

## 1. 데스크톱 하네스

### 준비

한 번만 한다.

```bash
pnpm install
pnpm --filter web exec playwright-core install chromium
```

`openssl`이 PATH에 있어야 한다(macOS 기본 포함). HTTP/2용 자체 서명 인증서는 첫 실행 때 `apps/web/.perf/certs/`에 만들어지고 커밋하지 않는다.

### 실행

```bash
pnpm --filter web perf:build:before
pnpm --filter web perf:build:after
pnpm --filter web perf:measure             # variant당 5회
RUNS=1 pnpm --filter web perf:measure      # 빠른 확인
```

| 환경변수        | 기본값  | 뜻                                                     |
| --------------- | ------- | ------------------------------------------------------ |
| `RUNS`          | `5`     | variant당 측정 횟수이고 예열 회차는 세지 않는다        |
| `PERF_PORT`     | `4611`  | 전 서버 포트이고 후 서버는 `PERF_PORT+1`을 쓴다        |
| `HOME_DWELL_MS` | `15000` | 홈 통계가 뜬 뒤 세션으로 넘어가기 전에 머무는 시간(ms) |

### 하네스가 하는 일

- 두 빌드를 HTTP/2(TLS)로 `https://127.0.0.1:4611`(전)과 `4612`(후)에 띄운다.
- 응답 헤더는 Vercel 기본값과 같다(ETag, `public, max-age=0, must-revalidate`, COOP·COEP).
- JS·wasm·모델은 gzip으로 보내며, wasm은 약 3.4 MB가 전송된다.
- 매 회 새 브라우저 컨텍스트에서 다운로드 9 Mbps, 업로드 1.5 Mbps, 요청당 지연 150 ms, CPU 4x 감속을 CDP로 건다.
- 카메라는 Chromium 가짜 장치를 쓴다.
- `/home?userId=7`을 열어 통계가 뜰 때까지 기다린 뒤 `HOME_DWELL_MS`만큼 머물며, 전과 후가 같은 시간을 머문다.
- 같은 탭에서 `/room/1?userId=7`을 새 문서로 열고 측정 패널이 채운 `window.__visionPerf`를 읽는다.
- 한 탭에서 홈과 세션을 이어 여는 이유는 앱에서 탭 웹뷰와 세션 웹뷰가 HTTP 캐시를 나눠 쓰기 때문이다.
- 측정 전에 variant마다 버리는 예열 회차를 한 번씩 돌고, 로그에는 `[before 예열] 버림`이 찍힌다.
- 측정 라운드는 순서를 ABBA로 바꿔 짝수 라운드는 전→후, 홀수 라운드는 후→전으로 돈다.

### 산출물

`apps/web/.perf/results/`에 한 실행당 파일 세 개가 생긴다.

- `prefetch-<시각>.jsonl`은 회차가 끝날 때마다 한 줄씩 덧붙이므로 중간에 멈춰도 앞 회차가 남는다.
- `prefetch-<시각>.json`은 전체 결과이고, 머리에 `revision`(커밋 SHA, 미커밋 변경이 있으면 `-dirty`)과 측정 조건이 들어간다.
- `prefetch-<시각>.md`는 중앙값 표이고, 칸마다 값이 있는 회차 수가 `(n=5)`처럼 붙는다.

### 확인할 것

- 프로토콜이 `h2`인가.
- 후의 wasm·모델 판정이 `hit`, 전은 `miss`인가.
- 표의 `n`이 모두 `RUNS`와 같은가.
- `경고: 홈 체류 ... 안에 사전로딩이 끝나지 않았다`가 찍히지 않았는가.
- 세션 문서 로드→준비가 줄었는가.
- 홈 FCP와 통계 표시가 늦어지지 않았는가(사전로딩은 통계가 뜬 뒤 시작하므로 두 값은 같아야 한다).
- `revision`에 `-dirty`가 붙지 않았는가(발표할 수치는 커밋된 코드에서 잰다).

사전로딩 경고가 찍힌 회차는 JSON에 `prefetchIncomplete: true`가 붙는다. 이 회차는 캐시 이득을 온전히 받지 못했으므로 `HOME_DWELL_MS`를 늘려 다시 잰다.

## 2. 에뮬레이터·시뮬레이터 캡처

앱 셸은 Dev Client를 쓰고 웹만 측정 서버로 돌린다. Dev Client와 `WEB_BASE_URL`의 일반 절차는 [device-web-dev-server 런북](./device-web-dev-server.md), 인스펙터를 붙이는 방법은 [webview-debugging 런북](./webview-debugging.md)에 있다.

### 서버 띄우기

```bash
DELAY=150 RATE_KBPS=9000 pnpm --filter web perf:serve .perf/dist-before
```

| 환경변수    | 기본값 | 뜻                                                     |
| ----------- | ------ | ------------------------------------------------------ |
| `PORT`      | `4610` | 서버 포트                                              |
| `DELAY`     | `0`    | 요청마다 응답 전에 기다리는 시간(ms)                   |
| `RATE_KBPS` | `0`    | 모든 응답이 나눠 쓰는 대역폭 상한이고 `0`은 무제한이다 |

- 웹뷰는 자체 서명 인증서를 믿지 않으므로 이 경로는 HTTP/1.1 평문으로 띄운다.
- `localhost`는 평문이어도 secure context라 카메라가 열린다.
- 서버는 `127.0.0.1`에서만 듣는다.
- 후 빌드로 바꿀 때는 서버를 끄고(Ctrl+C) `.perf/dist-after`로 다시 띄운다.

### 서버 로그 읽기

요청마다 `메서드 경로 상태 바이트 ms`가 한 줄씩 찍힌다. `ms`는 요청을 받은 때부터 본문을 다 보낼 때까지이고 `DELAY`와 전송 시간이 들어간다.

| 경우             | wasm 줄의 모습                                                                    |
| ---------------- | --------------------------------------------------------------------------------- |
| 새로 받음        | `GET /mediapipe/1.0.0/wasm/vision_wasm_internal.wasm 200 3399093B ...`            |
| 304 재검증       | `... 304 0B ...`                                                                  |
| 받다가 끊김      | `... 200 ABORTED 16384B ...`. 끊기기 전까지 보낸 양이라 캐시가 채워진 것이 아니다 |
| 디스크 캐시 적중 | 줄이 아예 없다                                                                    |

모델은 `/models/efficientdet_lite0_int8-0720bf24.tflite`(파일명 해시는 `MODEL_PATHS` 기준, wasm 폴더의 버전은 설치된 패키지 기준)이고 새로 받으면 약 3,417,000B로 찍힌다. SIMD를 못 쓰는 엔진은 wasm 이름이 `vision_wasm_nosimd_internal.wasm`이다.

### Android 에뮬레이터

```bash
adb reverse tcp:4610 tcp:4610
# apps/mobile/.env.local: WEB_BASE_URL=http://localhost:4610
pnpm --filter mobile start      # Metro를 다시 띄워야 WEB_BASE_URL이 반영된다
```

- 에뮬레이터에서 Mac을 가리키는 `http://10.0.2.2`는 쓰지 않는다.
- `10.0.2.2`는 secure context가 아니어서 `getUserMedia`와 COOP·COEP에 의존하는 기능이 실패한다.
- `adb reverse`로 에뮬레이터의 `localhost`를 Mac으로 넘기면 평문이어도 secure context가 된다.
- Android 디버그 빌드는 RN 기본 debug manifest가 `localhost` 평문을 허용하므로 따로 설정할 것이 없다.

### iOS 시뮬레이터

시뮬레이터는 Mac의 `localhost`에 그대로 닿으므로 `adb reverse` 같은 단계가 없다.

```bash
# apps/mobile/.env.local: WEB_BASE_URL=http://localhost:4610
pnpm --filter mobile start
```

- 이 저장소는 iOS ATS 예외를 따로 두지 않고, 시뮬레이터 웹뷰가 `http://localhost`를 여는지는 이 런북을 쓰는 시점에 확인하지 않았다.
- 홈이 뜨지 않으면 서버 로그에 `GET /home` 줄이 찍히는지부터 본다.
- `API_BASE_URL`은 바꾸지 않는다(측정 빌드의 웹 API 호출은 이 값과 상관없이 측정 서버로 간다).

`.env.local`을 고치기 전에 원래 `WEB_BASE_URL` 값을 적어 둔다.

### iOS 시뮬레이터의 가짜 카메라

시뮬레이터에는 카메라 하드웨어가 없다. 세션의 검출기는 첫 카메라 프레임이 와야 로딩을
시작하므로, 카메라가 아예 안 열리면 검출기가 영원히 준비 전 상태로 남아 로딩→준비를 잴 수
없다. 그래서 시뮬레이터 캡처에는 `VITE_FAKE_CAMERA=1`을 얹어 빌드한다.

```bash
VITE_FAKE_CAMERA=1 pnpm --filter web perf:build:before
VITE_FAKE_CAMERA=1 pnpm --filter web perf:build:after
```

두 스크립트 다 이 값을 직접 설정하지 않으므로 앞에 export한 값이 그대로 전달된다. 켜지면
`getUserMedia`가 진짜 카메라 대신 캔버스에 그린 움직이는 도형을 스트림으로 내려준다
(`src/lib/fakeCamera.ts`) — 검출기가 프레임을 받아 로딩을 시작하기만 하면 되므로, 이때
찍히는 검출 결과(표정·자리비움 판정 등)는 의미가 없고 **로딩→준비 시간만 본다.**

Android 에뮬레이터는 이 플래그가 필요 없다. 에뮬레이터의 가상 카메라가 실제로 프레임을
주기 때문이다. 검출기에 들어가는 입력 자체는 두 플랫폼이 다르지만(에뮬레이터는 가상 카메라
영상, 시뮬레이터는 캔버스 영상), 로딩→준비 시간은 자원 다운로드가 지배적이라 입력 내용과는
거의 무관하다 — 그래서 두 조건을 같은 잣대로 비교해도 된다.

### 캐시 비우기(매 캡처 전)

탭 웹뷰와 세션 웹뷰는 HTTP 캐시를 나눠 쓰므로 한 번 비우면 둘 다 비워진다.

Android는 앱을 멈추고 WebView의 HTTP 캐시 폴더만 지운 뒤 다시 연다. Dev Client는 디버그 빌드라 `run-as`로 앱 폴더에 들어갈 수 있다. 로그인 정보와 로컬 저장소는 그대로 남는다.

```bash
PKG=com.breathlessyouth.mobile.dev
adb shell am force-stop "$PKG"
# adb shell은 인자를 한 줄로 이어 보내 따옴표가 사라지므로, 공백이 든 경로는 원격 명령 전체를 한 문자열로 넘긴다.
adb shell "run-as $PKG rm -rf 'cache/WebView/Default/HTTP Cache'"
adb shell "run-as $PKG ls 'cache/WebView/Default/HTTP Cache'" && echo "아직 남아 있다"
adb shell am start -a android.intent.action.VIEW \
  -d "focusmakers-dev://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081" "$PKG"
```

인스펙터의 Network 패널에도 `Clear browser cache`가 있지만 요청 행을 우클릭해야 나오고, 붙어 있는 웹뷰가 없으면 쓸 수 없다.

iOS는 앱을 끄고 WebKit 캐시 디렉터리를 지운 뒤 다시 연다. 개발 빌드의 bundle id는 `com.breathlessyouth.mobile.dev`다.

```bash
xcrun simctl terminate booted com.breathlessyouth.mobile.dev
DATA=$(xcrun simctl get_app_container booted com.breathlessyouth.mobile.dev data) || exit 1
case "$DATA" in
  */CoreSimulator/Devices/*/data/Containers/Data/Application/*)
    rm -rf -- "$DATA/Library/Caches/WebKit" "$DATA/Library/Caches/com.breathlessyouth.mobile.dev/WebKit"
    ;;
  *) echo "앱 컨테이너 경로가 아니다: '$DATA'. 지우지 않는다." ;;
esac
```

앱 경로 조회가 실패하면 `DATA`가 비어 `/Library/...`를 지우게 되므로, 시뮬레이터 앱 컨테이너 경로일 때만 지운다.

비워졌는지는 눈으로 판단하지 않고 서버 로그로 확인한다.

- 전 빌드는 첫 세션에서 wasm·모델이 200과 약 3.4 MB로 찍혀야 한다.
- 후 빌드는 홈에 머무는 동안 wasm·모델이 200과 약 3.4 MB로 찍혀야 한다.
- 후 빌드에서 홈에 있을 때 wasm 줄이 없거나 304라면 캐시가 비워지지 않은 것이므로 다시 비운다.

### 스로틀링

에뮬레이터·시뮬레이터에서는 서버 쪽 `DELAY=150 RATE_KBPS=9000`을 기본으로 쓴다. 세션 웹뷰가 새로 열려도, 루프백이어도 똑같이 걸린다. 걸렸는지는 서버 로그로 확인하며, 9 Mbps면 wasm 한 파일에 약 3초가 걸리고 모델과 겹치면 더 길어진다.

다른 도구는 아래 한계 때문에 보조 수단으로만 쓴다.

- Android `chrome://inspect`의 Network 스로틀은 붙어 있는 웹뷰 한 대에만 걸린다.
- 세션은 새 웹뷰로 열리므로 홈 웹뷰에 건 스로틀은 세션 문서의 요청에 이어지지 않는다.
- `adb reverse` 트래픽은 에뮬레이터 망 조절(`adb emu network speed`)을 거치지 않는다.
- iOS Safari 웹 인스펙터에는 망 조절이 없고, Network Link Conditioner는 Mac 전체에 건다.
- Network Link Conditioner가 루프백에 걸리는지는 확인하지 않았다.

Network Link Conditioner를 쓰려면 먼저 `RATE_KBPS=0`으로 띄워 워터폴의 wasm 전송 시간이 설정 대역폭과 맞는지 본다. 맞지 않으면 서버 쪽 조절로 돌아간다.

에뮬레이터·시뮬레이터는 CPU를 감속하지 않으므로 호스트 CPU를 결과 표에 적는다.

### 캡처 순서

1. 전 빌드로 서버를 띄우고 캐시를 비운다.
2. 앱을 열고 홈 통계가 뜬 뒤 15초 기다린다(iOS 웹뷰는 `requestIdleCallback`이 없어 통계 표시 1.5초 뒤에 사전로딩을 시작한다).
3. 집중을 시작해 세션 화면으로 들어간다.
4. 세션 웹뷰에 인스펙터를 붙인다.
5. 측정 패널에 로딩→준비가 찍히면 캡처한다.
6. 서버를 후 빌드로 바꿔 1~5를 반복한다.

4단계는 플랫폼마다 다르다.

- Android는 `chrome://inspect` 목록에 세션 웹뷰가 뜨자마자 inspect를 눌러 Network 패널을 연다.
- iOS는 Safari 개발자 메뉴에서 시뮬레이터의 세션 페이지를 골라 웹 인스펙터를 연다.
- wasm·모델 요청은 카메라 첫 프레임 뒤에 시작하므로 대개 워터폴에 잡히지만, 놓쳐도 서버 로그에는 남는다.

스크린샷은 명령으로 찍으면 크기가 일정하다.

```bash
adb exec-out screencap -p > before-android.png
xcrun simctl io booted screenshot before-ios.png
```

## 블로그·포트폴리오용으로 남길 것

- 측정 패널 스크린샷(전·후 한 장씩)을 남긴다.
- 전 빌드 네트워크 워터폴에서 wasm·모델이 약 3.4 MB씩 전송되는 장면을 남긴다.
- 후 빌드 워터폴에서 wasm·모델의 Size가 `(disk cache)`이거나 304 응답인 장면을 남긴다.
- 워터폴과 같은 캡처의 서버 로그 wasm·모델 줄을 남긴다.
- 하네스가 만든 `prefetch-<시각>.md` 표를 그대로 남긴다.

숫자에는 항상 아래 조건을 옆에 적는다. 조건이 없는 숫자는 다른 측정과 비교할 수 없다.

- HTTP 버전(하네스는 h2, 에뮬레이터·시뮬레이터는 HTTP/1.1 평문)
- 스로틀 도구와 값
- 기기와 OS 버전
- 커밋 SHA

설계 문서의 배경 수치(첫 세션 문서 로드→준비 8,741 ms)는 지연을 서버 쪽에서 건 이전 실험 환경에서 쟀다. 지금 하네스와 조건이 다르므로 그 숫자와 하네스 숫자를 섞어 전후를 말하지 않는다. 전후 비교는 이 하네스 안에서, 또는 같은 조건의 에뮬레이터·시뮬레이터 캡처끼리만 한다.

## 결과 표에 적는 조건

캡처마다 이 표를 채운다.

| 항목      | 값                                                                   |
| --------- | -------------------------------------------------------------------- |
| 일시      |                                                                      |
| 커밋      | `git rev-parse --short HEAD`(미커밋 변경이 있으면 `-dirty`를 붙인다) |
| 빌드      | 전 / 후                                                              |
| 기기      | 예: Android 에뮬레이터 Pixel 7 API 35, iOS 시뮬레이터 iPhone 17 Pro  |
| 호스트    | Mac 모델·칩                                                          |
| 프로토콜  | HTTP/1.1 평문(에뮬레이터·시뮬레이터) / h2(하네스)                    |
| 망        | `DELAY=150 RATE_KBPS=9000`(서버) 또는 쓴 스로틀 도구와 값            |
| CPU       | 감속 없음(호스트 CPU) / 4x(하네스)                                   |
| 압축      | gzip(wasm·모델 포함)                                                 |
| 홈 체류   | 15초                                                                 |
| 로딩→준비 | ms                                                                   |
| 문서→준비 | ms                                                                   |
| wasm      | 판정, 전송량                                                         |
| 모델      | 판정, 전송량                                                         |

## 되돌리기

- `apps/mobile/.env.local`의 `WEB_BASE_URL`을 원래 값으로 돌리고 Metro를 다시 띄운다.
- Android는 `adb reverse --remove tcp:4610`으로 포트 연결을 푼다.
- 서버를 Ctrl+C로 끈다.
