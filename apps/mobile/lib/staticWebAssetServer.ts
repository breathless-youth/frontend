/**
 * 번들 asset(`assets/web-dist/`)을 `http://127.0.0.1:{동적포트}`로 서빙하는 실제 구현.
 * Lighttpd를 임베드한 `@dr.pogodin/react-native-static-server`(v0.27) 위에 얹는다.
 *
 * `127.0.0.1`에만 바인딩한다 — 같은 Wi-Fi의 다른 기기가 이 서버에 붙을 이유가 없고,
 * 붙을 수 있으면 그 자체가 보안 문제다.
 *
 * 포트를 고정하지 않는 이유는 다른 앱과 충돌하기 때문이다(설계 §1). WebView가 열 URL은
 * `start()`가 돌려주는 오리진으로 런타임에 조립한다(`buildSessionUrl`).
 *
 * ## 오리진 호스트 계약 — `127.0.0.1`로 고정한다
 *
 * `start()`가 돌려주는 오리진의 호스트는 **항상 `127.0.0.1`**이다. `localhost`가 아니다.
 * 이유는 두 가지다.
 *
 * 1. **서버가 실제로 바인딩한 주소와 같아야 한다.** 라이브러리는 `hostname`을 그대로
 *    lighttpd의 `server.bind`에 넣는다. `localhost`는 기기·OS에 따라 IPv6 `::1`로 먼저
 *    해석될 수 있는데, 서버는 IPv4 루프백에만 떠 있으므로 그 경우 연결이 거부된다 —
 *    "서버는 떴는데 WebView만 백지"라는, 원인과 증상이 안 맞는 실패가 된다.
 * 2. **모호함을 호출자에게 흘리지 않는다.** `buildSessionUrl`은 받은 오리진을 그대로
 *    이어 붙일 뿐이라, 호스트 표기가 상황에 따라 갈리면 그 차이가 URL·권한 저장소·
 *    `originWhitelist`까지 번진다.
 *
 * 라이브러리 0.27은 `hostname` 기본값이 이미 `127.0.0.1`이라 실제로는 같은 값을 보고한다.
 * 그래도 `normalizeOrigin`으로 한 번 더 통일하는 것은, 이 계약이 라이브러리 기본값에
 * 기대지 않고 이 파일에서 끝나게 하기 위해서다.
 *
 * 라우트(`app/room/[id].tsx`)의 `originWhitelist`는 `localhost`·`127.0.0.1` 양쪽을 받으므로
 * 이 선택으로 깨지지 않는다.
 *
 * ## 서빙 루트가 기기에서 실제로 어디인가 — 아직 미해결
 *
 * `fileDir`에 상대 경로를 주면 라이브러리가 플랫폼별 번들 경로로 풀어준다
 * (iOS: `MainBundlePath/web-dist`, Android: `DocumentDirectoryPath/web-dist`).
 * **그러나 지금 저장소에는 `apps/mobile/assets/web-dist/`를 그 위치로 보내는 장치가 없다.**
 * Expo CNG라 `ios/`·`android/`가 생성물이고(둘 다 gitignore), 라이브러리 README가 요구하는
 * iOS Xcode folder reference 추가와 Android `assets.srcDirs` 설정은 config plugin 없이는
 * 다음 prebuild에서 사라진다. Android는 거기에 더해 번들 asset을 파일로 읽을 수 없어
 * 기동 전 실제 디렉터리로 복사하는 단계가 따로 필요하다.
 *
 * 그래서 `fileDir`을 주입 가능하게 열어 뒀다 — 번들 방식이 정해지면 그 결과 경로를
 * 여기로 넘기면 되고, 이 파일은 다시 손대지 않는다. 기본값은 "정해지면 이 이름이 된다"는
 * 자리표시자이지 지금 동작이 검증된 경로가 아니다.
 */

import type StaticServerInstance from "@dr.pogodin/react-native-static-server";
import type { StaticServerParams } from "@dr.pogodin/react-native-static-server";

import type { WebAssetServer } from "./webAssetServer";

/** 서빙 루트의 상대 경로. 라이브러리가 플랫폼별 번들 경로로 풀어준다. */
export const WEB_ASSET_DIR = "web-dist";

/** 오리진 호스트 — 위 "오리진 호스트 계약" 참고. */
export const LOCAL_SERVER_HOST = "127.0.0.1";

