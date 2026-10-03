# BY-798 운영 웹 CloudFront 전환 설계

## 목표

- 운영 웹 `web.focusmakers.app`을 Vercel에서 S3 + CloudFront로 전환한다.
- 전환 뒤 문제가 생기면 몇 분 안에 Vercel로 되돌릴 수 있게 한다.
- 스테이징(2026-10-02 전환)에서 검증한 구성(헤더 정책, SPA 폴백 함수, 사전 압축, 배포 검증)을 그대로 쓴다.

## 확정한 결정

| 항목                | 결정                                                                                                                                                                                                                                                                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 전환 시점           | 운영을 준비한 뒤 며칠 동안 스테이징에 배포를 몇 번 더 쌓고 STG 앱으로 세션 흐름을 써 본 다음 DNS를 바꾼다. 티켓의 1~2주 관찰을 줄이는 대신 전환 뒤 일주일 동안 Vercel에 `web.focusmakers.app`을 남겨 되돌릴 길을 지킨다                                                                                                                                   |
| `web.sunqstudio.kr` | Vercel에 그대로 둔다. `vercel.json`과 `vercelHeaders.test.ts`는 지우지 않는다                                                                                                                                                                                                                                                                             |
| 운영 인증서         | `*.focusmakers.app` 와일드카드. `web.focusmakers.app`은 Vercel CNAME이라 CAA가 Amazon을 허용하지 않는데(`letsencrypt.org`, `pki.goog`, `sectigo.com`, `globalsign.com`만 허용), 와일드카드는 CAA를 루트 `focusmakers.app`에서 확인하고 루트에는 CAA가 없다. 스테이징처럼 `web` 레코드를 잠깐 바꾸는 우회는 운영 웹과 앱 전체가 몇 분 멈추므로 쓰지 않는다 |
| 인증서 대가         | 인증서가 모든 하위 도메인에 유효하다. 키는 ACM 밖으로 나가지 않는다                                                                                                                                                                                                                                                                                       |
| infra 변경          | `web_sites`의 객체에 선택값 `cert_domain`을 더한다. 값이 있으면 인증서 도메인을 그 값으로 하고 SAN은 비운다. 없으면 지금처럼 `aliases`를 쓰므로 스테이징 plan은 바뀌지 않는다. 기본값에 `prod = { aliases = ["web.focusmakers.app"], branch = "main", cert_domain = "*.focusmakers.app" }`를 더한다                                                       |
| CloudFront 별칭     | 운영 배포에 `web.focusmakers.app` 별칭을 처음부터 붙인다. 인증서로 소유가 증명되면 DNS가 아직 Vercel을 가리켜도 붙일 수 있고, DNS를 바꾸기 전까지 사용자 트래픽은 그대로 Vercel로 간다                                                                                                                                                                    |
| apply 중 수동 작업  | 와일드카드 인증서 검증 CNAME(`_xxx.focusmakers.app`)을 Cloudflare에 DNS 전용으로 추가한다. 인증서 자동 갱신에 계속 쓰이므로 지우지 않는다                                                                                                                                                                                                                 |
| 워크플로 구조       | `deploy-web.yml` 한 잡에서 브랜치로 값을 고른다. `main`이면 `PROD_*` 변수와 `VITE_DEPLOY_ENV=production`, `dev`면 지금 값. 빌드·압축·업로드·무효화·검증 단계를 두 세트로 두지 않기 위해서다                                                                                                                                                               |
| 트리거              | `push: branches: [dev, main]`과 수동 실행                                                                                                                                                                                                                                                                                                                 |
| 동시 실행           | 그룹을 브랜치별로 나눈다(`deploy-web-dev`, `deploy-web-main`). 실행 중인 배포는 취소하지 않는다                                                                                                                                                                                                                                                           |
| 운영 변수           | `PROD_WEB_BUCKET`, `PROD_CF_DISTRIBUTION_ID`, `PROD_DEPLOY_ROLE_ARN`, `PROD_VITE_SENTRY_DSN`, `PROD_VITE_AMPLITUDE_API_KEY`, `PROD_VITE_GA4_MEASUREMENT_ID`, `PROD_VERIFY_URL`. 운영 실행에서 하나라도 비면 시작 단계에서 실패한다. 스테이징은 지금 변수를 그대로 쓴다                                                                                    |
| GA4                 | 운영 빌드에만 넣는다. 지금 운영 Vercel 번들에 GA4가 있고 스테이징에는 없다                                                                                                                                                                                                                                                                                |
| 검증 주소           | 운영은 `PROD_VERIFY_URL`. 컷오버 전에는 CloudFront 기본 주소, 컷오버 때 `https://web.focusmakers.app`으로 바꾼다. 전환 전에 실제 도메인을 검증하면 Vercel을 검사하게 된다. 스테이징은 `https://web-dev.focusmakers.app` 그대로                                                                                                                            |
| 첫 운영 배포        | GitHub는 `main`에 있는 워크플로 파일을 실행한다. `deploy-web.yml`은 다음 릴리즈 PR(#236)이 머지될 때 `main`에 들어가고, 그 머지가 운영 CloudFront로 가는 첫 배포가 된다                                                                                                                                                                                   |

## 순서

1. infra: `cert_domain` 추가, `web_sites`에 prod 추가, plan(스테이징 변화 없음, 운영 리소스 생성) 확인, apply 중 검증 CNAME 등록.
2. frontend: `deploy-web.yml` 브랜치별 값 선택, 운영 변수 등록(사용자), PR을 `dev`에 머지.
3. 릴리즈 PR이 `main`에 머지되면 운영 CloudFront로 첫 배포, CloudFront 기본 주소에서 검증 스크립트 통과.
4. A23에서 운영 Vercel(전환 전) 측정, 며칠 스테이징 관찰과 STG 앱 세션 확인.
5. 컷오버: Cloudflare `web` CNAME을 운영 CloudFront로(DNS 전용), `PROD_VERIFY_URL`을 실제 도메인으로, 검증 스크립트 통과, A23 전환 후 측정.
6. 일주일 뒤 Vercel 프로젝트에서 `web.focusmakers.app` 제거. 문서(ADR 0013, `architecture.md`, `releases.md`).

## 검증

워크플로는 단위 테스트가 없어 아래 실행 결과로 확인한다.

| 시점                                       | 확인          | 기대                                                                                                                                                       |
| ------------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 이 PR이 `dev`에 머지된 뒤 첫 스테이징 실행 | 변수 선택     | `STAGING_*` 값, `VITE_DEPLOY_ENV=preview`, GA4 없음, 검증 대상 `https://web-dev.focusmakers.app`, "Verify deploy" 11개 통과                                |
| 같은 실행                                  | 스테이징 번들 | API가 `api-dev`, GA4 측정 ID 없음                                                                                                                          |
| `dev`·`main`이 아닌 브랜치로 수동 실행     | 브랜치 제한   | "Check deploy variables"에서 `dev와 main만 배포할 수 있습니다`로 실패, AWS 인증 전                                                                         |
| 첫 `main` 실행(릴리즈 머지) 전             | 운영 변수     | 7개가 모두 등록돼 있다. 하나라도 비면 시작 단계에서 `($TARGET)`이 `PROD`로 찍힌 오류로 멈추고 스테이징 값으로 넘어가지 않는다                              |
| 첫 `main` 실행                             | 대상          | 역할 `focus-makers-prod-gha-frontend`, 버킷 `focus-makers-prod-web-821365066487`, 배포 `E3PASPNUNRE8I0`, 검증 대상 `PROD_VERIFY_URL`(CloudFront 기본 주소) |
| 같은 실행                                  | 운영 번들     | API가 `api.focusmakers.app`, GA4 `G-5QLZK5GWTX` 포함, Sentry `environment`가 `production`, 릴리즈가 커밋 SHA 7자리, Sentry에 그 릴리즈의 소스맵이 올라감   |
| 같은 실행                                  | 배포 검증     | CloudFront 기본 주소에서 "Verify deploy" 11개 통과                                                                                                         |

## 되돌리기

Cloudflare `web` CNAME을 Vercel 값(`baf903d76c215685.vercel-dns-017.com`)으로 돌린다. TTL이 Auto(5분)라 몇 분 안에 복구된다. Vercel에 도메인이 남아 있는 동안만 가능하다.

## 범위 밖

- `web.sunqstudio.kr` 이전과 Vercel 프로젝트 삭제.
- `api.sunqstudio.kr` 인증서 문제.
