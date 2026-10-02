# BY-796 스테이징 웹 배포 워크플로 설계

## 목표

- `dev` 브랜치에 푸시하면 GitHub Actions가 웹을 빌드해 스테이징 S3 버킷에 올리고 CloudFront 캐시를 비운다.
- AWS 인증은 액세스 키 없이 OIDC로 스테이징 배포 역할을 빌려서 한다.
- 2026-10-02에 콘솔로 만든 스테이징 인프라(BY-794)에 손으로 올렸던 순서를 자동화하되, 배포 중 화면이 깨지지 않도록 올리는 순서와 지우는 범위를 정한다.

## 확정한 결정

| 항목           | 결정                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 범위           | 스테이징(`dev` 푸시)만. 운영(`main`)은 운영 버킷·배포·역할이 아직 없어서, 트리거를 넣으면 다음 릴리즈 때 역할을 못 빌려 실패한다. 운영 잡은 컷오버 티켓(BY-798)에서 추가한다                                                                                                                                                                                                                                                                    |
| 트리거         | `push: branches: [dev]`와 수동 실행(`workflow_dispatch`). 수동 실행 버튼은 워크플로 파일이 기본 브랜치(main)에 들어간 뒤에 생기므로 다음 릴리즈 뒤부터 재배포용으로 쓴다                                                                                                                                                                                                                                                                        |
| 머지 전 검증   | 검증 기간에만 push 트리거에 `feature/BY-796-deploy-web-workflow`를 넣고, 스테이징 역할 신뢰 정책의 `sub`에도 같은 브랜치를 잠깐 더한다. 이 브랜치에 푸시하면 실제 배포가 돈다. 확인 뒤 두 곳 모두 `dev`만 남기고 머지한다. 스테이징 DNS가 아직 Vercel이라 사용자 영향은 없다                                                                                                                                                                    |
| GitHub 환경    | 잡에 `environment:`를 쓰지 않는다. 쓰면 OIDC 토큰의 `sub`가 브랜치가 아니라 환경 이름이 되어 신뢰 정책(`ref:refs/heads/dev`)과 맞지 않는다. 값은 저장소 변수(`vars`)와 시크릿으로 둔다                                                                                                                                                                                                                                                          |
| 실행 순서      | 변수·시크릿 검사 → AWS 역할 빌리기 → 설치·빌드 → 업로드 → 무효화. 역할을 빌드보다 먼저 빌려, 신뢰 정책이 틀렸을 때 Sentry 릴리즈만 만들어지고 끝나는 일을 막는다                                                                                                                                                                                                                                                                                |
| 사전 검사      | 변수 다섯 개(인프라 셋, Sentry DSN, Amplitude 키)와 `SENTRY_AUTH_TOKEN` 중 하나라도 비면 시작 단계에서 실패한다. 이 값들은 비어도 빌드가 성공해서, 검사하지 않으면 분석이 꺼지거나 소스맵이 빠진 배포가 오류 없이 나간다                                                                                                                                                                                                                        |
| 빌드           | `VITE_DEPLOY_ENV=preview pnpm --filter web build`. API 주소는 `resolveApiBase`가 `api-dev`로 정한다. 분석 키는 Vercel Preview와 같은 값을 저장소 변수로 넘긴다. GA4 측정 ID는 넘기지 않는다. Vercel Preview에도 비어 있어 스테이징 번들에 GA4 코드가 없었고(2026-10-02 배포 번들에서 확인), 운영 GA4 속성에 스테이징 방문이 섞이지 않게 그대로 둔다                                                                                             |
| 업로드         | 다섯 번에 나눠 올린다. ① `assets/`·`mediapipe/`·`sounds/*.mp3`를 1년 immutable로 sync ② `models/`를 같은 캐시와 `application/octet-stream`으로 sync ③ 나머지(`catalog.json`, `.well-known/assetlinks.json`, 이미지 등)를 `max-age=0, must-revalidate`로 `--delete` sync ④ iOS 유니버설 링크 파일을 `application/json`으로 `cp` ⑤ `index.html`을 맨 마지막에 `cp`. 한 sync 안에서는 파일 순서가 보장되지 않아 `index.html`은 따로 맨 끝에 올린다 |
| 해시 자산 삭제 | ①②에는 `--delete`를 쓰지 않는다. 배포 중에 열려 있던 화면이 옛 `index.html`로 옛 청크를 받으러 오고, 업로드가 중간에 실패해도 지금 배포가 깨지지 않아야 하기 때문이다. 옛 청크는 회당 1MB 안팎이라 쌓여도 비용이 무시할 수준이고, 필요해지면 S3 수명 주기 규칙으로 지운다(인프라 후속)                                                                                                                                                          |
| 캐시 헤더      | Cache-Control 없이 올리면 CachingOptimized가 기본 TTL 24시간을 써서 `index.html`이 엣지에 하루 남는다. 그래서 모든 업로드에 Cache-Control을 붙인다                                                                                                                                                                                                                                                                                              |
| 소스맵         | `.map`은 S3에 올리지 않는다(모든 sync에 `--exclude "*.map"`). 업로드는 Sentry 플러그인이 하고 끝나면 dist에서 지운다. 플러그인은 `SENTRY_AUTH_TOKEN`과 커밋 SHA가 있을 때만 돈다                                                                                                                                                                                                                                                                |
| 릴리즈 이름    | `vite.config.ts`의 커밋 SHA를 `VERCEL_GIT_COMMIT_SHA ?? GITHUB_SHA`로 바꾼다. 없으면 GitHub 빌드의 Sentry 릴리즈가 `local`이 되고 소스맵도 안 올라간다. CI(PR) 빌드는 토큰이 없어 업로드는 그대로 꺼져 있고 릴리즈 값만 SHA가 된다                                                                                                                                                                                                              |
| 무효화         | 업로드 뒤 `/*` 하나를 만들고 완료까지 기다린다. 와일드카드는 경로 1개로 세서 월 1,000건 무료 한도 안이다                                                                                                                                                                                                                                                                                                                                        |
| 동시 실행      | `concurrency: deploy-web-staging`, `cancel-in-progress: false`. 실행 중인 배포는 취소하지 않는다(업로드 도중 멈추면 버킷이 반쯤 바뀐 채로 남는다). 대기 실행은 하나만 남고 더 새 푸시로 바뀌므로, 스테이징에는 항상 최신 커밋이 올라간다                                                                                                                                                                                                        |
| turbo.json     | 손대지 않는다. 배포와 CI 모두 `pnpm --filter web build`로 vite를 직접 불러 turbo를 거치지 않는다. BY-796 완료 조건에서 이 항목을 이유와 함께 뺀다                                                                                                                                                                                                                                                                                               |

