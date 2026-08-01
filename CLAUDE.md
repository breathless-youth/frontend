# FocusOn FE

AI Vision 기반 순공 시간 측정 캠스터디 서비스의 프론트엔드 모노레포. AI Vision으로 사용자의 공부 상태를 **단말 내부에서** 분석해 총 공부시간·순공시간·집중률을 제공하고, 싱글 스터디룸(개인 집중도 측정)과 멀티 종일룸(LiveKit 기반 그룹 화면 공유)을 지원한다. 용어는 [docs/domain-glossary.md](./docs/domain-glossary.md) 참고.

## 지금 상태: 기능 구현 리셋 (2026-07-25), 아키텍처 방침은 WebView 유지

**초기 명세 기반으로 임시 구현했던 기능 코드(스터디룸 화면, Vision 감지, 공부시간 계산 코어, WebView 룸 라우트, dormant 네이티브 자산)는 2026-07-25에 전부 삭제했다.** 실제 백엔드 Swagger 계약·확정 디자인 기준으로 재구축한다.

**재구축 진행 상황** — 리셋 이후 다음이 다시 올라왔다. 이 절의 "지금 남아 있는 것은 앱 셸뿐"이라는 서술은 그만큼 낡았다.

- 화면 S1–S6 · G1–G5 · U1 (Figma 확정 디자인 기준)
- BY-282 — WebView 세션 인프라: 번들 동봉 + localhost 정적 서버([ADR 0005](./docs/adr/0005-bundled-web-assets-over-localhost-server.md)), 세션 라우트, `getUserMedia` 카메라 어댑터, 네이티브↔웹 브리지. Expo Go → Dev Client 전환
- BY-293 — **온디바이스 Vision 감지**: EfficientDet-Lite0 + MediaPipe Tasks Vision. 자리 이탈(AWAY)·폰 사용(PHONE)이 **mock이 아닌 실신호**로 동작한다. 설계·실측은 [vision-pipeline-design](./docs/superpowers/specs/2026-07-27-study-session-vision-pipeline-design.md) §2~§4·§10(S3)

아직 없는 것: 가속도 센서 DEVICE 신호(§5), `@focusmakers/study-core` 분리와 체크포인트·미제출 큐(§6·§7), 수동 타이머 모드(정책은 확정, FE 미구현 — 심사 제출 전 필수). 삭제 코드는 git 히스토리(dev `5e548eb` 시점)에서 복구 가능. "모바일 스터디룸은 `apps/web`을 WebView로 로드한다"는 아키텍처 방침(ADR 0001)은 유지된다 — 재구축 시 이 구조로 만든다. 경위는 이 순서로 읽을 것:

1. [ADR 0001](./docs/adr/0001-webview-based-study-room-architecture.md) — 지금 활성 아키텍처(WebView).
2. [ADR 0003](./docs/adr/0003-phased-rollout-webview-mvp-then-native.md) — 왜 네이티브(ADR 0002)에서 다시 WebView로 되돌렸는지, 무엇을 보존했는지, 전환 트리거·체크리스트.
3. [ADR 0002](./docs/adr/0002-native-mobile-study-room-and-independent-web.md) — 향후 네이티브 전환 시의 목표 아키텍처(지금은 미채택).

## 모노레포 구조

- `apps/mobile` — Expo RN 앱(`expo-router`). 앱 셸(인증/네비게이션) + 스터디룸은 WebView로 `apps/web`을 로드. 자세한 규칙은 [apps/mobile/CLAUDE.md](./apps/mobile/CLAUDE.md).
- `apps/web` — Vite + React 웹 앱. 스터디룸의 실제 구현체가 될 자리(모바일이 WebView로 로드) — 동시에 독립 브라우저 서비스로도 배포 가능. 지금은 홈(랜딩)만 있다. 자세한 규칙은 [apps/web/CLAUDE.md](./apps/web/CLAUDE.md).
- `packages/types` — 서버 전송용/API 계약 도메인 타입. **실제 백엔드 Swagger 계약 기준으로만 정의한다**(상상 계약 금지). 지금은 `UserRegisterRequest`/`UserRegisterResponse`만 있다.
- `packages/design-tokens` — 모바일·웹 공유 의미 기반 디자인 토큰(색상 의미/타이포/간격/모서리/상태색). 컴포넌트 구현체는 공유하지 않는다.
- `packages/config` — 공유 ESLint/Prettier 설정.

## 아키텍처 경계 (재구축 시에도 반드시 유지)