/**
 * SPA 폴백 — 파일로 존재하지 않는 경로를 `index.html`로 내부 리라이트한다.
 *
 * `apps/web`은 `react-router`의 history 라우팅을 쓰므로 `/room/1` 요청이 그대로 오면
 * 그런 파일이 없어 404가 된다. 라이브러리에 SPA 스위치가 따로 없어 lighttpd 설정을
 * 직접 써 넣는다 — 이 문자열은 생성된 설정 파일 맨 끝에 그대로 붙는다(`config.ts`의
 * `standardConfig`). `server.modules += (...)` 형태는 라이브러리 자신이 webdav 모듈을
 * 붙일 때 쓰는 것과 같은 문법이다.
 *
 * 리라이트 대상에 쿼리스트링을 붙이지 않는 것은 의도다. 내부 리라이트라 브라우저 주소는
 * 그대로 `/room/1?userId=7`로 남고(`location.search`도 그대로다), 서버는 정적 파일
 * `index.html`만 고르면 된다.
 *
 * **실기기 미검증** — 규칙이 실제 라우팅과 맞물리는지는 브리프 Step 9에서 확인한다.
 */
export const SPA_FALLBACK_EXTRA_CONFIG = [
  'server.modules += ("mod_rewrite")',
  'url.rewrite-if-not-file = ( "^/(.*)" => "/index.html" )',
].join("\n");

type StaticServerConstructor = new (params: StaticServerParams) => StaticServerInstance;

interface StaticServerModule {
  readonly default: StaticServerConstructor;
  /** 상대 `fileDir`를 플랫폼별 번들 경로로 푸는 라이브러리 자신의 규칙. */
  readonly resolveAssetsPath: (path: string) => string;
}

/**
 * 네이티브 모듈을 **기동 시점에** 불러온다.
 *
 * 이 라이브러리(와 peer인 `@dr.pogodin/react-native-fs`)는 import되는 순간 TurboModule을
 * 잡는다(`getConstants()` / `getEnforcing()`). 최상위 import로 두면 네이티브가 없는
 * 환경(Expo Go, Jest)에서 이 모듈을 스치기만 해도 터지고, 레지스트리가 앱 시작 시 기본값을
 * 만들기 때문에 그 폭발이 곧 앱 실행 실패가 된다. 여기서 늦게 부르면 같은 실패가
 * "집중 시작"을 눌렀을 때의 거부로 바뀌고, 라우트가 이미 가진 실패 분기
 * ("세션을 시작하지 못했어요")로 흘러간다.
 *
 * 타입은 위 `import type`으로 그대로 가져오므로, 라이브러리 계약이 바뀌면 여기서 깨진다.
 */
function loadStaticServerModule(): StaticServerModule {
  // 공유 규칙(`no-require-imports`)을 여기서만 끄는 이유: 지연 로딩이 목적이다.
  // ESM `import`는 모듈 최상단으로 끌어올려져 이 함수 안에 가둘 수 없고, 동적 `import()`는
  // Jest(babel 변환) 환경에서 실행되지 않는다. Metro/RN에서 지연 로딩을 표현하는 수단은 `require`다.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("@dr.pogodin/react-native-static-server") as StaticServerModule;
}

/** 같은 이유로 지연 로딩한다 — 위 `loadStaticServerModule` 주석 참고. */
function loadExists(): (filepath: string) => Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("@dr.pogodin/react-native-fs") as {
    exists: (filepath: string) => Promise<boolean>;
  };
  return fs.exists;
}

export interface StaticWebAssetServerOptions {
  /**
   * 서빙 루트. 상대 경로면 라이브러리가 플랫폼별 번들 경로 기준으로 푼다.
   * 기본값은 위 "서빙 루트" 주석 참고 — 아직 채워지지 않는 경로다.
   */
  readonly fileDir?: string;
}

/** `http://[::1]:5000/` 같은 보고값에서 포트만 뽑아 계약대로 다시 쓴다. */
function normalizeOrigin(reported: string): string {
  const port = /:(\d+)\/?$/.exec(reported)?.[1];
  if (port === undefined) {
    throw new Error(`local web asset server reported an unusable origin: ${reported}`);
  }
  return `http://${LOCAL_SERVER_HOST}:${port}`;
}

/** 서빙 루트가 없을 때 던지는 **개발자용** 메시지. 사용자 문구가 아니다. */
export const WEB_ASSET_ROOT_MISSING_MESSAGE = "local web asset server has no document root";