## 저장소에 등록할 값

| 종류   | 이름                             | 값                                                                             |
| ------ | -------------------------------- | ------------------------------------------------------------------------------ |
| 변수   | `STAGING_WEB_BUCKET`             | `focus-makers-staging-web-821365066487`                                        |
| 변수   | `STAGING_CF_DISTRIBUTION_ID`     | `EVTIRMO2X37AT`                                                                |
| 변수   | `STAGING_DEPLOY_ROLE_ARN`        | `arn:aws:iam::821365066487:role/focus-makers-staging-gha-frontend`             |
| 변수   | `STAGING_VITE_SENTRY_DSN`        | 스테이징 배포 번들에서 확인한 값(운영과 같은 Sentry 프로젝트)                  |
| 변수   | `STAGING_VITE_AMPLITUDE_API_KEY` | 스테이징 배포 번들에서 확인한 값(운영과 다른 Amplitude 프로젝트)               |
| 시크릿 | `SENTRY_AUTH_TOKEN`              | Sentry에서 새로 만든 조직 토큰(`org:ci`). Vercel 값은 민감 변수라 읽을 수 없다 |

분석 키와 DSN은 번들에 그대로 들어가는 공개 값이라 시크릿이 아니라 변수로 둔다. Vercel 대시보드에서 값이 가려져 있어 배포된 번들에서 꺼냈다. 인프라를 Terraform으로 옮긴 뒤에는 앞의 셋을 `terraform output`(`web_bucket_names`·`cloudfront_distribution_ids`·`github_frontend_role_arns`의 `staging` 키)에서 가져온다.

## 검증

### 로컬 (2026-10-02 수행)

- `actionlint .github/workflows/deploy-web.yml`이 통과한다.
- `VITE_SENTRY_DSN`에 더미 DSN을 넣고 빌드해야 Sentry 초기화 코드가 번들에 남는다. DSN이 없으면 초기화가 통째로 빠져 릴리즈 값을 확인할 수 없다.
- `GITHUB_SHA=0123456789…`를 준 빌드는 번들에 `release:"0123456"`, 주지 않은 빌드는 `release:"local"`이 들어간다(`grep -rhoE 'release:"[^"]+"' apps/web/dist/assets`).
- 토큰 없는 빌드의 `dist`에 `.map`이 0개다.
- `pnpm --filter web typecheck`, `eslint vite.config.ts`, prettier가 통과한다.

### 실제 실행 (feature 브랜치 푸시)

- 잡이 역할을 빌리고 업로드·무효화까지 성공한다.
- `https://d2x37s7obv80p.cloudfront.net`에서 BY-794 7단계 표가 그대로 통과한다(라우트 200·헤더, `/contact` COEP 없음, 모델 200·immutable, 없는 모델 403, `apple-app-site-association` JSON).
- 버킷의 `index.html`이 참조하는 JS 번들이 이 실행의 빌드와 같고, 객체 메타데이터(Cache-Control·Content-Type)가 위 표대로이며, S3에 `.map`이 없다.
- Sentry에 이 커밋 SHA 7자리 릴리즈와 소스맵이 생긴다.
- 결과를 PR 본문 증거 절에 남긴다.

### 머지 전 정리

- push 트리거에서 feature 브랜치 줄을 지운다.
- 신뢰 정책 `sub`를 `dev`만으로 되돌린다.

## 범위 밖

- 운영(`main`) 배포 잡, 운영 인프라, DNS 컷오버, Vercel 제거는 BY-798에서 한다.
- 배포된 주소를 검사하는 스크립트는 BY-797에서 만든다. 이번 검증은 손으로 curl을 돌린다.
- 해시 자산 수명 주기 정리는 인프라 후속으로 남긴다.
- 배포 실패 알림(Slack 등)은 넣지 않는다. GitHub의 실패 메일로 충분하다.
