# 실기기에서 웹 dev 서버 열기 런북

모바일 앱은 모든 화면을 원격 URL 웹뷰로 연다([ADR 0001](../adr/0001-webview-based-study-room-architecture.md)). 실기기에서 로컬 웹 dev 서버로 화면을 검증할 때 쓴다. `getUserMedia`가 secure context를 요구해 플랫폼마다 접근 경로가 다르다.

## 웹 dev 서버는 반드시 dev 스크립트로 띄운다

```bash
pnpm --filter web dev
```

`dev` 스크립트가 vite 앞에서 `public/mediapipe/wasm/`을 패키지에서 복사한다. `exec vite`로 직접 띄우면 이 단계를 건너뛰어 새 워크트리에서 wasm 404로 감지가 통째로 죽는다. 홈·기록만 여는 검증은 wasm을 요청하지 않아 이 문제가 드러나지 않는다. 포트를 바꾸려면 `pnpm --filter web dev -- --port 5199`처럼 스크립트를 거쳐 인자를 넘긴다.

## Android

`http://`는 `localhost`일 때만 secure context로 인정된다. `adb reverse`로 기기의 localhost를 Mac으로 넘긴다.

```bash
pnpm --filter web dev                     # Vite 5173
adb reverse tcp:5173 tcp:5173
# apps/mobile/.env.local: WEB_BASE_URL=http://localhost:5173
```

## iOS

`adb reverse`에 해당하는 것이 없다. LAN IP를 http로 쓰면 secure context가 아니라 카메라가 막히므로 HTTPS가 필수다.

```bash
brew install mkcert nss
sudo mkcert -install                       # Mac 키체인에 루트 CA 등록
cd apps/web && mkdir -p .certs && cd .certs
mkcert 192.168.0.19 localhost 127.0.0.1 ::1   # 본인 Mac의 LAN IP

VITE_DEV_HTTPS=1 pnpm --filter web dev     # 옵트인이다 (아래 주의)
# apps/mobile/.env.local: WEB_BASE_URL=https://192.168.0.19:5173
```

기기에는 `mkcert -CAROOT`의 `rootCA.pem`을 옮겨 프로파일을 설치하고 설정 → 일반 → 정보 → 인증서 신뢰 설정에서 신뢰시킨다. LAN IP는 네트워크가 바뀌면 달라지므로 그때마다 인증서를 다시 만든다.

HTTPS는 `VITE_DEV_HTTPS=1`일 때만 켜진다. 인증서 파일이 남아 있다는 이유로 프로토콜이 바뀌면 안 된다. `.certs/`는 개인 키라 gitignore 대상이다.

## 클라이언트 격리 네트워크(AP isolation)

회사망 등에서 폰·Mac이 같은 Wi-Fi인데도 서로 통신이 안 되면 LAN IP 경로는 어떤 설정으로도 뚫리지 않는다. 이때는 cloudflared로 Vite와 Metro를 각각 터널링한다. 터미널 네 개를 순서대로 띄운다.

```bash
# 1) Vite (터널 모드, http)
VITE_DEV_TUNNEL=1 pnpm --filter web dev    # VITE_DEV_HTTPS는 같이 주지 말 것
# 2) Vite 터널 — 발급된 https URL을 받는다
cloudflared tunnel --url http://localhost:5173
# 3) Metro 터널 — 발급된 https URL을 받는다
cloudflared tunnel --url http://localhost:8081
# 4) apps/mobile/.env.local에 Vite 터널 주소를 먼저 넣는다 (Metro가 이 값을 읽는다)
#    WEB_BASE_URL=https://<발급된-vite>.trycloudflare.com
# 5) Metro — 3)에서 받은 주소를 넘겨 시작한다
EXPO_PACKAGER_PROXY_URL=https://<발급된-metro>.trycloudflare.com pnpm --filter mobile start
```

`VITE_DEV_TUNNEL=1`은 `apps/web/vite.config.ts`의 터널 모드를 켜 발급 URL을 허용 호스트에 넣는다. `EXPO_PACKAGER_PROXY_URL`은 Metro가 기기에 안내하는 번들 주소를 터널 주소로 바꾼다. 터널 주소는 만료형이라 세션마다 새로 발급되고, 공개 URL이라 검증이 끝나면 반드시 내린다.

## Dev Client 반영

Dev Client에서는 주소가 Metro 매니페스트로 오므로 Metro만 재시작하면 반영된다. 3티어 환경 값의 원천과 파생은 [ADR 0007](../adr/0007-three-tier-environment-model-and-eas-profiles.md)을 본다.
