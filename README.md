# FocusOn FE

AI Vision 기반 순공 시간 측정 캠스터디 서비스 프론트엔드 모노레포. 모바일(`apps/mobile`)은 스터디룸을 **WebView로 `apps/web`을 로드**하고(MVP), 웹(`apps/web`)이 실제 구현체다. 네이티브 구현(카메라·온디바이스 Vision·LiveKit RN)은 로드맵으로 보존되어 있다. 두 앱은 `packages/study-core`(순수 TS 계산)와 공유 타입·디자인 토큰만 공유한다.

- 개발/협업 규칙: [CLAUDE.md](./CLAUDE.md)
- 아키텍처: [docs/architecture.md](./docs/architecture.md) · [ADR 0001](./docs/adr/0001-webview-based-study-room-architecture.md)(활성) · [ADR 0003](./docs/adr/0003-phased-rollout-webview-mvp-then-native.md)(왜 이 구조인지) · [ADR 0002](./docs/adr/0002-native-mobile-study-room-and-independent-web.md)(향후 네이티브 로드맵)
- 도메인 용어: [docs/domain-glossary.md](./docs/domain-glossary.md)
- 화면 소유권: [docs/screen-ownership.md](./docs/screen-ownership.md)
- Expo Go 연결 문제: [docs/runbooks/expo-go-connection.md](./docs/runbooks/expo-go-connection.md)

## 시작하기

```bash
pnpm install
pnpm --filter mobile start   # Expo dev server — Expo Go로 바로 스캔 가능
pnpm --filter web dev        # Vite dev server
```

Expo Go가 LAN 서버에 연결하지 못하면, 같은 네트워크를 다시 바꾸기 전에 [Expo Go 연결 런북](./docs/runbooks/expo-go-connection.md)의 터널 실행 절차를 사용한다.

`apps/mobile`은 지금 Expo Go와 호환되지 않는 네이티브 모듈을 쓰지 않으므로 Development Build가 필요 없다. 자세한 내용은 [apps/mobile/CLAUDE.md](./apps/mobile/CLAUDE.md).
