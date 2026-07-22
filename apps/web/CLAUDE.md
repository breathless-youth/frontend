# apps/web

Vite + React 웹 앱. 브라우저용 스터디룸(WebRTC + Vision AI)과 서비스 소개 페이지를 제공하는 구현체다. **지금은 `apps/mobile`이 이 앱의 `/room/:id`를 WebView로 그대로 로드한다** — 즉 이 앱이 곧 모바일 스터디룸의 실제 구현체다(MVP). 그와 별개로 독립 브라우저 서비스로도 배포 가능하다. 배경은 루트 [CLAUDE.md](../../CLAUDE.md), [ADR 0001](../../docs/adr/0001-webview-based-study-room-architecture.md)(활성 구조), [ADR 0003](../../docs/adr/0003-phased-rollout-webview-mvp-then-native.md)(왜 이 구조인지) 참고. 네이티브 전환 로드맵은 [ADR 0002](../../docs/adr/0002-native-mobile-study-room-and-independent-web.md).

## 역할

- 브라우저용 싱글 세션 / 멀티 종일룸(브라우저 `getUserMedia` + MediaPipe + LiveKit **Web** SDK) — **모바일 WebView가 그대로 로드하는 화면**.
- 서비스 소개 / 랜딩 페이지.
- 독립 배포 가능한 웹 서비스(모바일과 무관하게 브라우저로 직접 접근 가능).

모바일(dormant 네이티브 화면 포함)과 동일한 도메인 규칙·계산은 `@focuson/study-core`(순수 TS)로 공유하되, 카메라·Vision·WebRTC 구현체는 웹 전용(브라우저 API)이다. 모바일과 SDK 객체를 공유하지 않는다.

## 구조

- `src/routes/` — 페이지 컴포넌트 (`react-router-dom`으로 연결).
- `src/features/vision/` — MediaPipe 기반 브라우저 집중도 감지 로직(웹 독립 구현체).
- `src/features/study-session/useWebStudySession.ts` — `@focuson/study-core`로 총공부시간/순공시간/집중률을 집계하는 훅(`useFocusDetector`의 `isFocused`를 STUDYING/AWAY로 매핑). 모바일 `useStudySession`과 같은 패턴.
- `src/features/` — 필요 시 `social-room` 등 다른 기능 디렉터리를 추가(실제 구현 생길 때 생성).
- `src/components/ui/` — shadcn 스타일 프리미티브. 새 컴포넌트를 추가할 때 이 디렉터리 관례(`cva` variants, `cn` 헬퍼)를 따른다.
- `src/lib/utils.ts` — `cn` 등 공용 유틸.
- 경로 별칭 `@/*` → `src/*` (`tsconfig.app.json`, `vite.config.ts` 양쪽에 정의되어 있음 — 하나만 바꾸지 말 것).

## 개인정보 원칙

브라우저 MediaPipe 추론은 클라이언트에서만 수행한다. 원본 프레임·얼굴 데이터를 서버로 보내지 않는다. 멀티룸에서 카메라 영상은 LiveKit으로 전송되지만(녹화·저장 안 함) AI 분석용 원본 데이터는 전송하지 않는다. 싱글/멀티 안내 문구를 동일하게 쓰지 말 것(멀티룸에서 "영상이 서버로 전송되지 않는다"는 오해 소지). 자세한 근거는 [ADR 0002](../../docs/adr/0002-native-mobile-study-room-and-independent-web.md).

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
- LiveKit/MediaPipe 연동 코드는 아직 placeholder 수준이다(백엔드 토큰 서버 없음) — 실제 룸 연결 전에 반드시 방 토큰 발급 API가 준비되어 있는지 확인할 것. 하드코딩된 공개 키/토큰을 커밋하지 않는다.
- 공부 상태·집중률 계산은 `@focuson/study-core`를 사용한다(웹에서 직접 재구현하지 말 것) — `src/features/study-session/useWebStudySession.ts` 참고.
