# apps/web

Vite + React 웹 앱. 세션 화면의 실제 구현체 — 모바일이 WebView로 로드하고([../../docs/architecture.md](../../docs/architecture.md)), 독립 브라우저 서비스로도 배포 가능하다. 프로젝트 공통 규칙·SSOT는 루트 [AGENTS.md](../../AGENTS.md)와 `.ai/` 위키를 따른다.

## 역할과 현재 상태

- `src/routes/HomePage.tsx` — 서비스 소개/랜딩.
- `src/routes/RoomPage.tsx` — 세션 화면 S3-1~S3-8(프리뷰·비집중·일시정지·심플 모드·가로·종료 플로우) 확정 디자인 적용. **카메라·Vision 감지는 인터페이스+mock** — `getUserMedia`·TensorFlow.js·EfficientDet 등 어떤 SDK도 아직 설치하지 않았다(실기기 스파이크 전 설치 금지, 루트 AGENTS.md).
- `src/routes/ResultPage.tsx` — S4 공부 결과(`/room/:id/result`).
- 세션 상태기계·타이머·판정은 이 앱이 쥔다. 제출 페이로드는 `Omit<StudySessionCreateRequest, "userId">`까지 만들고, WebView 모드에선 네이티브가 저장·전송한다 — [세션 상태 모델·서버 계약 스펙](../../docs/superpowers/specs/2026-07-26-session-state-model-and-contract-design.md) 참고. 순수 계산은 신설 예정인 `@focuson/study-core`로 분리한다(화면 컴포넌트에서 직접 구현 금지).

## 구조

- `src/routes/` — 페이지 컴포넌트(`react-router-dom`). `__tests__/` 포함.
- `src/components/ui/` — shadcn 스타일 프리미티브(`cva` variants, `cn` 헬퍼 관례).
- `src/lib/utils.ts` — `cn` 등 공용 유틸.
- 경로 별칭 `@/*` → `src/*` (`tsconfig.app.json`, `vite.config.ts` 양쪽에 정의 — 하나만 바꾸지 말 것).

## 개인정보 원칙 (변경 불가)

Vision 추론은 클라이언트(브라우저/WebView)에서만 수행한다. 원본 프레임을 서버로 보내지 않는다. V1.0에는 영상 공유가 없으므로 싱글 기준 표준 문구(`.ai/product/voice-tone.md`)만 쓴다. 소셜 영상 공유(V1.3, WebRTC P2P)는 위키 [ADR-0002](../../.ai/decisions/0002-social-video-p2p.md) 승인 대기 — 관련 UI·문구를 미리 만들지 않는다.

## 명령

```bash
pnpm --filter web dev
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build
```

## 컨벤션

- 스타일링은 Tailwind v4(`@tailwindcss/vite`, CSS `@theme inline` 토큰) — `tailwind.config.js` 없이 `src/index.css`에서 테마 정의.
- 새 shadcn 컴포넌트는 `shadcn-ui`/`tailwind-theme-builder` 스킬로 추가하거나 `src/components/ui/button.tsx` 패턴을 수동으로 따른다.
- 화면은 402×874 고정이 아니라 임의 크기 WebView/브라우저 뷰포트에서 동작해야 한다 — 절대 좌표 금지, `env(safe-area-inset-*)` 사용(화면 스펙 공통 규칙).
- 하드코딩된 공개 키/토큰을 커밋하지 않는다.
