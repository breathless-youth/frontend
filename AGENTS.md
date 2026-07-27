# FocusOn FE — AI 에이전트 공통 진입점

수험생 집중 습관 앱 **FocusON**(가칭)의 프론트엔드 모노레포. 전면 카메라 + 온디바이스 객체 인식(EfficientDet-Lite0) + 가속도 센서로 비집중 3종(자리 이탈·휴대폰 사용·기기 조작)을 감지해 학습 타이머를 자동 제어하고, 순공시간·총 공부 시간·집중률을 기록한다. Claude Code와 Codex 모두 이 문서를 진입점으로 쓴다(`CLAUDE.md`는 이 문서를 임포트만 한다).

## 프로젝트 지식의 SSOT: `.ai/` 서브모듈

제품 기획·설계 결정·컨벤션의 단일 진실 공급원은 `.ai/` 서브모듈(프로젝트 위키 레포)이다. **이 문서에는 fe 레포 고유 정보만 남긴다 — 위키와 겹치는 서술이 충돌하면 위키가 이긴다.** 폴더가 비어 있으면 `git submodule update --init`, 최신화는 `git submodule update --remote .ai`.

작업 전에 읽을 것(전체 규칙은 [.ai/ai/agent-rules.md](./.ai/ai/agent-rules.md)):

| 작업                  | 문서                                                                                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 모든 작업 공통        | [.ai/project/overview.md](./.ai/project/overview.md), [.ai/ai/agent-rules.md](./.ai/ai/agent-rules.md)                                                                                 |
| 도메인 로직           | [.ai/project/glossary.md](./.ai/project/glossary.md)(용어·노출 표기), [.ai/product/mvp-scope.md](./.ai/product/mvp-scope.md)(세션 상태 모델·감지 로직·서버 계약)                       |
| 기능 구현(Story 단위) | `.ai/product/specs/BY-NNN-*.md` 있으면 최우선                                                                                                                                          |
| 화면 구현             | [.ai/product/design.md](./.ai/product/design.md)(Figma·화면 인벤토리 SSOT), [.ai/product/voice-tone.md](./.ai/product/voice-tone.md)(노출 문구), `docs/screens/SCR-*.md`(fe 화면 스펙) |
| 정책·프라이버시 문구  | [.ai/product/policies.md](./.ai/product/policies.md)                                                                                                                                   |
| 커밋·브랜치·PR        | [.ai/conventions/git-workflow.md](./.ai/conventions/git-workflow.md) + 아래 fe 고유 규칙                                                                                               |
| 우선순위·버전 범위    | [.ai/product/roadmap.md](./.ai/product/roadmap.md)                                                                                                                                     |

위키 필수 규칙 요약(팀 확정): **직접 push/merge 금지**(에이전트는 커밋까지만), **커밋 전 린트·테스트 통과**, **구조 변경(새 의존성·API 스펙·디렉터리 개편)은 사전 협의**. 권장 규칙(제안 상태): 위키에 "미정"인 값은 임의 확정하지 말고 설정 파라미터로 열어둔다, 위키·코드 불일치 발견 시 위키 수정 제안.

## 지금 상태 (2026-07-27)

2026-07-25에 상상 계약 기반 임시 구현(스터디룸·Vision·계산 코어)을 전부 삭제하고(git 히스토리 dev `5e548eb`에서 복구 가능), 실제 백엔드 Swagger 계약·확정 디자인(Figma V1.0) 기준으로 **V1.0(코어 측정 + 기록)을 재구축 중**이다.

- 구현됨: 앱 셸 화면 S1·S2-2/S2-3·S5·S6·G1–G5·U1(`apps/mobile`), 세션·결과 화면 S3-1–S3-8·S4(`apps/web` — 감지·카메라는 mock, 실모델 미연동), 익명 기기 유저 등록(SCRUM-259). 화면별 상태는 [docs/screen-ownership.md](./docs/screen-ownership.md).
- 확정됨: 세션 상태 모델·서버 전송 계약 — [docs/superpowers/specs/2026-07-26-session-state-model-and-contract-design.md](./docs/superpowers/specs/2026-07-26-session-state-model-and-contract-design.md). 상태기계는 웹, 저장·전송은 네이티브. 순수 계산 패키지 `@focuson/study-core`는 이 스펙에 따라 **신설 예정**(아직 없음).
- 미구현: WebView 연동(`react-native-webview` 미설치), 카메라 권한 실요청(권한 조회/요청 네이티브 모듈 미설치 — `lib/cameraPermission.ts`는 mock 어댑터), EfficientDet-Lite0 실기기 실행 스파이크, 세션 제출·통계 API 연동 일부(SCRUM-147 에픽), 수동 타이머 모드(카메라 권한 거부 대응).
- **로그인 없음**: V1.0은 익명 기기 계정으로 기록을 귀속한다. Google/Apple 로그인은 V1.2(소셜 1단계)로 연기됨 — [.ai/product/roadmap.md](./.ai/product/roadmap.md). 로그인 화면을 미리 만들지 말 것.