- **플랫폼 카메라 구현**과 **공부 상태 계산**을 분리한다.
- **Vision AI 구현**과 **세션 집계 로직**을 분리한다.
- **WebRTC(LiveKit) 구현**과 **Vision AI 구현**을 분리한다(멀티룸의 영상 송출 경로와 AI 분석 경로는 독립).
- UI 컴포넌트는 카메라·LiveKit SDK를 직접 호출하지 않는다 — 어댑터 계층을 통한다(과거 `apps/mobile/platform/*` 패턴은 git 히스토리 참고).
- 공유 패키지(`types`, `design-tokens`)는 React Native, DOM, MediaPipe, LiveKit에 직접 의존하지 않는다. 공부시간 계산 코어를 재구축할 때도 같은 원칙(순수 TS 패키지)을 따른다.

## 개인정보 원칙 (변경 불가, WebView·네이티브 어느 쪽이든 동일하게 적용)

- **온디바이스 Vision AI**: 카메라 원본 프레임·얼굴 이미지·랜드마크 좌표는 단말(브라우저/WebView) 내부에서만 처리한다. 서버 전송·파일/캐시/DB 저장·로그 기록 금지. 서버에는 공부 상태 이벤트와 세션 집계 결과만 전송한다.
- **싱글룸**: 영상 자체가 어디에도 전송되지 않는다.
- **멀티룸**: 카메라 영상은 참여자 화면 공유를 위해 LiveKit으로 전송된다(녹화·영구저장 안 함). "영상이 서버로 전송되지 않는다"고 쓰지 말 것 — "AI 분석용 원본 프레임·얼굴 데이터가 서버로 전송되지 않는다"로 표현한다.
- 싱글룸과 멀티룸의 개인정보 안내 문구를 동일하게 쓰지 말 것. 자세한 근거는 [ADR 0002](./docs/adr/0002-native-mobile-study-room-and-independent-web.md).

## 개발 명령

패키지 매니저는 pnpm 고정. 루트에서 Turborepo로 전체/부분 실행한다.

```bash
pnpm install
pnpm dev            # 전체 dev 서버 (turbo)
pnpm lint            # 전체 lint
pnpm typecheck        # 전체 typecheck
pnpm test            # 전체 test
pnpm --filter mobile dev   # mobile만 (Expo Go로 바로 열림 — Dev Client 불필요)
pnpm --filter web dev      # web만
```

## 코딩 컨벤션

- TypeScript strict 모드 고정 (`tsconfig.base.json`). `any` 대신 명시적 타입, 타입 전용 import는 `import type`.
- 각 패키지는 `lint`/`typecheck`/`test` 스크립트를 동일한 이름으로 노출한다 — 새 패키지를 추가할 때도 이 3개는 반드시 채운다(내용이 없으면 `echo ... && exit 0`이라도).
- 공유 로직/타입은 `packages/*`로 올린다. 특정 화면에서만 쓰는 코드를 패키지로 미리 빼지 않는다(과도한 추상화 금지).
- 커밋 메시지는 Conventional Commits(`feat:`, `fix:`, `chore:`, `docs:` 등). `commitlint`(`@commitlint/config-conventional` 기본값)가 강제한다. [Codex의 Git 워크플로 스펙](./docs/superpowers/specs/2026-07-22-git-github-jira-workflow-design.md)은 더 넓은 타입 목록(`design`/`comment`/`rename`/`remove`/`!HOTFIX` 포함)을 제안하지만 아직 `commitlint.config.js`에 반영되지 않았다.
- **PR 제목은 `[타입] SCRUM-N 제목` 형식**(예: `[feat] SCRUM-147 공부 세션 제출 API 연동`, 티켓 없는 잡무는 `[chore] 제목`). 커밋 메시지의 Conventional Commits 스타일(`feat(web): ...`)을 PR 제목에 쓰지 말 것. Jira 키 자리에 GitHub 이슈번호(`#171`)를 쓰지 말 것. CI `pr-title` job이 강제한다.
- PR은 `.github/pull_request_template.md` 체크리스트를 따른다. 구조/아키텍처 변경 시 `docs/adr/`에 ADR을 추가한다.
- 로그인은 Google/Apple만 지원한다(다른 소셜/이메일 로그인 추가 금지). 실제 로그인 화면은 아직 미구현.

## AI 에이전트 워크플로우

이 저장소는 이미 설치된 gstack 스킬 세트를 표준 개발 흐름으로 사용한다 — 새 도구를 도입하는 게 아니라 아래 흐름을 이 저장소의 관례로 삼는다.

- 기능 작업 시작 전: `/spec`으로 요구사항을 명확히 한다.
- PR 올리기 전: `/review`로 변경사항을 점검한다.
- UI 변경 후: `/design-review`로 시각적 일관성을 확인한다.
- 기능 배포 후: `/document-release`로 문서를 갱신한다. 문서가 아예 없는 영역은 `/document-generate`로 채운다.
- 버그 조사: `/investigate`.
- shadcn 컴포넌트 추가/설정: `shadcn-ui`, `tailwind-theme-builder` 스킬 사용.
- Figma 연동(파일 준비된 이후): `figma-design-to-code`, `figma-generate-library` 스킬 사용.

