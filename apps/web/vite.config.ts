import fs from "node:fs";
import path from "node:path";

import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import type { Connect, ViteDevServer } from "vite";
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
    name: "focusmakers:require-mediapipe-wasm",
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

/**
 * 배포 식별자를 빌드 타임에 박아 넣는다.
 *
 * `import.meta.env.MODE`는 `vite build`면 Preview든 Production이든 `"production"`이라
 * Sentry에서 두 배포가 한 통에 섞인다. Vercel이 자동으로 넣어주는 시스템 변수를 쓰면
 * **Vercel env를 새로 설정하지 않고도** 구분된다.
 *
 * - `VERCEL_ENV` — `production` | `preview` | `development`
 * - `VERCEL_GIT_COMMIT_SHA` — 배포 커밋
 *
 * 둘 다 `VITE_` 접두사가 없어 클라이언트에 자동 노출되지 않으므로 `define`으로 명시 주입한다.
 */
const COMMIT_SHA = process.env.VERCEL_GIT_COMMIT_SHA;
const RELEASE = COMMIT_SHA?.slice(0, 7) ?? "local";

/**
 * `vite-env.d.ts`가 `__DEPLOY_ENV__`를 세 값의 union으로 선언하므로 여기서 그 계약을 지킨다.
 * `process.env.VERCEL_ENV`를 검증 없이 통과시키면 타입 선언과 실제가 어긋난다.
 */
const DEPLOY_ENVS = ["production", "preview", "development"];
const rawDeployEnv = process.env.VERCEL_ENV;
const DEPLOY_ENV =
  rawDeployEnv !== undefined && DEPLOY_ENVS.includes(rawDeployEnv) ? rawDeployEnv : "development";

const deployDefines = {
  __DEPLOY_ENV__: JSON.stringify(DEPLOY_ENV),
  __RELEASE__: JSON.stringify(RELEASE),
};

/**
 * 소스맵 업로드 — **`SENTRY_AUTH_TOKEN`이 있을 때만 켜진다.**
 *
 * ## 왜 필요한가
 *
 * 프로덕션 번들은 압축돼 있어 스택트레이스가 `N4`·`sx` 같은 이름만 남는다. 소스맵을
 * 올려두지 않으면 Sentry에 에러가 쌓여도 **어디서 났는지 읽을 수가 없다.**
 *
 * ## 왜 토큰 유무로 껐다 켜는가
 *
 * 로컬·CI 빌드에는 토큰이 없다. 그때 플러그인이 살아 있으면 업로드를 시도했다가 실패해
 * 빌드가 깨진다. `disable`로 통째로 비활성화하면 산출물은 동일하고 업로드만 빠진다.
 *
 * ## 소스맵을 공개 배포하지 않는다
 *
 * `sourcemap: "hidden"`은 `.map`을 만들되 번들에 `//# sourceMappingURL` 주석을 남기지
 * 않는다(Sentry는 debug ID로 대조하므로 주석이 필요 없다). 업로드가 끝나면
 * `filesToDeleteAfterUpload`가 `.map`을 지운다 — 공개 사이트라 **소스맵이 그대로 배포되면
 * 전체 소스가 노출된다.** 토큰이 없어 업로드를 건너뛸 때는 아예 소스맵을 만들지 않는다.
 *
 * ## release 이름은 클라이언트와 반드시 같아야 한다
 *
 * 클라이언트는 `__RELEASE__`(커밋 SHA 7자리)로 이벤트를 태깅한다. 업로드 쪽 release 이름이
 * 다르면 **소스맵이 이벤트에 붙지 않는다** — 업로드는 성공하는데 스택트레이스는 그대로
 * 압축된 채로 보이는, 원인을 찾기 어려운 실패가 된다. 그래서 같은 `RELEASE` 상수를 쓴다.
 */
const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;

/**
 * 커밋 SHA가 없으면 업로드하지 않는다. 로컬에서 토큰을 export한 채 빌드하면 release가
 * `"local"`이 되는데, 그 이름으로 올리면 **다른 사람의 로컬 빌드가 서로 덮어쓴다.**
 */
const UPLOAD_SOURCEMAPS = Boolean(SENTRY_AUTH_TOKEN) && COMMIT_SHA !== undefined;

