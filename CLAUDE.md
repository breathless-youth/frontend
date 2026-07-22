# FocusOn FE

AI Vision 기반 순공 시간 측정 캠스터디 서비스의 프론트엔드 모노레포. AI Vision으로 사용자의 공부 상태를 **단말 내부에서** 분석해 총 공부시간·순공시간·집중률을 제공하고, 싱글 스터디룸(개인 집중도 측정)과 멀티 종일룸(LiveKit 기반 그룹 화면 공유)을 지원한다. 용어는 [docs/domain-glossary.md](./docs/domain-glossary.md) 참고.

## 지금 활성 아키텍처: MVP = WebView, 네이티브 = 로드맵

**모바일 스터디룸(`apps/mobile/app/room/[id].tsx`)은 지금 `apps/web`을 WebView로 로드한다.** 카메라·온디바이스 Vision·LiveKit RN을 직접 구현하는 네이티브 버전은 한 번 만들었다가 MVP 속도를 위해 되돌렸다 — 코드는 삭제하지 않고 `apps/mobile/platform/*`, `apps/mobile/features/study-session/NativeStudyRoomScreen.tsx`에 **비활성(dormant) 상태로 보존**했다. 자세한 경위는 반드시 이 순서로 읽을 것:

1. [ADR 0001](./docs/adr/0001-webview-based-study-room-architecture.md) — 지금 활성 아키텍처(WebView).
2. [ADR 0003](./docs/adr/0003-phased-rollout-webview-mvp-then-native.md) — 왜 네이티브(ADR 0002)에서 다시 WebView로 되돌렸는지, 무엇을 보존했는지, 전환 트리거·체크리스트.
3. [ADR 0002](./docs/adr/0002-native-mobile-study-room-and-independent-web.md) — 향후 네이티브 전환 시의 목표 아키텍처(지금은 미채택).

## 모노레포 구조

- `apps/mobile` — Expo RN 앱(`expo-router`). 앱 셸(인증/네비게이션) + 스터디룸은 WebView로 `apps/web`을 로드. 네이티브 스터디룸 자산은 `platform/*`, `features/study-session/*`에 비활성 보존. 자세한 규칙은 [apps/mobile/CLAUDE.md](./apps/mobile/CLAUDE.md).
- `apps/web` — Vite + React 웹 앱. 브라우저 MediaPipe + LiveKit Web SDK로 구현된 **스터디룸의 실제 구현체**(모바일이 이걸 WebView로 로드) — 동시에 독립 브라우저 서비스로도 배포 가능. 자세한 규칙은 [apps/web/CLAUDE.md](./apps/web/CLAUDE.md).
- `packages/study-core` — 순수 TS 공유 도메인 코어. `StudyStatus`, `FocusTimelineEvent`, `StudySessionSummary`, 총공부시간·순공시간·집중률 계산, 세션 상태 전환·타임라인 병합. **React Native/DOM/MediaPipe/LiveKit에 의존하지 않는다.** `apps/web`(활성)과 모바일의 dormant 네이티브 화면 양쪽에서 쓰인다.
- `packages/types` — 서버 전송용/API 계약 도메인 타입. `study-core`의 `StudyStatus`/`StudySessionSummary`를 재노출한다.
- `packages/design-tokens` — 모바일·웹 공유 의미 기반 디자인 토큰(색상 의미/타이포/간격/모서리/상태색). 컴포넌트 구현체는 공유하지 않는다.
- `packages/config` — 공유 ESLint/Prettier 설정.

## 아키텍처 경계 (네이티브 전환 시에도 반드시 유지)

- **플랫폼 카메라 구현**과 **공부 상태 계산**을 분리한다.
- **Vision AI 구현**과 **세션 집계 로직**을 분리한다.
- **WebRTC(LiveKit) 구현**과 **Vision AI 구현**을 분리한다(멀티룸의 영상 송출 경로와 AI 분석 경로는 독립).
- UI 컴포넌트는 카메라·LiveKit SDK를 직접 호출하지 않는다 — (dormant) `apps/mobile/platform/*` 어댑터를 통한다.
- 공유 패키지(`study-core`, `types`, `design-tokens`)는 React Native, DOM, MediaPipe, LiveKit에 직접 의존하지 않는다.

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

