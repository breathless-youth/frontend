# BY-792 README 한국어·영어판 개편과 라이선스 명시 설계

## 배경

- 루트 README는 7월 초안(BY-135) 이후 갱신되지 않아 사라진 `packages/study-core`, 삭제된 네이티브 자산, Expo Go 실행을 안내하고 있었다.
- `.env.local` 준비, Node·pnpm 버전, 배포 흐름이 빠져 있어 README만으로는 앱을 띄울 수 없었다.
- 저장소는 공개인데 라이선스가 없고, `apps/mobile/LICENSE`에는 Expo 템플릿의 MIT 원문이 남아 있었다.

## 벤치마크

- 해외에서 스타 5만 이상인 저장소 17곳(n8n, dify, excalidraw, immich, supabase, AppFlowy, AFFiNE, nocodb, twenty, react, next.js, react-native, shadcn/ui, tailwindcss, storybook, svelte, vite)의 README를 비교했다.
- 국내에는 스타 5만 이상 저장소가 없어 toss/suspensive, nhn/tui.editor, toss/es-toolkit, daangn/stackflow로 대신했다.
- 가져온 관행은 vite·suspensive의 패키지 표, supabase의 아키텍처 도식, excalidraw의 용도 주의 문구, storybook의 스크립트 표, tui.editor의 README 안 설치 명령이다.
- 스폰서, 스타 히스토리, 기여자 이미지, 배지 모음, 커뮤니티 안내는 비공개 운영 저장소에 필요 없어 뺐다.

## 확정한 결정

| 항목      | 결정                                             |
| --------- | ------------------------------------------------ |
| 주 독자   | 새로 합류한 팀원, 소개 절은 외부 방문자도 읽히게 |
| 문체      | 한국어판은 한다체                                |
| 기여 안내 | 넣지 않는다, 외부 기여를 받지 않는다             |
| 라이선스  | All rights reserved, 저작권자 `breathless-youth` |
| 스크린샷  | 배너(`apps/web/public/og-image.png`)만           |
| 영어판    | `README.en.md`, 한국어판과 같은 구성             |
| 구성 방식 | README 하나에 실행 절차까지 담는다, 150줄 이내   |

## 파일

| 파일                  | 변경                                                        |
| --------------------- | ----------------------------------------------------------- |
| `README.md`           | 한국어판으로 새로 쓴다                                      |
| `README.en.md`        | 영어판을 새로 만든다                                        |
| `LICENSE`             | All rights reserved 문구로 새로 만든다                      |
| `apps/mobile/LICENSE` | 지운다                                                      |
| `apps/web/README.md`  | 웹 앱 소개와 `apps/web/CLAUDE.md`·루트 README 링크로 바꾼다 |

## README 섹션

1. 소개: 언어 전환 줄, 배너, 서비스 소개, 서비스 목표, 순공 시간 정의 인용(나무위키, 위키백과에는 문서가 없다). 개인정보 원칙은 `CLAUDE.md` 링크로 대신한다.
2. 구조: `apps/web`, `apps/mobile`, `packages/types`, `packages/design-tokens`, `packages/config` 표와 mermaid 흐름 도식 한 장.
3. 기술 스택: 웹과 모바일을 나눈 표 하나에 서버 상태·폼·실시간·비전 추론·웹뷰까지 담는다. Expo SDK 57 업그레이드가 예정돼 있어 고정 방침은 적지 않는다.
4. 시작하기: Node 24, corepack pnpm 10.28.2, 웹 실행, 모바일 Dev Client 빌드와 Metro 실행, Expo Go 불가 주의 문구, 실기기 런북 링크.
5. 스크립트: 루트 스크립트 표, 루트 `pnpm dev`가 모바일을 띄우지 않는다는 점.
6. 환경 변수: 로컬 실행에 필요한 변수의 이름·필수 여부·용도만, 배포 환경 주입 키는 한 줄.
7. 배포: 대상·방식·기준·배포처 표(Vercel `main`·`dev`, EAS 프로필), CalVer, `docs/releases.md` 링크.
8. 문서 지도: `CLAUDE.md`, `DESIGN.md`, `docs/architecture.md`, ADR 색인, 런북, 화면 스펙.
9. 라이선스: 한 줄과 `LICENSE` 링크.

영어판은 명령·표·도식을 한국어판과 똑같이 두고 문장만 번역한다.

## 검증

- 새 워크트리에서 README 명령을 그대로 따라 웹 dev 서버가 뜨는지 확인한다.
- 두 README의 상대 링크가 모두 실제 파일을 가리키는지 스크립트로 확인한다.
- `study-core`, `LiveKit`, Expo Go 실행 안내가 남지 않았는지 grep으로 확인한다.
- 모바일 명령은 `apps/mobile/package.json`·`eas.json`과 같은지만 대조하고, Dev Client 빌드는 돌리지 않는다.
- mermaid 도식이 GitHub에서 렌더링되는지 PR 화면에서 확인한다.

## 범위 밖

- `DESIGN.md` 버전 오류와 `claude-review.yml` 프롬프트의 옛 서술은 BY-793에서 고친다.
- `docs/runbooks/expo-go-connection.md`는 README 링크만 빼고 파일은 둔다.
