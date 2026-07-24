# FocusOn FE — AI 에이전트 안내

AI Vision 기반 집중 시간 측정 앱 **FocusOn**(가칭)의 프론트엔드 모노레포다.

## SSOT: `.ai/` 위키를 먼저 읽을 것

프로젝트 공통 지식(기획·로드맵·컨벤션)은 `.ai/` 서브모듈이 단일 진실 공급원이다. 이 문서와 위키가 다르면 **위키가 우선**이며, 발견 즉시 이 문서 수정을 제안한다.

- `.ai/ai/agent-rules.md` — **필수 규칙: 직접 push/merge 금지, main·dev 직접 커밋 금지, 커밋 전 린트·테스트, 구조 변경 사전 협의, 미확정 값 임의 확정 금지**
- `.ai/product/roadmap.md` — 버전 범위. **현재 개발 범위는 V1.0만** (측정 코어 + 기록 + 스트릭, 소셜·로그인 없음)
- `.ai/product/mvp-scope.md` — 감지 로직 3종·파라미터·세션 UX 정책
- `.ai/product/user-flow.md` / `.ai/product/design.md` — 화면 목록·디자인 토큰
- `.ai/conventions/git-workflow.md` — `main ← dev ← feature/SCRUM-NNN-요약` 브랜치, 커밋 제목 끝 `(SCRUM-123)` 필수
- `.ai/conventions/coding-style.md`, `.ai/project/glossary.md`

`.ai/`가 비어 있으면: `git submodule update --init`

## 활성 아키텍처 (V1.0, 2026-07-24 확정)

- **Expo(RN) 앱이 셸**: 홈·기록·설정 3탭은 네이티브 화면. 익명 기기 계정(UUID)·세션 기록은 Expo 로컬 저장소에 보관.
- **세션(집중 측정) 화면만 WebView**: `apps/mobile/app/room/[id].tsx`가 `apps/web`을 로드. 감지는 WebView 내 MediaPipe Object Detector(EfficientDet-Lite0)로 이탈·폰 사용을, 가속도(기기 조작)는 RN `expo-sensors`에서 읽어 postMessage로 전달. 세션 결과는 WebView → RN postMessage로 회수해 RN에 저장.
- **서버 동기화는 인터페이스+mock**: API 스펙은 BE와 미협의. 로컬 저장으로 완결하고 동기화 레이어만 열어둔다.
- 근거 ADR: [0001](./docs/adr/0001-webview-based-study-room-architecture.md)(WebView), [0003](./docs/adr/0003-phased-rollout-webview-mvp-then-native.md)(네이티브는 로드맵). 네이티브 전환용 자산은 `apps/mobile/platform/*`, `apps/mobile/features/study-session/*`에 **dormant 보존** — 삭제 금지.
- `docs/screens/SCR-002-auth.md`(로그인)·`SCR-016-all-day-room.md`(멀티 종일룸)는 **V1.2+ 보류** — V1.0 작업에서 참조·구현하지 않는다.

## 모노레포 구조

- `apps/mobile` — Expo RN 앱(`expo-router`). 앱 셸 + 3탭 + 세션 WebView. 규칙: [apps/mobile/CLAUDE.md](./apps/mobile/CLAUDE.md)
- `apps/web` — Vite + React. 세션 화면의 실제 구현체(MediaPipe). 규칙: [apps/web/CLAUDE.md](./apps/web/CLAUDE.md)
- `packages/study-core` — 순수 TS 도메인 코어(상태·타임라인·집계 계산). **RN/DOM/MediaPipe/LiveKit 의존 금지.**
- `packages/types` — API 계약·전송용 타입. `packages/design-tokens` — 시맨틱 디자인 토큰(`.ai/product/design.md`가 원본). `packages/config` — 공유 ESLint/Prettier.

## 아키텍처 경계

- 플랫폼 카메라 구현 ↔ 공부 상태 계산 분리. Vision 구현 ↔ 세션 집계 분리.
- UI 컴포넌트는 카메라·센서 SDK를 직접 호출하지 않는다.
- 감지 판정 유지시간·프레임 주기·가속도 임계값·자동종료 N분은 **설정 파라미터로만** 구현 (위키 미확정 항목).

## 개인정보 원칙 (변경 불가)

- 온디바이스 추론: 카메라 원본 프레임·얼굴 데이터는 단말(WebView 포함) 밖으로 내보내지 않는다 — 서버 전송·저장·로그 금지. 서버에는 상태 이벤트·세션 집계만.
- V1.0은 영상이 어디에도 전송되지 않는다. (멀티룸 LiveKit 문구 구분은 V1.2+에서 `.ai/product/policies.md` 참조)

## 개발 명령

pnpm 고정, 루트에서 Turborepo 실행.

```bash
pnpm install
pnpm dev / lint / typecheck / test
pnpm --filter mobile dev   # Expo Go
pnpm --filter web dev
```

## 코딩 컨벤션

- TypeScript strict 고정. `any` 금지, 타입 전용 import는 `import type`.
- 각 패키지는 `lint`/`typecheck`/`test` 스크립트를 동일 이름으로 노출.
- 커밋: Conventional Commits + 제목 끝 `(SCRUM-123)` (`.ai/conventions/git-workflow.md`). commitlint는 기본 conventional 타입만 통과한다 — `feat`/`fix`/`docs`/`style`/`chore`/`refactor`/`test`/`build`/`ci`/`perf`만 사용.
- 로그인은 V1.2+ (Google/Apple만). V1.0에 인증 코드를 추가하지 않는다.

## 하지 말 것

- 직접 push/merge, `main`·`dev` 직접 커밋 (`.ai/ai/agent-rules.md`).
- dormant 네이티브 자산(`apps/mobile/platform/*`, `packages/study-core` 등) 삭제.
- 실기기 스파이크 없이 네이티브 조기 전환, 미검증 네이티브 라이브러리 추측 설치.
- 공유 패키지에 RN/DOM/MediaPipe/LiveKit 의존성 추가. 패키지 매니저 변경(pnpm 고정).
- 위키 "미정" 항목(감지 임계값 등) 임의 확정 — 파라미터로 열어두거나 질문할 것.
- V1.0 범위 밖(소셜·로그인·종일룸) 코드/문서를 V1.0 작업에 끌어들이지 말 것.