export function createStaticWebAssetServer(
  options: StaticWebAssetServerOptions = {},
): WebAssetServer {
  const fileDir = options.fileDir ?? WEB_ASSET_DIR;
  let origin: string | null = null;
  let server: StaticServerInstance | null = null;
  /**
   * 진행 중인 기동 하나. `origin`은 **기동이 끝난 뒤에야** 채워지므로 이것 없이는 동시
   * 호출이 서로를 보지 못한다 — 두 호출이 각자 인스턴스를 만들어 네이티브 싱글턴을 두 번
   * 기동하고, 한쪽이 포트를 문 채 고아가 된다(`stop()`은 id를 받지 않아 지목해 내릴 수도
   * 없다). `apps/web`의 `mediaStreamCamera.ts`가 `getUserMedia`에 대해 쓰는 `pending`과
   * 같은 처리다.
   */
  let pending: Promise<string> | null = null;

  async function boot(): Promise<string> {
    const { default: StaticServer, resolveAssetsPath } = loadStaticServerModule();

    // 서빙 루트가 실제로 있는지 먼저 확인한다. **lighttpd는 document-root가 없어도
    // 거부하지 않고 그냥 떠서 전부 404를 낸다** — 그러면 `start()`는 성공하고 WebView는
    // 아무 에러 없이 백지가 된다. 원인을 짚을 수 없는 그 실패를 막으려고, 여기서 확실히
    // 거부해 라우트의 실패 분기("세션을 시작하지 못했어요")로 보낸다.
    //
    // 라이브러리와 **같은 규칙**으로 경로를 푼다(생성자도 `resolveAssetsPath`를 쓴다).
    // 그래야 여기서 검사한 경로와 lighttpd가 실제로 여는 경로가 어긋나지 않는다.
    const resolved = resolveAssetsPath(fileDir);
    if (!(await loadExists()(resolved))) {
      throw new Error(
        `${WEB_ASSET_ROOT_MISSING_MESSAGE}: ${resolved}. ` +
          "apps/web 빌드 산출물을 앱 번들 안 이 경로로 넣는 장치가 아직 없다 — " +
          "번들링 방식(config plugin 등)이 미정이다. 서버 라이브러리 문제가 아니다.",
      );
    }

    // 기동할 때마다 새 인스턴스를 만든다. 라이브러리는 첫 start에서 정해진 포트를
    // 인스턴스에 눌러 담고 재기동 때 그대로 쓰는데, 그 사이 다른 앱이 그 포트를 잡으면
    // 고정 포트와 똑같은 충돌이 된다(이슈 #26이 Android 크래시로 짚은 상황).
    const instance = new StaticServer({
      fileDir,
      // `port: 0` = OS가 빈 포트를 고른다.
      port: 0,
      // 0.27에서 `nonLocal`은 deprecated다 — 바인딩 주소는 `hostname`이 정한다.
      hostname: LOCAL_SERVER_HOST,
      extraConfig: SPA_FALLBACK_EXTRA_CONFIG,
    });

    // 실패는 그대로 던진다 — 라우트가 catch해서 "세션을 시작하지 못했어요"를 보여준다.
    // origin을 건드리지 않은 채 던져야 재시도가 가능하다.
    const reported = await instance.start();
    server = instance;

    try {
      origin = normalizeOrigin(reported);
    } catch (error: unknown) {
      // 오리진을 읽지 못하면 그 서버는 쓸 수가 없다. 띄워둔 채 던지면 포트를 문 서버가
      // 남아 다음 시도까지 방해한다 — 내려서 재시도 가능한 상태로 되돌린다.
      server = null;
      await instance.stop().catch(() => undefined);
      throw error;
    }
    return origin;
  }

  return {
    get origin() {
      return origin;
    },
    async start() {
      if (origin !== null) {
        return origin;
      }
      if (pending !== null) {
        // 이미 기동 중이다 — 두 번째 서버를 띄우지 않고 그 결과를 그대로 받는다.
        return await pending;
      }

      const inFlight = boot();
      pending = inFlight;
      try {
        return await inFlight;
      } finally {
        // 나중에 시작된 기동의 pending을 지우지 않도록 자기 것인지 확인한다.
        if (pending === inFlight) {
          pending = null;
        }
      }
    },
    async stop() {
      const running = server;
      if (running === null) {
        return;
      }
      try {
        await running.stop();
      } finally {
        // 실패해도 상태는 비운다 — 라이브러리가 이미 CRASHED로 표시한 인스턴스를 붙들고
        // 있으면 `origin`이 죽은 서버를 가리킨 채 남아 다음 `start()`가 그걸 그대로 돌려준다.
        // 다만 **내리기를 기다린 뒤에** 비운다. 먼저 비우면 그 사이 들어온 `start()`가
        // 아직 살아 있는 서버 옆에 두 번째 서버를 띄운다.
        server = null;
        origin = null;
      }
    },
  };
}
