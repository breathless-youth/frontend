# FocusOn FE

수험생 집중 습관 앱 **FocusON**(가칭)의 프론트엔드 모노레포. 전면 카메라 + 온디바이스 객체 인식(EfficientDet-Lite0) + 가속도 센서로 비집중을 감지해 학습 타이머를 자동 제어하고, 순공시간·총 공부 시간·집중률을 기록한다. 모바일(`apps/mobile`)은 앱 셸을 담당하고 세션 화면은 **WebView로 `apps/web`을 로드**한다. `apps/web`은 독립 브라우저 서비스로도 배포 가능하다.

- 프로젝트 지식 SSOT: `.ai/` 서브모듈(프로젝트 위키) — 비어 있으면 `git submodule update --init`
- 개발/협업 규칙: [AGENTS.md](./AGENTS.md) (`CLAUDE.md`는 이 문서를 임포트)
- 아키텍처: [docs/architecture.md](./docs/architecture.md) — WebView 방침의 경위·전환 조건 포함(구 fe ADR은 위키 `.ai/decisions/`로 이관 제안 중)
- 도메인 용어: [.ai/project/glossary.md](./.ai/project/glossary.md)(SSOT) · [docs/domain-glossary.md](./docs/domain-glossary.md)(fe 계약 매핑)
- 화면 소유권·구현 상태: [docs/screen-ownership.md](./docs/screen-ownership.md)
- Expo Go 연결 문제: [docs/runbooks/expo-go-connection.md](./docs/runbooks/expo-go-connection.md)

## 시작하기

```bash
git clone --recurse-submodules <repo-url>   # 이미 클론했다면: git submodule update --init
pnpm install
pnpm --filter mobile start   # Expo dev server — Expo Go로 바로 스캔 가능
pnpm --filter web dev        # Vite dev server
```

Expo Go가 LAN 서버에 연결하지 못하면, 같은 네트워크를 다시 바꾸기 전에 [Expo Go 연결 런북](./docs/runbooks/expo-go-connection.md)의 터널 실행 절차를 사용한다.

`apps/mobile`은 지금 Expo Go와 호환되지 않는 네이티브 모듈을 쓰지 않으므로 Development Build가 필요 없다. 자세한 내용은 [apps/mobile/CLAUDE.md](./apps/mobile/CLAUDE.md).
