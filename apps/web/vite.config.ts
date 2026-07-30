import fs from "node:fs";
import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

import { WASM_PUBLIC_DIR, WASM_SENTINEL_FILE } from "./scripts/copyMediapipeWasm.js";

/**
 * MediaPipe wasm이 `public/`에 실제로 있는지 **빌드 시작 전에** 확인한다.
 *
 * `public/mediapipe/`는 생성물이라 `.gitignore` 대상이고, 갓 클론한 저장소에는 없다.
 * `pnpm --filter web build`는 앞에 복사 스크립트를 달고 있지만 `vite build`를 직접 부르면
 * 그 스텝을 건너뛰게 되고, 그러면 **에러 없이 wasm 없는 `dist`가 나온다.** 그 산출물은
 * `syncWebDist.js`를 타고 앱 번들까지 그대로 흘러가서, 사용자가 세션을 시작하는 순간에야
 * 404로 죽는다 — 빌드에서 잡을 수 있었던 실패를 런타임까지 미루는 셈이다.
 *
 * 모델(`public/models/`)은 커밋되어 있어 이 검사가 필요 없다. 없으면 그건 자산 문제가 아니라
 * 체크아웃 문제다.
 */
function requireMediapipeWasm() {
  return {
    name: "focuson:require-mediapipe-wasm",
    // dev 서버·vitest에는 걸지 않는다. 이 검사가 막으려는 것은 "잘못된 산출물"이다.
    apply: "build",
    buildStart() {
      const sentinel = path.join(WASM_PUBLIC_DIR, WASM_SENTINEL_FILE);
      if (!fs.existsSync(sentinel)) {
        throw new Error(
          `MediaPipe wasm 런타임이 없습니다: ${sentinel}\n` +
            "'pnpm --filter web prepare-assets'를 실행한 뒤 다시 빌드하세요 " +
            "(pnpm --filter web build는 이 스텝을 자동으로 먼저 돌립니다).",
        );
      }
    },
  } as const;
}

/** mkcert가 만든 dev 인증서를 두는 곳. 생성물이라 `.gitignore` 대상이다. */
const CERT_DIR = path.resolve(__dirname, ".certs");

/**
 * dev 서버용 HTTPS 설정 — **`VITE_DEV_HTTPS=1`일 때만 켠다.**
 *
 * ## 왜 필요한가
 *
 * iOS 실기기에서 세션 화면을 Vite dev 서버로 띄우려면 HTTPS가 **필수**다.
 * `getUserMedia`는 secure context에서만 카메라를 여는데, `http://`는 `localhost`일 때만
 * secure context로 인정된다. iOS에는 `adb reverse`에 해당하는 수단이 없어 LAN IP를 써야 하고,
 * `http://192.168.x.x`는 secure context가 아니라 카메라가 통째로 막힌다.
 *
 * ## 왜 인증서 존재만으로 켜지 않는가
 *
 * **Android는 반대로 http여야 한다.** `adb reverse`로 기기의 `localhost:5173`을 Mac에
 * 연결하면 http로도 secure context가 성립하는데, 여기서 https로 뜨면 에뮬레이터·실기기가
 * mkcert 루트 CA를 신뢰하지 않아 WebView가 **인증서 오류로 막힌다**(Android는 Mac 키체인과
 * 별개의 트러스트 스토어를 쓴다). 인증서 파일이 남아 있다는 이유만으로 프로토콜이 바뀌면
 * 그날따라 Android가 안 되는 이유를 찾기 어렵다. 그래서 명시적으로 켠다.
 *
 * ## 설정
 *
 * ```bash
 * brew install mkcert nss
 * sudo mkcert -install                        # Mac 키체인에 루트 CA 등록
 * cd apps/web && mkdir -p .certs && cd .certs
 * mkcert 192.168.0.19 localhost 127.0.0.1 ::1  # 본인 Mac의 LAN IP
 * ```
 *
 * 기기 쪽에는 `mkcert -CAROOT`의 `rootCA.pem`을 옮겨 설치하고,
 * 설정 → 일반 → 정보 → 인증서 신뢰 설정에서 신뢰시켜야 한다.
 *
 * 파일명을 고정하지 않고 디렉터리를 훑는 이유는 mkcert가 **첫 호스트 이름으로 파일명을 짓기
 * 때문**이다(`192.168.0.19+3.pem`). LAN IP는 네트워크마다 달라져 고정할 수 없다.
 */
