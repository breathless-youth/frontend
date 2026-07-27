/**
 * 번들에 동봉된 `apps/web` 빌드 산출물을 `http://localhost:{port}`로 서빙하는 어댑터.
 *
 * `file://`이 아니라 localhost로 여는 이유는 설계 문서 §1에 있다 — `file://`은
 * `getUserMedia` 승인이 기기별로 갈리고, COOP/COEP 헤더를 붙일 수 없어 멀티스레드
 * wasm 경로가 막히며, `react-router`의 history 라우팅을 받아줄 주체가 없다.
 *
 * **실제 구현은 아직 없다.** 서버 라이브러리는 실기기 스파이크(S1)에서 정한다 —
 * `frontend/CLAUDE.md`의 "검증되지 않은 네이티브 라이브러리를 추측으로 설치하지 말 것"에
 * 따라, 그전까지 기본값은 아래 `createUnavailableWebAssetServer`(항상 실패)이고
 * fake는 **테스트·주입 전용**이다.
 */
export interface WebAssetServer {
  /** 서버를 띄우고 오리진을 돌려준다. 이미 떠 있으면 같은 값을 그대로 준다. */
  start(): Promise<string>;
  stop(): Promise<void>;
  /** 살아 있으면 오리진, 아니면 `null`. */
  readonly origin: string | null;
}

/**
 * fake의 기본 오리진.
 *
 * **Metro(8081)·Vite(5173)와 겹치지 않는 포트여야 한다.** 예전 기본값이 8081이라
 * `start()`가 성공하고 WebView가 Metro에게 `/room/1`을 물어보는 일이 벌어졌다 —
 * 기기에서는 연결 거부(백지), 시뮬레이터에서는 Metro의 404 JSON. "그럴듯하게 동작하는"
 * 실패라 라우트의 정직한 실패 UI가 영영 뜨지 않았다.
 */
export const FAKE_WEB_ASSET_SERVER_ORIGIN = "http://localhost:34567";

/** 아직 구현되지 않은 서버가 던지는 **개발자용** 메시지. 사용자 문구가 아니다. */
export const WEB_ASSET_SERVER_UNAVAILABLE_MESSAGE =
  "local web asset server not implemented (BY-282 Task 5)";

/**
 * 실제 구현이 붙기 전까지의 기본 서버 — `start()`가 항상 거부된다.
 *
 * fake를 기본값으로 두면 "성공했는데 화면이 백지"가 되어 원인을 짚을 수 없다.
 * 여기서 확실히 실패시켜야 라우트가 이미 가진 실패 분기(`세션을 시작하지 못했어요`)로
 * 들어가고, 콘솔에는 어느 작업이 남았는지가 그대로 찍힌다.
 */
export function createUnavailableWebAssetServer(): WebAssetServer {
  return {
    get origin() {
      return null;
    },
    async start(): Promise<string> {
      throw new Error(WEB_ASSET_SERVER_UNAVAILABLE_MESSAGE);
    },
    async stop() {
      // 뜬 적이 없으니 내릴 것도 없다.
    },
  };
}

export interface FakeWebAssetServerOptions {
  /** 테스트가 기대할 오리진. 포트는 실제로는 동적 할당된다(설계 §1). */
  readonly origin?: string;
  /** 기동 실패(포트 충돌 등)를 재현한다. */
  readonly failToStart?: boolean;
}

export interface FakeWebAssetServer extends WebAssetServer {
  /** 실제로 기동한 횟수 — 중복 기동을 막았는지 검증하는 데 쓴다. */
  readonly startCount: number;
}

export function createFakeWebAssetServer(
  options: FakeWebAssetServerOptions = {},
): FakeWebAssetServer {
  const origin = options.origin ?? FAKE_WEB_ASSET_SERVER_ORIGIN;
  let current: string | null = null;
  let startCount = 0;

  return {
    get origin() {
      return current;
    },
    get startCount() {
      return startCount;
    },
    async start() {
      if (current !== null) {
        return current;
      }
      if (options.failToStart === true) {
        throw new Error("web asset server failed to start");
      }
      startCount += 1;
      current = origin;
      return current;
    },
    async stop() {
      current = null;
    },
  };
}

/**
 * 서버 오리진 + 세션 파라미터 → WebView가 열 URL.
 *
 * 경로 `/room/:id?userId=N`은 `apps/web`의 기존 라우트 계약이다(`App.tsx`).
 * `userId`가 없으면 쿼리를 아예 붙이지 않는다 — `apps/web`이 그 부재를 `unsaved`
 * 경로로 처리하므로 `userId=null` 같은 문자열을 보내면 파싱이 어긋난다.
 */
export function buildSessionUrl(
  origin: string,
  params: { roomId: string; userId: number | null },
): string {
  const base = `${origin.replace(/\/$/, "")}/room/${params.roomId}`;
  return params.userId === null ? base : `${base}?userId=${params.userId}`;
}
