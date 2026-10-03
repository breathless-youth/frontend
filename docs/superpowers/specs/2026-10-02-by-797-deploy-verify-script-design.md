# BY-797 배포 검증 스크립트 설계

## 목표

- 배포된 웹 주소에 직접 요청을 보내 헤더와 SPA 폴백이 의도대로 나오는지 확인한다.
- 인계 문서(`docs/handoff/2026-08-01-by-332-배포와-세션제출-검증.md`)의 `curl -I` 네 줄을 사람이 손으로 돌리던 확인을, 스테이징 배포마다 자동으로 도는 단계로 바꾼다.
- 운영 컷오버(BY-798) 때 같은 스크립트를 운영 주소로 돌려 Vercel과 CloudFront의 동작이 같은지 확인한다.

## 확정한 결정

| 항목                    | 결정                                                                                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 실행 시점               | `deploy-web.yml`의 invalidation 완료 다음 단계에서 스테이징 주소로 자동 실행한다. 실패하면 워크플로가 실패한다. 운영 주소는 BY-798 컷오버 때 손으로 돌린다                                                                                 |
| 구현                    | Node 스크립트(`apps/web/scripts/verifyDeploy.js`)와 내장 `fetch`. 티켓에는 "curl"로 적혀 있지만 목적(배포 주소에 직접 요청)은 같다. 판정 로직을 단위 테스트할 수 있고 wasm 경로를 기존 모듈에서 가져올 수 있어서 골랐다. 새 의존성은 없다  |
| 실행 방법               | `pnpm --filter web verify:deploy <주소>`. 워크플로에서는 `node apps/web/scripts/verifyDeploy.js https://web-dev.focusmakers.app`. 주소는 비밀값이 아니라 워크플로에 직접 적는다                                                            |
| wasm 경로               | `copyMediapipeWasm.js`가 export하는 `MEDIAPIPE_VERSION`과 `WASM_SENTINEL_FILE`로 `/mediapipe/<버전>/wasm/vision_wasm_internal.wasm`을 만든다. 이 모듈은 import만으로 복사를 돌리지 않는다                                                  |
| 모델 목록               | 커밋된 `apps/web/public/models/`의 파일 전부(숨김 파일 제외). 모델이 늘면 확인도 저절로 늘어난다                                                                                                                                           |
| `/assets` 파일          | 배포된 `index.html` 본문에서 `/assets/…js`를 하나 찾아 쓴다. 해시 이름이 배포마다 바뀌어서 고정할 수 없다                                                                                                                                  |
| 요청 방식               | 모든 요청에 `redirect: "manual"`과 `accept-encoding: identity`를 붙인다. Vercel은 압축 요청이 오면 모델을 brotli로 보내면서 HEAD 응답의 `content-length`를 빼서, 압축을 허용하면 크기 확인이 오탐으로 실패한다(구현 중 운영 실행에서 발견) |
| 실패 처리               | 항목이 실패해도 멈추지 않고 끝까지 돈다. 항목마다 `✓`/`✗` 한 줄을 찍고, 실패 줄에는 기대값과 실제값을 적는다. 실패가 하나라도 있으면 종료 코드 1. 네트워크 오류도 그 항목의 실패로 센다                                                    |
| 테스트                  | 판정 함수를 가짜 응답(상태 코드와 헤더)으로 검증한다. 네트워크는 쓰지 않는다. 같은 폴더의 기존 테스트처럼 vitest(`apps/web/scripts/__tests__/verifyDeploy.test.ts`)                                                                        |
| `vercelHeaders.test.ts` | 그대로 둔다. 운영이 아직 Vercel이라 컷오버 전까지 필요하다. 삭제는 BY-798                                                                                                                                                                  |

## 확인 항목

| #   | 요청                                          | 통과 조건                                                 | 근거                                                    |
| --- | --------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------- |
| 1   | `http://<호스트>/` (리다이렉트 따라가지 않음) | 301·302·307·308이고 `Location`이 `https://`로 시작        | 카메라(`getUserMedia`)는 HTTPS에서만 열린다             |
| 2   | `/` (GET)                                     | 200, `text/html`, COOP `same-origin`, COEP `require-corp` | 교차 출처 격리가 없으면 Vision이 단일 스레드로 떨어진다 |
| 3   | `/`                                           | `Cache-Control`에 `immutable`이 없고 `max-age=0`          | `index.html`이 오래 캐시되면 배포해도 옛 화면이 뜬다    |
| 4   | `/room/1`                                     | 200, `text/html`, COOP·COEP 있음                          | 웹뷰가 매번 이 주소로 직접 들어온다                     |
| 5   | `/contact`                                    | 200, `text/html`, COOP·COEP 없음                          | 구글 폼 iframe이 COEP 아래에서 막힌다                   |
| 6   | wasm (HEAD)                                   | 200, `application/wasm`                                   | MIME이 틀리면 스트리밍 로드가 오류 없이 실패한다        |
| 7   | `public/models`의 파일마다 (HEAD)             | 200, `text/html` 아님, `content-length` > 0, `immutable`  | 모델 자리에 HTML이 오면 감지가 오류 없이 멈춘다         |
| 8   | `/models/__verify-missing__.tflite`           | 상태 400 이상                                             | 없는 파일에 HTML 200을 주는 폴백을 잡는다               |
| 9   | `index.html`의 `/assets/…js` (HEAD)           | 200, `immutable`                                          | 해시 자산은 1년 캐시가 맞다                             |
| 10  | `/.well-known/apple-app-site-association`     | 200, `application/json`                                   | 확장자가 없어 폴백이 HTML로 바꾼 적이 있다(BY-794)      |
| 11  | 2~7, 9, 10의 응답                             | `X-Robots-Tag`에 `noindex`                                | 웹뷰 화면이 검색 결과에 잡히면 안 된다                  |

1번(리다이렉트)과 8번(오류 응답)은 CDN이 직접 만드는 응답이라 응답 헤더 정책이 붙는다고 보장되지 않아 11번에서 뺀다.

## 전후 수치

- 지금: 배포 뒤 자동 확인 0개. 인계 문서의 `curl -I` 네 줄을 사람이 돌린다.
- 바뀐 뒤: dev 배포마다 위 항목이 자동으로 돈다(모델 3개 기준 요청 11개, 그중 9개 응답에 noindex 확인 포함).
- 구현 뒤 운영 Vercel(`https://web.focusmakers.app`)에도 한 번 돌려 결과를 남긴다. 완료 조건은 아니고 BY-798 비교 기준으로 쓴다.
- 운영 Vercel 기준값(2026-10-02): 11개 중 10개 통과. 유니버설 링크 파일만 `application/octet-stream`으로 나간다. 스테이징 CloudFront는 `application/json`이다.
- 같은 확인 중에 CloudFront가 wasm(11.5MB)과 모델을 압축하지 않고 보내는 것을 발견했다. Vercel은 brotli로 보내 wasm이 3.2MB다. 컷오버 전에 고칠 일이라 BY-846으로 뺐다.

## 범위 밖

- 운영 주소 통과 확인과 `vercelHeaders.test.ts` 삭제(BY-798).
- 브라우저 실행이 필요한 확인(실제 감지 동작, iframe 렌더링).
