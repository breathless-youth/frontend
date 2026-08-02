# apps/web

Vite + React 웹 앱. 브라우저용 스터디룸(WebRTC + Vision AI)의 구현체가 될 자리다 — 모바일이 `/room/:id`를 WebView로 로드하는 구조(ADR 0001)는 방침으로 유지된다. **2026-07-25 기능 리셋으로 스터디룸·Vision 관련 코드는 전부 삭제됐고, 지금은 홈(랜딩)만 있다**(과거 구현은 git 히스토리 참고 — ADR 0003 갱신 노트). 독립 브라우저 서비스로도 배포 가능하다. 배경은 루트 [CLAUDE.md](../../CLAUDE.md), [ADR 0001](../../docs/adr/0001-webview-based-study-room-architecture.md), [ADR 0003](../../docs/adr/0003-phased-rollout-webview-mvp-then-native.md) 참고. 네이티브 전환 로드맵은 [ADR 0002](../../docs/adr/0002-native-mobile-study-room-and-independent-web.md).

## 역할

- (재구축 예정) 브라우저용 싱글 세션 / 멀티 종일룸(브라우저 `getUserMedia` + MediaPipe + LiveKit **Web** SDK) — 모바일 WebView가 그대로 로드할 화면.
- 서비스 소개 / 랜딩 페이지 (현재 유일한 화면).
- 독립 배포 가능한 웹 서비스(모바일과 무관하게 브라우저로 직접 접근 가능).

## 구조

- `src/routes/` — 페이지 컴포넌트 (`react-router-dom`으로 연결). 현재 `HomePage`만.
- `src/features/` — 기능 디렉터리(실제 구현이 생길 때 생성 — 과거 `vision`/`study-session` 구조는 git 히스토리 참고).
- `src/components/ui/` — shadcn 스타일 프리미티브. 새 컴포넌트를 추가할 때 이 디렉터리 관례(`cva` variants, `cn` 헬퍼)를 따른다.
- `src/lib/utils.ts` — `cn` 등 공용 유틸.
- 경로 별칭 `@/*` → `src/*` (`tsconfig.app.json`, `vite.config.ts` 양쪽에 정의되어 있음 — 하나만 바꾸지 말 것).

## 개인정보 원칙 (재구축 시에도 변경 불가)

브라우저 MediaPipe 추론은 클라이언트에서만 수행한다. 원본 프레임·얼굴 데이터를 서버로 보내지 않는다. 멀티룸에서 카메라 영상은 LiveKit으로 전송되지만(녹화·저장 안 함) AI 분석용 원본 데이터는 전송하지 않는다. 싱글/멀티 안내 문구를 동일하게 쓰지 말 것(멀티룸에서 "영상이 서버로 전송되지 않는다"는 오해 소지). 자세한 근거는 [ADR 0002](../../docs/adr/0002-native-mobile-study-room-and-independent-web.md).

## 에러 모니터링 (Sentry)

`src/lib/sentry.ts`에서 `@sentry/react`를 초기화한다(`main.tsx`가 렌더 전에 호출).

- **DSN은 `VITE_SENTRY_DSN` 환경변수로만 주입한다** — 미설정이면 초기화 자체를 건너뛰므로 로컬 개발·테스트·CI는 DSN 없이 그대로 돈다. 배포 환경(Vercel)의 env에 설정한다. DSN을 코드에 하드코딩하지 말 것.
- **Session Replay를 추가하지 말 것** — 카메라 프리뷰가 뜨는 세션 화면을 녹화 수집하는 것은 위 개인정보 원칙과 충돌한다. 라우팅 트레이스(`reactRouterV7BrowserTracingIntegration`, 표본 0.2)와 에러 수집만 쓴다.
- React 렌더 에러는 `createRoot`의 React 19 에러 훅(`sentryRootOptions`)으로 잡는다 — 별도 ErrorBoundary UI를 두지 않았다.

## 사용 분석 (GA4)

`src/lib/analytics.ts`에서 gtag.js를 초기화한다(`main.tsx`가 렌더 전에 호출).

- **측정 ID는 `VITE_GA4_MEASUREMENT_ID` 환경변수로만 주입한다** — 미설정이면 초기화 자체를 건너뛴다(로컬 개발·테스트·CI 영향 없음). 배포 환경(Vercel) env에 설정한다.
- SPA라 자동 page_view를 끄고(`send_page_view: false`) `AnalyticsRouteTracker`가 라우트 변경마다 직접 보낸다 — GA4 Enhanced Measurement의 History 감지를 켜도 이 구조와 중복 집계되니 GA4 관리 콘솔에서 "브라우저 기록 이벤트 기반 페이지 조회"를 꺼둘 것.
- 공부 상태·집중률·카메라 관련 데이터를 GA4 이벤트로 보내지 말 것 — 분석은 화면 사용 흐름까지만. 상세 데이터는 자체 API 집계가 소유한다.

## 명령

```bash
pnpm --filter web dev
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build
```

## 컨벤션

- 스타일링은 Tailwind v4(`@tailwindcss/vite`, CSS `@theme inline` 토큰) — `tailwind.config.js` 파일 없이 `src/index.css`에서 테마를 정의한다.
- 새 shadcn 컴포넌트는 `shadcn-ui`/`tailwind-theme-builder` 스킬로 추가하거나 기존 `src/components/ui/button.tsx` 패턴을 따라 수동 작성한다.
- LiveKit/MediaPipe를 재도입할 때는 방 토큰 발급 API가 준비되어 있는지 먼저 확인할 것. 하드코딩된 공개 키/토큰을 커밋하지 않는다.
- 공부 상태·집중률 계산은 화면 컴포넌트에서 직접 구현하지 말고 순수 TS 공유 패키지로 분리한다(과거 `@focusmakers/study-core` 패턴).
