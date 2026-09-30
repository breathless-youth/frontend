# BY-795 큰 정적 자산 버전 경로와 immutable 캐시 설계

## 목표

- wasm, 모델, 사운드 파일이 두 번째 방문부터 네트워크 요청 없이 캐시에서 열린다.
- 파일 내용이 바뀌면 URL도 바뀌어 옛 파일이 캐시에 남는 일이 없다.
- Vercel에서 바로 효과가 나고, S3·CloudFront로 옮긴 뒤에도 같은 규칙이 그대로 통한다.

## 확정한 결정

| 항목                   | 결정                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| wasm 경로              | `copyMediapipeWasm.js`가 `@mediapipe/tasks-vision`의 `package.json`에서 버전을 읽어 `public/mediapipe/<버전>/wasm/`에 복사한다. 지금 설치본 기준 `/mediapipe/1.0.0/wasm/`이다. `public/mediapipe/` 아래 다른 버전 폴더는 복사 뒤 지운다                                                                                                                                                                   |
| wasm 버전 주입         | `vite.config.ts`가 스크립트의 `MEDIAPIPE_VERSION`을 `__MEDIAPIPE_VERSION__` define으로 넣고, `MEDIAPIPE_WASM_PATH`가 그 값으로 경로를 조립한다. `__WEB_VERSION__`과 같은 방식이다. 상수에 버전을 직접 적는 안은 패키지를 올릴 때 두 곳을 고쳐야 해서 택하지 않았다                                                                                                                                        |
| 모델 경로              | 커밋된 파일명에 내용 해시를 넣어 `efficientdet_lite0_int8-0720bf24.tflite`, `efficientdet_lite0_fp32-40338edf.tflite`로 바꾼다. 해시는 sha256 앞 8자리다. `src`로 옮겨 `?url`로 import하는 안은 URL이 빌드 산출물 안에만 있어 검증 스크립트가 경로를 알 수 없고, 13.8MB가 Rollup 자산 파이프라인을 타서 택하지 않았다. `/models/v1/` 폴더 안은 사람이 올리는 걸 잊으면 옛 모델이 1년 캐시돼 택하지 않았다 |
| 사운드 경로            | 같은 규칙으로 `rain-trp-cefd1558.mp3`, `rain-mm-e7cc0661.mp3`, `cafe-vec-a7724e1d.mp3`로 바꾸고 `catalog.json`의 `file` 값과 `LICENSES.md`의 표를 고친다. 플레이어와 카탈로그 파서는 `file` 값을 그대로 쓰므로 코드 변경이 없다. `catalog.json` 자체는 지금처럼 매번 재검증한다                                                                                                                           |
| 해시 표기              | Vite 산출물과 같은 `이름-해시8.확장자` 꼴이다. `이름`은 그대로 두고 해시만 붙여 catalog의 `id`, 라이선스 표, 애널리틱스 파라미터가 사람이 읽을 수 있게 남는다                                                                                                                                                                                                                                             |
| 가드 테스트            | `public/models/*.tflite`와 `public/sounds/*.mp3`의 파일명 해시를 내용에서 다시 계산해 대조한다. 파일을 바꾸고 이름을 안 바꾸면 실패하고, 실패 메시지가 올바른 이름을 알려준다. `MODEL_PATHS`의 파일이 실제로 있는지도 같이 본다. 스크립트의 `WASM_PUBLIC_DIR`이 `MEDIAPIPE_WASM_PATH`와 같은 폴더 모양인지는 스크립트 테스트가 소스 문자열로 대조한다                                                     |
| 캐시 헤더              | `vercel.json`에 `/mediapipe/(.*)`, `/models/(.*)`, `/sounds/((?!catalog\.json).*)` 세 규칙을 `public, max-age=31536000, immutable`로 추가한다. 사운드 규칙은 `/contact` 예외와 같은 negative lookahead 꼴이라 Vercel에서 이미 검증된 문법이다. `LICENSES.md`도 이 규칙에 걸리지만 앱이 요청하지 않는 파일이라 문제가 없다                                                                                 |
| 헤더 테스트            | `vercelHeaders.test.ts`의 "immutable 캐시는 /assets 밖으로 번지지 않는다"를 허용 목록 4개와 정확히 같은지 보는 검사로 바꾼다. `index.html`을 포함하는 `/(.*)`가 들어오면 여전히 실패한다                                                                                                                                                                                                                  |
| perf 측정 서버         | `scripts/perf/serve.mjs`는 지금처럼 `max-age=0`을 흉내 낸다. 측정 하네스는 매번 재검증하는 최악 조건을 재는 용도라 유지하고, 주석에 운영은 이제 immutable이라고만 적는다                                                                                                                                                                                                                                  |
| 사운드 파이프라인 문서 | `sound-asset-pipeline` 스킬에 해시 파일명 규칙과 계산 명령을 한 줄 추가한다. "CDN이 없어 첫 로드 비용이 그대로 간다"는 문장은 지금도 맞으므로 유지한다                                                                                                                                                                                                                                                    |

## 배경 실측

