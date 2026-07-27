/**
 * 번들에 동봉된 `apps/web` 빌드 산출물을 `http://localhost:{port}`로 서빙하는 어댑터.
 *
 * `file://`이 아니라 localhost로 여는 이유는 설계 문서 §1에 있다 — `file://`은
 * `getUserMedia` 승인이 기기별로 갈리고, COOP/COEP 헤더를 붙일 수 없어 멀티스레드
 * wasm 경로가 막히며, `react-router`의 history 라우팅을 받아줄 주체가 없다.
 *
 * **실제 구현은 아직 없다.** 서버 라이브러리는 실기기 스파이크(S1)에서 정한다 —
 * `frontend/CLAUDE.md`의 "검증되지 않은 네이티브 라이브러리를 추측으로 설치하지 말 것"에
 * 따라, 그전까지 라우트·테스트는 아래 fake로만 동작한다.
 */
export interface WebAssetServer {
  /** 서버를 띄우고 오리진을 돌려준다. 이미 떠 있으면 같은 값을 그대로 준다. */
  start(): Promise<string>;
  stop(): Promise<void>;
  /** 살아 있으면 오리진, 아니면 `null`. */
  readonly origin: string | null;
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
  const origin = options.origin ?? "http://localhost:8081";
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