- [`2026-07-22-git-github-jira-workflow-design.md`](./docs/superpowers/specs/2026-07-22-git-github-jira-workflow-design.md) — Jira 티켓을 작업의 단일원천으로 삼는 Git 브랜치(`main`/`dev`/`feature/{JIRA-KEY}-*`)·커밋 타입(`feat`/`design`/`comment`/`rename`/`remove`/`!HOTFIX` 등 확장 목록)·PR 템플릿·GitHub Ruleset 체계. **아직 미도입**: 이 저장소는 지금 `main` 하나뿐이고 `dev` 브랜치·GitHub CLI 인증·Ruleset이 없다. 커밋 타입도 현재 `commitlint.config.js`는 `@commitlint/config-conventional` 기본값만 강제해서, 이 문서의 확장 타입(`design`/`comment`/`rename`/`remove`/`!HOTFIX`)은 아직 실제로는 통과하지 않을 수 있다 — commitlint 설정을 맞추기 전까지는 기본 Conventional Commits 타입(`feat`/`fix`/`docs`/`style`/`chore`/`refactor`/`test`/`build`)만 안전하다.
- [`2026-07-22-ai-native-mobile-development-design.md`](./docs/superpowers/specs/2026-07-22-ai-native-mobile-development-design.md) — Figma 화면을 화면 단위로 안전하게 구현하기 위한 문서 구조(`AGENTS.md` 공통 진입점, `docs/ai-development/*`, `docs/screens/SCR-NNN-*.md`), 화면당 프롬프트 계약, 컴포넌트 승격 규칙, 코드 소유권/보호 파일 선언 절차. **아직 미도입**: `AGENTS.md`(공통 진입점), `docs/ai-development/`, `docs/screens/`는 이 저장소에 없다. 이 문서의 "적용 범위"(WebView 활성, 네이티브 dormant)는 이미 우리 ADR 0001/0003과 일치한다 — 이 부분만은 지금도 유효한 사실 서술이다.
- 이 문서의 **보호 파일(protected) 목록은 지금 바로 유효**하니 따를 것: `apps/mobile/platform/**`, `apps/mobile/features/study-session/**`, `packages/study-core/**`, `apps/mobile/app/room/[id].tsx` — 다른 작업(예: 화면 UI 작업)을 하다가 이 경로를 건드려야 하면 먼저 diff를 확인하고 사용자 승인을 받을 것.

## 하지 말 것

- `apps/mobile/platform/*`, `packages/study-core` 등 네이티브 전환용 자산을 삭제하지 말 것 — 지금은 비활성이지만 [ADR 0003](./docs/adr/0003-phased-rollout-webview-mvp-then-native.md)에 따라 보존 중이다.
- 실기기 기술 스파이크(온디바이스 Vision, LiveKit RN SDK 호환성 검증)가 끝나기 전에 네이티브로 조기 전환하지 말 것 — MVP는 WebView로 간다는 게 현재 결정이다.
- 검증되지 않은 네이티브 라이브러리를 추측으로 설치하지 말 것 — 인터페이스+mock으로 두고 실제 기기 스파이크로 검증한다.
- 공유 패키지(`study-core` 등)에 React Native/DOM/MediaPipe/LiveKit 의존성을 추가하지 말 것.
- 패키지 매니저를 npm/yarn으로 바꾸지 말 것 (pnpm 고정).
- `packages/config`의 공유 규칙을 개별 앱에서 무시하려면 반드시 이유를 주석으로 남길 것.
- 위 Codex 스펙 문서를 "이미 도입된 상태"로 착각해서 없는 `AGENTS.md`/`docs/screens/`/`dev` 브랜치/Ruleset을 있다고 가정하지 말 것 — 실제로 만들거나 사용자에게 도입 여부부터 확인할 것.