- 운영은 `/mediapipe/wasm`, `/models`, `/sounds`를 전부 `cache-control: public, max-age=0, must-revalidate`로 내보낸다. `/assets`만 BY-777에서 immutable로 바꿨다.
- wasm은 두 쌍 4개 파일 약 11MB이고 압축 전송은 약 3.4MB다. 모델은 int8 4.6MB, fp32 13.8MB다. 사운드는 3개 3.1MB다.
- 홈 프리페치(BY-766)는 wasm 로더·바이너리·기본 모델을 받아 HTTP 캐시에 넣고, 세션은 같은 URL을 요청해 캐시를 탄다. 캐시 판정은 Resource Timing의 `transferSize`와 `encodedBodySize`로 하며 `vision_detector_ready` 이벤트의 `wasm_cache`·`model_cache`로 나간다.
- 모바일 앱은 원격 URL 웹뷰로 같은 웹 주소를 열므로(`RemoteWebViewHost.tsx`) 브라우저와 웹뷰가 같은 절대 경로와 같은 캐시 헤더를 받는다. 모바일 코드에 자산 경로 리터럴은 없다.
- `@mediapipe/tasks-vision` 1.0.0의 `package.json`은 `exports`에 없어 `require.resolve`로 못 푼다. 대신 `require.resolve("@mediapipe/tasks-vision")`이 가리키는 패키지 루트의 `package.json`을 파일로 읽으면 된다.

## 구성

### wasm

- `copyMediapipeWasm.js`가 `MEDIAPIPE_VERSION`을 읽어 내보내고, `WASM_PUBLIC_DIR`을 `public/mediapipe/<버전>/wasm`으로 바꾼다.
- 복사 뒤 `public/mediapipe/` 바로 아래에서 현재 버전이 아닌 항목을 지우는 함수를 두고, 스크립트 본문에서 호출한다.
- `vite.config.ts`는 `deployDefines`에 `__MEDIAPIPE_VERSION__`을 더한다. 빌드 시작 검사는 바뀐 `WASM_PUBLIC_DIR`을 그대로 쓴다.
- `vite-env.d.ts`에 `__MEDIAPIPE_VERSION__`을 선언한다.
- `visionConfig.ts`의 `MEDIAPIPE_WASM_PATH`가 `/mediapipe/${__MEDIAPIPE_VERSION__}/wasm`이 된다.

### 모델과 사운드

- `git mv`로 다섯 파일의 이름을 바꾼다.
- `MODEL_PATHS`, `catalog.json`, `LICENSES.md`, `measure-prefetch.mjs`의 경로 값을 새 이름으로 고친다.

### 헤더

- `vercel.json`에 규칙 세 개를 더한다.
- `vercelHeaders.test.ts`의 마지막 검사를 허용 목록 비교로 바꾼다.

### 문서

- `copyMediapipeWasm.js`와 `visionConfig.ts`의 주석에서 폴더 경로를 새 구조로 고친다.
- `docs/runbooks/device-web-dev-server.md`와 `task-workflow` 스킬의 `public/mediapipe/wasm/` 언급을 `public/mediapipe/<버전>/wasm/`으로 고친다.
- `sound-asset-pipeline` 스킬 §4 카탈로그 절에 해시 파일명 규칙을 적는다.
- 측정 기록인 `vision-prefetch-measurement.md`와 옛 설계 문서는 당시 기록이라 고치지 않는다.

## 테스트

- 새 `publicAssetHashes.test.ts`가 위 가드 테스트 표의 검사를 한다. 파일 이름을 바꾸기 전에 먼저 써서 실패를 본다.
- 새 `copyMediapipeWasm.test.ts`가 임시 폴더에서 다른 버전 폴더가 지워지고 현재 버전 폴더는 남는지, 그리고 `visionConfig.ts`의 경로 템플릿이 스크립트의 폴더 모양과 같은지 본다. `scripts/__tests__/`의 `resolveApiBase.test.ts`와 같은 자리다.
- `vercelHeaders.test.ts`는 규칙을 더하기 전에 먼저 고쳐 실패를 본다.
- 경로 리터럴을 쓰는 vision 테스트 가운데 실제 경로 매칭에 걸리는 것(`useVisionReadyTracking.test.ts`의 `WASM`, `objectDetector.test.ts`의 Resource Timing 이름)은 `MEDIAPIPE_WASM_PATH`에서 조립하도록 고친다. 함수에 넘기는 임의 경로 픽스처는 그대로 둔다.
- `ambientPlayer.test.ts`와 `catalog.test.ts`는 파서와 실제 폴더를 읽으므로 그대로 통과해야 한다.

## 측정

- 지금은 세션을 열 때마다 wasm 로더·바이너리·모델 3건과 켠 사운드 수만큼 조건부 요청이 나가 304를 받는다.
- 바꾼 뒤에는 재방문 시 이 요청이 0건이어야 한다. 스테이징에 배포된 뒤 `curl -I`로 세 경로의 `cache-control`을 확인하고, 두 번째 세션의 `vision_detector_ready` 이벤트에서 `wasm_cache`·`model_cache`가 `hit`인지 본다.

## 범위 밖

- S3·CloudFront 쪽 헤더와 배포 워크플로는 BY-794·BY-796에서 한다.
- 배포된 주소를 curl로 확인하는 검증 스크립트는 BY-797에서 만든다.
- 사운드 파일 추가와 용량 상한 조정은 BY-683 계획을 따른다.