## 아키텍처: WebView 유지

"모바일 세션 화면은 `apps/web`을 WebView로 로드한다"는 방침은 유지된다. 경위·전환 트리거·전환 절차는 [docs/architecture.md](./docs/architecture.md)의 "경위와 전환 조건" 참고(구 fe ADR 0001~0003은 2026-07-27 삭제, git 히스토리와 그 요약으로 대체 — 일부 문서의 "(ADR 0001)" 표기는 이 결정을 가리킨다).

> 소셜 영상 공유의 현재 결정은 위키 [ADR-0002 (WebRTC P2P, 제안됨)](./.ai/decisions/0002-social-video-p2p.md)이고 V1.3 범위다 — LiveKit 등 특정 기술을 확정된 것처럼 쓰지 말 것.

### 모노레포 구조

- `apps/mobile` — Expo RN 앱(앱 셸: 홈·기록·설정 탭, 온보딩, 권한 게이트). 세션 화면은 WebView로 `apps/web`을 로드(연동 예정). [apps/mobile/CLAUDE.md](./apps/mobile/CLAUDE.md)
- `apps/web` — Vite + React. 세션 화면(S3·S4)의 실제 구현체 + 독립 브라우저 배포 가능. [apps/web/CLAUDE.md](./apps/web/CLAUDE.md)
- `packages/types` — API 계약 타입. **백엔드 Swagger에 있는 것만** 정의(상상 계약 금지).
- `packages/design-tokens` — 공유 의미 기반 디자인 토큰(값 원천, 컴포넌트 구현체 없음). 계약 색상 매핑 테스트 포함.
- `packages/config` — 공유 ESLint/Prettier 설정.

### 경계 (재구축 시에도 유지)

- 플랫폼 카메라 구현 ↔ 공부 상태 계산 분리. Vision AI 구현 ↔ 세션 집계 로직 분리. 영상 공유(WebRTC) 경로 ↔ AI 분석 경로 독립.
- UI 컴포넌트는 카메라·RTC SDK를 직접 호출하지 않는다 — 어댑터 계층을 통한다.
- 공유 패키지(`types`, `design-tokens`, 신설될 `study-core`)는 React Native·DOM·TensorFlow·WebRTC SDK에 의존하지 않는다(순수 TS).
- 감지 방식은 계속 바뀔 전제다 — 감지 모듈과 타이머·세션 로직 사이 인터페이스를 유지한다(위키 설계 원칙).

## 개인정보 원칙 (변경 불가)

원천: [.ai/product/policies.md](./.ai/product/policies.md).

- **온디바이스 추론**: 카메라 영상·프레임은 저장하지 않고 단말(브라우저/WebView) 밖으로 전송하지 않는다. 서버에는 판단 결과만 전송(세션 요약 + 상태 이벤트 `PHONE`/`DEVICE`/`AWAY`/`PAUSE`).
- V1.0에는 영상 공유가 없다 — 세션 화면 프라이버시 문구는 싱글 기준 표준 문구([.ai/product/voice-tone.md](./.ai/product/voice-tone.md))만 쓴다.
- V1.3 P2P 영상 공유가 도입되면 "서버에 저장·보관하지 않는다"로 원칙이 재정의된다(위키 ADR-0002 승인 대기) — 그 전에 멀티룸 문구를 미리 쓰지 말 것.

## 개발 명령

패키지 매니저는 pnpm 고정. 루트에서 Turborepo로 전체/부분 실행한다.

```bash
pnpm install
pnpm dev            # 전체 dev 서버 (turbo)
pnpm lint           # 전체 lint
pnpm typecheck      # 전체 typecheck
pnpm test           # 전체 test
pnpm --filter mobile dev   # mobile만 (Expo Go로 바로 열림 — Dev Client 불필요)
pnpm --filter web dev      # web만
```

