import { isNativeBridgeAvailable, postToNative, subscribeToNativeMessages } from "../bridge";

/** 문서가 아는 신원과 access 토큰. refresh 토큰은 네이티브가 갖고 웹에 오지 않는다. */
export type AuthSnapshot = { userId: number | null; accessToken: string | null };

export interface TokenSource {
  /** 첫 `auth-token`이 올 때까지 기다린다(한도 있음). 이후에는 즉시 돌려준다. */
  getAccessToken(): Promise<string | null>;
  /** 지금 들고 있는 토큰. 401을 받은 뒤 "보낸 토큰과 다른가"를 판정할 때 쓴다. */
  getCurrentToken(): string | null;
  /** 갱신을 요청하고 다음 `auth-token`의 토큰을 돌려준다. 문서 안의 동시 호출은 하나로 묶인다. */
  refresh(): Promise<string | null>;
  getUserId(): number | null;
  subscribe(listener: (snapshot: AuthSnapshot) => void): () => void;
}

/**
 * `auth-ready` 왕복 한도. 네이티브는 저장된 토큰으로 즉답하므로(웹뷰는 등록 뒤에 마운트된다) 넉넉하다.
 * 지나면 null — 헤더 없이 보낸다. 구독은 유지되므로 늦게 온 토큰은 다음 요청부터 쓰인다.
 * 값은 `nativeCameraGate`의 구셸 판별 한도와 같다.
 */
const FIRST_TOKEN_TIMEOUT_MS = 3000;
/** 갱신 왕복 한도 — 네이티브의 `/api/auth/refresh` 네트워크 왕복이 들어간다. 지나면 null(요청은 401로 끝난다). */
const REFRESH_TIMEOUT_MS = 10_000;

export function createBridgeTokenSource(): TokenSource {
  let snapshot: AuthSnapshot | null = null;
  const listeners = new Set<(snapshot: AuthSnapshot) => void>();
  /** 다음 `auth-token` 하나를 기다리는 resolve들 — 첫 토큰 대기와 갱신 대기가 같이 쓴다. */
  const waiters = new Set<(token: string | null) => void>();

  function nextToken(timeoutMs: number): Promise<string | null> {
    return new Promise((resolve) => {
      const settle = (token: string | null) => {
        waiters.delete(settle);
        clearTimeout(timer);
        resolve(token);
      };
      const timer = setTimeout(() => settle(snapshot?.accessToken ?? null), timeoutMs);
      waiters.add(settle);
    });
  }

  // 구독을 먼저 걸고 auth-ready를 보낸다 — 순서가 바뀌면 응답이 구독자 없이 버려진다(analytics-ready와 같은 이유).
  subscribeToNativeMessages((message) => {
    if (message.type !== "auth-token") {
      return;
    }
    snapshot = { userId: message.userId, accessToken: message.accessToken };
    for (const settle of [...waiters]) {
      settle(message.accessToken);
    }
    for (const listener of [...listeners]) {
      listener(snapshot);
    }
  });
  const firstToken = nextToken(FIRST_TOKEN_TIMEOUT_MS);
  postToNative({ type: "auth-ready", atMs: Date.now() });

  let pendingRefresh: Promise<string | null> | null = null;

  return {
    getAccessToken: () => (snapshot === null ? firstToken : Promise.resolve(snapshot.accessToken)),
    getCurrentToken: () => snapshot?.accessToken ?? null,
    getUserId: () => snapshot?.userId ?? null,
    refresh() {
      // 문서 안의 동시 401은 요청 하나로 묶는다 — 네이티브도 single-flight지만 메시지를 N번 보낼 이유가 없다.
      if (pendingRefresh === null) {
        pendingRefresh = nextToken(REFRESH_TIMEOUT_MS).finally(() => {
          pendingRefresh = null;
        });
        postToNative({ type: "request-token-refresh", atMs: Date.now() });
      }
      return pendingRefresh;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

let source: TokenSource | null = null;

/**
 * 모듈 초기화(`main.tsx`, `createRoot` 전)에서 부른다 — 라우트 자식 effect의 react-query 요청이 `App`의
 * effect보다 먼저 돌아 훅으로는 늦고, StrictMode 이중 실행으로 `auth-ready`가 두 번 나가는 것도 피한다.
 * 출처가 생기는 조건은 브리지가 있고 셸이 `guestAuth=1` 표시를 붙였을 때뿐이다
 * (`apps/mobile/lib/remoteQueryParams.ts`). 표시 없는 구버전 앱과 브라우저 단독은 출처가 없고
 * `apiFetch`는 기다리지 않고 오늘처럼 보낸다. 두 번 불러도 한 번만 만든다.
 */
export function initBridgeTokenSource(): void {
  if (source !== null) {
    return;
  }
  if (
    isNativeBridgeAvailable() &&
    new URLSearchParams(window.location.search).get("guestAuth") === "1"
  ) {
    source = createBridgeTokenSource();
  }
}

export function getTokenSource(): TokenSource | null {
  return source;
}
