# FocusMakers FE

AI Vision 기반 순공 시간 측정 캠스터디 서비스의 프론트엔드 모노레포. AI Vision으로 사용자의 공부 상태를 **단말 내부에서** 분석해 총 공부시간·순공시간·집중률을 제공하고, 싱글 스터디룸(개인 집중도 측정)과 멀티룸(WebRTC P2P 기반 그룹 화면 공유 — [ADR 0006](./docs/adr/0006-p2p-mesh-stomp-over-livekit.md))을 지원한다. 용어는 [docs/domain-glossary.md](./docs/domain-glossary.md) 참고.

## 아키텍처

모바일 스터디룸은 `apps/web`을 WebView로 로드한다([ADR 0001](./docs/adr/0001-webview-based-study-room-architecture.md)). 이 방침으로 되돌린 경위와 무엇을 보존했는지는 [ADR 0003](./docs/adr/0003-phased-rollout-webview-mvp-then-native.md)에 나와있다. 초기 명세 기반 임시 구현을 삭제한 이력은 ADR 0003 갱신 노트에 있고 삭제 코드는 git 히스토리에서 복구한다. 설계·실측은 [vision-pipeline-design](./docs/superpowers/specs/2026-07-27-study-session-vision-pipeline-design.md) 참고.

## 모노레포 구조

- `apps/mobile` — Expo RN 앱(`expo-router`). 앱 셸(인증/네비게이션) + 스터디룸은 WebView로 `apps/web`을 로드. 규칙은 [apps/mobile/CLAUDE.md](./apps/mobile/CLAUDE.md).
- `apps/web` — Vite + React 웹 앱. 스터디룸의 실제 구현체이자 독립 브라우저 서비스로도 배포 가능. 규칙은 [apps/web/CLAUDE.md](./apps/web/CLAUDE.md).
- `packages/types` — 서버 전송용/API 계약 도메인 타입. **실제 백엔드 Swagger 기준으로만 정의한다**(명세에 없는 타입 금지). `packages/design-tokens`는 공유 의미 기반 디자인 토큰(구현체는 공유 안 함), `packages/config`는 공유 ESLint/Prettier 설정.

## 아키텍처 경계 (반드시 유지)

- **플랫폼 카메라 구현·Vision AI 구현·세션 집계 로직·WebRTC 구현을 서로 분리한다.** 전송 방식은 P2P 풀메시 + STOMP 제어 채널이다([ADR 0006](./docs/adr/0006-p2p-mesh-stomp-over-livekit.md)).
- UI 컴포넌트는 카메라·WebRTC API를 직접 호출하지 않는다. 어댑터 계층을 통한다.
- 공유 패키지(`types`, `design-tokens`)는 React Native, DOM, MediaPipe, 미디어 SDK에 직접 의존하지 않는다.

## 개인정보 원칙 (변경 불가, WebView·네이티브 공통)

- **온디바이스 Vision AI**: 카메라 원본 프레임·얼굴 이미지·랜드마크 좌표는 단말 내부에서만 처리한다. 서버 전송·파일/캐시/DB 저장·로그 기록 금지. 서버에는 공부 상태 이벤트와 세션 집계 결과만 전송한다.
- **싱글룸**: 영상 자체가 어디에도 전송되지 않는다.
- **멀티룸**: 카메라 영상은 화면 공유를 위해 WebRTC P2P로 상대 참여자에게 직접 전송된다(서버 미경유, TURN은 암호화 페이로드 경유만, 녹화·영구저장 없음). "영상이 서버로 전송되지 않는다"고 쓰지 말 것. "AI 분석용 원본 프레임·얼굴 데이터가 서버로 전송되지 않는다"로 표현한다.
- 싱글룸과 멀티룸의 개인정보 안내 문구를 동일하게 쓰지 말 것. 근거는 [ADR 0002](./docs/adr/0002-native-mobile-study-room-and-independent-web.md).

## 개발 명령

패키지 매니저는 pnpm 고정. 루트에서 Turborepo로 실행한다.

```bash
pnpm install
pnpm dev             # 전체 dev 서버 (turbo)
pnpm lint            # 전체 lint
pnpm typecheck       # 전체 typecheck
pnpm test            # 전체 test
pnpm --filter mobile start # mobile만 (mobile은 dev가 아니라 start)
pnpm --filter web dev      # web만
```

## 코딩 컨벤션

- TypeScript strict 고정(`tsconfig.base.json`). `any` 대신 명시적 타입, 타입 전용 import는 `import type`.
- 각 패키지는 `lint`/`typecheck`/`test` 스크립트를 같은 이름으로 노출한다. 새 패키지도 이 3개를 반드시 채운다(내용이 없으면 `echo ... && exit 0`이라도).
- 공유 로직/타입은 `packages/*`로 올린다. 특정 화면에서만 쓰는 코드를 패키지로 미리 빼지 않는다.
- 커밋 메시지는 Conventional Commits. `commitlint`(`@commitlint/config-conventional` 기본값)가 강제하므로 안전한 타입은 `feat`/`fix`/`docs`/`style`/`chore`/`refactor`/`test`/`build`다.
- **PR 제목은 `[타입] BY-N 제목` 형식**(티켓 없는 잡무는 `[chore] 제목`, `dev → main` 릴리즈는 `[release] 제목`). Conventional Commits 스타일(`feat(web): ...`)을 PR 제목에 쓰지 말 것. Jira 키 자리에 GitHub 이슈번호를 쓰지 말 것. CI `pr-title` job이 강제한다.
- PR은 `.github/pull_request_template.md` 체크리스트를 따른다. 구조·아키텍처 변경 시 `docs/adr/`에 ADR을 추가한다.

## 하지 말 것

- 백엔드 Swagger에 없는 API 계약 타입을 명세 없이 만들지 말 것.
- 실기기 기술 스파이크(온디바이스 Vision, WKWebView의 getUserMedia + RTCPeerConnection 공존)가 끝나기 전에 네이티브로 조기 전환하지 말 것.
- 검증되지 않은 네이티브 라이브러리를 추측으로 설치하지 말 것. 인터페이스 + mock으로 두고 실기기 스파이크로 검증한다.
- 공유 패키지에 React Native/DOM/MediaPipe/미디어 SDK 의존성을 추가하지 말 것.
- 패키지 매니저를 npm/yarn으로 바꾸지 말 것(pnpm 고정). `packages/config`의 공유 규칙을 개별 앱에서 무시하려면 반드시 이유를 주석으로 남길 것.