function sentrySourcemaps() {
  return sentryVitePlugin({
    disable: !UPLOAD_SOURCEMAPS,
    org: "breathless-youth",
    project: "focusmakers-web",
    authToken: SENTRY_AUTH_TOKEN,
    release: { name: RELEASE },
    sourcemaps: {
      // CWD 상대 경로로 두면 빌드를 어디서 부르느냐에 따라 **조용히 안 지워진다.**
      // 지금은 어느 경로로 불러도 맞지만, 남는 순간 소스맵이 공개 배포되므로 고정한다.
      filesToDeleteAfterUpload: [path.resolve(__dirname, "dist/**/*.js.map")],
    },
    telemetry: false,
  });
}

/**
 * dev 프록시 타깃 — **저장소에 커밋하지 않는다.**
 *
 * 원래 개발 백엔드 주소를 하드코딩했는데, cf9a48f(2026-08-02)가 앱 설정을 운영 도메인으로
 * 바꾸면서 이 타깃까지 일괄 치환해 **브라우저 개발 트래픽이 운영 DB로 흘러가는 사고**가
 * 있었다(2026-08-21 발견). 게다가 이 저장소는 공개라 개발 서버 주소(평문 IP)를 커밋하면
 * 그대로 노출된다. 그래서 타깃은 gitignore되는 `.env.local`에서만 읽는다:
 *
 *   # apps/web/.env.local  (주소는 팀 내부 공유)
 *   DEV_API_PROXY_TARGET=http://<개발 백엔드 주소>
 *
 * 미설정이면 `/api`·`/ws`가 이유를 담은 503으로 죽는다 — 조용히 엉뚱한 환경으로 가는 것보다
 * 시끄럽게 실패하는 쪽을 택했다. 그냥 프록시만 빼면 Vite SPA fallback이 `/api`에도
 * index.html을 200으로 돌려줘서(2026-08-22 실측) "JSON 자리에 HTML"이라는 더 헷갈리는
 * 실패가 되기 때문에, 아래 serve 전용 플러그인이 명시적으로 막는다.
 */
const DEV_PROXY_TARGET = loadEnv("development", __dirname, "").DEV_API_PROXY_TARGET;

function devApiProxy() {
  if (!DEV_PROXY_TARGET) {
    return undefined;
  }
  return {
    "/api": { target: DEV_PROXY_TARGET, changeOrigin: true },
    // 룸 STOMP 웹소켓 — /api와 같은 same-origin 우회 목적. 배포에서는 프록시 없이
    // API 베이스에서 ws(s) URL을 파생한다(features/live-room/stompRoomChannel.ts).
    "/ws": { target: DEV_PROXY_TARGET, changeOrigin: true, ws: true },
  };
}

/**
 * 타깃 미설정 처리 — dev 서버에서만(build·vitest 로그에는 소음이라 apply: "serve").
 * 기동 시 경고를 내고, `/api`·`/ws` 요청을 이유가 담긴 503 JSON으로 막는다.
 * `configureServer`의 미들웨어는 내부(SPA fallback)보다 앞에 걸려 index.html 200을 선점한다.
 */
function warnMissingProxyTarget() {
  const HINT =
    "[web] DEV_API_PROXY_TARGET 미설정 — /api·/ws가 백엔드로 프록시되지 않습니다. " +
    "vite.config.ts의 주석을 보고 apps/web/.env.local에 추가하세요.";
  return {
    name: "focusmakers:warn-missing-proxy-target",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      if (DEV_PROXY_TARGET) {
        return;
      }
      console.warn(HINT);
      const reject: Connect.NextHandleFunction = (_req, res) => {
        res.statusCode = 503;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ message: HINT }));
      };
      server.middlewares.use("/api", reject);
      server.middlewares.use("/ws", reject);
    },
  } as const;
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    requireMediapipeWasm(),
    sentrySourcemaps(),
    warnMissingProxyTarget(),
  ],
  define: deployDefines,
  build: {
    // 업로드하지 않을 빌드에서는 소스맵을 아예 만들지 않는다(공개 배포 방지).
    sourcemap: UPLOAD_SOURCEMAPS ? "hidden" : false,
  },
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
    // dev에서는 same-origin `/api`·`/ws`를 개발 백엔드로 프록시한다(위 `DEV_PROXY_TARGET` 주석).
    proxy: devApiProxy(),
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
});