## 코딩 컨벤션

- TypeScript strict 고정(`tsconfig.base.json`). `any` 금지, 타입 전용 import는 `import type`.
- 각 패키지는 `lint`/`typecheck`/`test` 스크립트를 동일한 이름으로 노출한다(새 패키지도 필수).
- 공유 로직/타입은 `packages/*`로 올리되, 한 화면에서만 쓰는 코드를 미리 패키지로 빼지 않는다.
- 용어·노출 문구는 [.ai/project/glossary.md](./.ai/project/glossary.md)를 따른다. fe 코드·계약 매핑은 [docs/domain-glossary.md](./docs/domain-glossary.md).
- **Jira 프로젝트 키는 `BY`다** (2026-07-27 SCRUM에서 변경 — 위키 `git-workflow.md`). 문서·히스토리의 `SCRUM-N` 표기는 과거 티켓 참조다.
- **커밋**: Conventional Commits + 제목 끝 Jira 티켓 — `feat(timer): 타이머 자동 일시정지 구현 (BY-42)`. `commitlint`(`@commitlint/config-conventional` 기본값)가 타입을 강제하므로 기본 타입(`feat`/`fix`/`docs`/`style`/`chore`/`refactor`/`test`/`build`/`ci`/`perf`)만 안전하다.
- **PR 제목은 `[타입] BY-N 제목` 형식**(예: `[feat] BY-147 공부 세션 제출 API 연동`, 티켓 없는 잡무는 `[chore] 제목`). CI `pr-title` job이 강제한다(구 `SCRUM-N`은 전환기 한시 허용). Conventional Commits 스타일(`feat(web): ...`)이나 GitHub 이슈번호(`#171`)를 PR 제목에 쓰지 말 것.
- 브랜치: `feature/BY-123-요약` (`dev`에서 분기, `dev`로 PR). GitHub Ruleset(브랜치 보호)은 아직 없다 — CI 실패해도 머지가 막히지는 않으니 스스로 지킬 것.
- PR은 `.github/pull_request_template.md` 체크리스트를 따른다. 구조/아키텍처 변경 시 위키 `.ai/decisions/`에 ADR을 제안하고, fe 국소 사항은 `docs/architecture.md`에 기록한다.

## AI 에이전트 워크플로우 (이 저장소 관례)

- 기능 작업 시작 전: `/spec`. PR 전: `/review`. UI 변경 후: `/design-review`. 배포 후: `/document-release`. 버그 조사: `/investigate`.
- shadcn 컴포넌트: `shadcn-ui`, `tailwind-theme-builder` 스킬. Figma 구현: `figma-design-to-code` 스킬(디자인 원본은 [.ai/product/design.md](./.ai/product/design.md)의 Figma V1.0 파일).
- 작업 중 위키와 코드가 다른 것을 발견하면 위키 수정을 함께 제안한다(agent-rules 5).

## 하지 말 것

- 백엔드 Swagger에 없는 API 계약 타입을 상상으로 만들지 말 것 — 2026-07-25 리셋의 원인이었다.
- 위키에 "미정"인 값(감지 임계값·프레임 주기 등)을 하드코딩하지 말 것 — 설정 파라미터로 열어둔다.
- 실기기 스파이크(EfficientDet-Lite0 실행, WebView 카메라 권한) 전에 검증되지 않은 라이브러리를 추측으로 설치하지 말 것 — 인터페이스+mock으로 두고 스파이크로 검증한다.
- MVP 중 네이티브 세션 화면으로 조기 전환하지 말 것 — 전환 트리거·절차는 `docs/architecture.md`의 "경위와 전환 조건".
- LiveKit 등 위키에 확정되지 않은 기술을 확정처럼 문서·코드에 쓰지 말 것(소셜 영상은 위키 ADR-0002 승인 대기).
- 로그인 화면·소셜 기능을 V1.0 범위에 미리 만들지 말 것(로드맵 버전 분할 준수).
- 패키지 매니저를 npm/yarn으로 바꾸지 말 것.
- 공유 패키지에 RN/DOM/TensorFlow/WebRTC 의존성을 추가하지 말 것.
- `packages/config` 공유 규칙을 개별 앱에서 무시하려면 반드시 이유를 주석으로 남길 것.