## Codex 스펙 문서 (다른 세션/도구에서 작성, 아직 전면 도입 전)

`docs/superpowers/specs/`에 Codex가 작성한 두 설계 문서가 있다. 둘 다 "LLM 중립적으로 작성"이 원칙이라 Claude를 포함한 모든 AI 도구가 그대로 따를 수 있게 쓰여 있다. **다만 두 문서 모두 "설계안(design)"이라 아직 저장소에 전면 도입되지 않았다** — 그 상태를 착각하지 말 것.

- [`2026-07-22-git-github-jira-workflow-design.md`](./docs/superpowers/specs/2026-07-22-git-github-jira-workflow-design.md) — Jira 티켓을 작업의 단일원천으로 삼는 Git 브랜치(`main`/`dev`/`feature/{JIRA-KEY}-*`)·커밋 타입(`feat`/`design`/`comment`/`rename`/`remove`/`!HOTFIX` 등 확장 목록)·PR 템플릿·GitHub Ruleset 체계. **예외: 이 문서의 PR 제목 규칙(`[타입] SCRUM-N 제목`)만은 2026-07-26에 도입되어 CI가 강제한다** — 위 코딩 컨벤션 참고. **아직 미도입**: GitHub Ruleset(브랜치 보호)이 없다 — `pr-title` job이 실패해도 머지 자체는 막히지 않는다. `dev` 브랜치와 GitHub CLI 인증은 2026-07-26 기준 존재한다. 커밋 타입도 현재 `commitlint.config.js`는 `@commitlint/config-conventional` 기본값만 강제해서, 이 문서의 확장 타입(`design`/`comment`/`rename`/`remove`/`!HOTFIX`)은 아직 실제로는 통과하지 않을 수 있다 — commitlint 설정을 맞추기 전까지는 기본 Conventional Commits 타입(`feat`/`fix`/`docs`/`style`/`chore`/`refactor`/`test`/`build`)만 안전하다.
- [`2026-07-22-ai-native-mobile-development-design.md`](./docs/superpowers/specs/2026-07-22-ai-native-mobile-development-design.md) — Figma 화면을 화면 단위로 안전하게 구현하기 위한 문서 구조(`AGENTS.md` 공통 진입점, `docs/ai-development/*`, `docs/screens/SCR-NNN-*.md`), 화면당 프롬프트 계약, 컴포넌트 승격 규칙, 코드 소유권/보호 파일 선언 절차. **아직 미도입**: `docs/ai-development/`, `docs/screens/`는 이 저장소에 없다. 루트 `AGENTS.md`는 2026-07-26에 생겼지만 PR 제목 컨벤션만 담은 부분적 진입점이다 — 이 문서가 설계한 전체 구조가 도입된 게 아니다. 이 문서의 "적용 범위"(WebView 활성, 네이티브 dormant)는 이미 우리 ADR 0001/0003과 일치한다 — 이 부분만은 지금도 유효한 사실 서술이다.
- 이 문서의 보호 파일(protected) 목록은 **2026-07-25 기능 리셋으로 전부 삭제되어 현재는 비어 있다** — 재구축하면서 보호가 필요한 경로가 생기면 다시 선언한다.

## 하지 말 것

- 백엔드 Swagger에 없는 API 계약 타입을 상상으로 만들지 말 것 — 초기에 그렇게 만든 임시 구현 전체를 2026-07-25에 삭제했다([ADR 0003](./docs/adr/0003-phased-rollout-webview-mvp-then-native.md) 갱신 노트).
- 실기기 기술 스파이크(온디바이스 Vision, LiveKit RN SDK 호환성 검증)가 끝나기 전에 네이티브로 조기 전환하지 말 것 — MVP는 WebView로 간다는 게 현재 결정이다.
- 검증되지 않은 네이티브 라이브러리를 추측으로 설치하지 말 것 — 인터페이스+mock으로 두고 실제 기기 스파이크로 검증한다.
- 공유 패키지(`study-core` 등)에 React Native/DOM/MediaPipe/LiveKit 의존성을 추가하지 말 것.
- 패키지 매니저를 npm/yarn으로 바꾸지 말 것 (pnpm 고정).
- `packages/config`의 공유 규칙을 개별 앱에서 무시하려면 반드시 이유를 주석으로 남길 것.
- 위 Codex 스펙 문서를 "이미 도입된 상태"로 착각해서 없는 `docs/ai-development/`/`docs/screens/`/Ruleset을 있다고 가정하지 말 것 — 실제로 만들거나 사용자에게 도입 여부부터 확인할 것.