function devHttps(): { key: Buffer; cert: Buffer } | undefined {
  if (process.env.VITE_DEV_HTTPS !== "1") {
    return undefined;
  }
  if (!fs.existsSync(CERT_DIR)) {
    throw new Error(
      `VITE_DEV_HTTPS=1인데 인증서가 없습니다: ${CERT_DIR}\n` +
        "apps/mobile/CLAUDE.md의 'iOS 실기기' 절차대로 mkcert로 생성하세요.",
    );
  }
  const files = fs.readdirSync(CERT_DIR);
  const keyName = files.find((f) => f.endsWith("-key.pem"));
  const certName = files.find((f) => f.endsWith(".pem") && !f.endsWith("-key.pem"));
  if (keyName === undefined || certName === undefined) {
    return undefined;
  }
  return {
    key: fs.readFileSync(path.join(CERT_DIR, keyName)),
    cert: fs.readFileSync(path.join(CERT_DIR, certName)),
  };
}

/**
 * 터널(`cloudflared`)로 접속할 때 필요한 설정 — **`VITE_DEV_TUNNEL=1`일 때만 켠다.**
 *
 * ## 왜 LAN IP 대신 터널이 필요한가 (2026-07-30 실측)
 *
 * iOS 실기기에 dev 서버를 붙이는 기본 경로는 LAN IP + mkcert HTTPS다(위 `devHttps`). 그런데
 * **네트워크가 클라이언트 격리(AP isolation)를 켜 두면 그 경로가 통째로 막힌다** — 폰과 Mac이
 * 같은 SSID에 있어도 장치끼리 통신이 차단되므로 어떤 인증서·설정으로도 뚫리지 않는다.
 * 실제로 `172.16.202.0/23` 사내망에서 Mac은 `HTTP 200`을 반환하는데 폰에서는 접속되지 않았다.
 *
 * 터널은 그 문제를 우회하면서 부수적으로 두 가지를 더 해결한다.
 *
 * - **IP가 바뀌어도 URL이 유지된다.** LAN IP는 네트워크마다 달라져 그때마다 인증서를 다시 만들고
 *   `webDevUrl`을 고쳐야 한다(한 세션에 세 번 바뀐 적이 있다).
 * - **기기에 루트 CA를 설치·신뢰시키지 않아도 된다.** 터널이 공개 CA 인증서로 TLS를 끝내므로
 *   iOS가 이미 신뢰하고, `getUserMedia`의 secure context 조건도 그것으로 충족된다.
 *
 * ## 왜 이때 HTTPS를 켜지 않는가
 *
 * TLS를 **터널이** 끝낸다. Vite까지 https로 띄우면 `cloudflared`가 mkcert 인증서를 검증하지 못해
 * 502가 된다. 그래서 터널 모드에서는 `VITE_DEV_HTTPS`를 **함께 켜지 않는다** — 평문 http로 띄우고
 * 공개 구간만 https가 된다.
 *
 * ## 사용법
 *
 * ```bash
 * VITE_DEV_TUNNEL=1 pnpm --filter web dev        # http로 뜬다 (VITE_DEV_HTTPS를 같이 주지 말 것)
 * cloudflared tunnel --url http://localhost:5173 # 공개 URL 발급
 * # app.json: "webDevUrl": "https://<발급된>.trycloudflare.com"  ← 커밋 금지
 * ```
 *
 * ⚠️ 임시 터널 URL은 **실행마다 바뀌고 공개된다.** 켜 둔 동안 URL을 아는 누구나 dev 서버에
 * 접속할 수 있으므로 검증이 끝나면 내린다.
 */
function tunnelServerOptions() {
  if (process.env.VITE_DEV_TUNNEL !== "1") {
    return {};
  }
  return {
    /**
     * Vite 7은 모르는 Host 헤더를 **차단한다**(DNS 리바인딩 방어). 터널을 통해 오면 Host가
     * `xxx.trycloudflare.com`이라 허용하지 않으면 화면 대신 "Blocked request"만 나온다.
     * 전체를 열지 않고 터널 도메인만 접미사로 허용한다.
     */
    allowedHosts: [".trycloudflare.com"],
    /**
     * HMR 소켓이 붙을 포트. 터널의 공개 구간은 443이므로 그대로 두면 클라이언트가 5173으로
     * 붙으려 해서 **HMR만 조용히 죽는다**(화면은 뜨는데 수정이 반영되지 않는다).
     */
    hmr: { clientPort: 443 },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), requireMediapipeWasm()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // 인증서가 있으면 https로, 없으면 평소대로 http로 뜬다(위 `devHttps` 주석).
    https: devHttps(),
    // 기기에서 LAN으로 붙으려면 0.0.0.0에 바인딩돼야 한다. 로컬 개발에는 영향이 없다.
    host: true,
    ...tunnelServerOptions(),
    // 개발 서버(52.78.219.53)가 CORS 헤더를 안 보내므로 dev에서는 same-origin 프록시로 우회한다.
    proxy: {
      "/api": {
        target: "http://52.78.219.53:8080",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
});
