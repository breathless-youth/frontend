import { isNativeBridgeAvailable, postToNative, subscribeToNativeMessages } from "../bridge";
import { queryClient } from "../queryClient";
import { type BrowserTokenSource, createBrowserTokenSource } from "./browserTokenSource";

/** 문서가 아는 신원과 access 토큰. refresh 토큰은 앱(네이티브)이나 브라우저의 HttpOnly 쿠키가 갖고 웹 코드에 오지 않는다. */
export type AuthSnapshot = { userId: number | null; accessToken: string | null };

export interface TokenSource {
  /** 첫 `auth-token`이 올 때까지 기다린다(한도 있음). 이후에는 즉시 돌려준다. */
  getAccessToken(): Promise<string | null>;
  /** 지금 들고 있는 토큰. 401을 받은 뒤 "보낸 토큰과 다른가"를 판정할 때 쓴다. */
  getCurrentToken(): string | null;
  /** 갱신을 요청하고 다음 `auth-token`의 토큰을 돌려준다. 문서 안의 동시 호출은 하나로 묶인다. */
  refresh(): Promise<string | null>;
  getUserId(): number | null;
  /**
   * 첫 `auth-token`이 도착했거나 대기 한도가 지났는지. 이게 false인 동안의 `getUserId() === null`은
   * "신원 없음"이 아니라 "아직 모름"이다 — 둘을 섞으면 브리지 왕복이 끝나기 전에 화면이
   * 단독 모드로 굳거나 사용자를 쫓아낸다.
   */
  hasSettled(): boolean;
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

  /**
   * 한도가 지나도 답이 없으면 빈 스냅샷으로 확정한다. 확정하지 않으면 `hasSettled`가 영영
   * false로 남아, 신원을 기다리는 화면이 끝나지 않는 로딩에 갇힌다. 구독은 유지되므로 늦게
   * 온 `auth-token`이 이 값을 덮어쓴다.
   */
  setTimeout(() => {
    if (snapshot === null) {
      snapshot = { userId: null, accessToken: null };
      for (const listener of [...listeners]) {
        listener(snapshot);
      }
    }
  }, FIRST_TOKEN_TIMEOUT_MS);

  let pendingRefresh: Promise<string | null> | null = null;

  return {
    getAccessToken: () => (snapshot === null ? firstToken : Promise.resolve(snapshot.accessToken)),
    getCurrentToken: () => snapshot?.accessToken ?? null,
    getUserId: () => snapshot?.userId ?? null,
    hasSettled: () => snapshot !== null,
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
let browserSource: BrowserTokenSource | null = null;

/**
 * 검색 로봇과 자동화 브라우저 판별
 *
 * 열 때마다 새 비회원이 서버에 쌓이지 않게 출처를 만들지 않는다.
 */
// ponytail: 사용자 에이전트 문자열만 보는 단순 판별이라 이름을 숨긴 로봇은 걸리지 않는다.
// 로봇 가입이 실제로 쌓이면 서버에서 등록 빈도를 제한한다.
function isLikelyBot(): boolean {
  return (
    navigator.webdriver === true ||
    /bot[-/;]|\bbot\b|crawler|spider|slurp|headless/i.test(navigator.userAgent)
  );
}

/**
 * 문서의 토큰 출처 결정
 *
 * 모듈 초기화(`main.tsx`, `createRoot` 전)에서 부른다.
 * 라우트 자식 effect의 react-query 요청이 `App`의 effect보다 먼저 돌아 훅으로는 늦고,
 * StrictMode 이중 실행으로 `auth-ready`나 등록이 두 번 나가는 것도 피한다.
 * 앱 웹뷰는 셸이 `guestAuth=1`을 붙였을 때만 브리지 출처를 쓰고(`apps/mobile/lib/remoteQueryParams.ts`),
 * 표시 없는 구버전 앱은 출처 없이 URL의 `userId`로 말한다.
 * 브리지가 없는 브라우저는 쿠키 기반 비회원 출처를 쓴다.
 * 두 번 불러도 한 번만 만든다.
 */
export function initTokenSource(): void {
  if (source !== null) {
    return;
  }
  if (isNativeBridgeAvailable()) {
    if (new URLSearchParams(window.location.search).get("guestAuth") === "1") {
      source = createBridgeTokenSource();
    }
    return;
  }
  if (isLikelyBot()) {
    return;
  }
  browserSource = createBrowserTokenSource();
  source = browserSource;
  // 로그아웃이나 다른 탭의 계정 전환 뒤 이전 계정의 화면 데이터를 다시 받는다.
  // 사용자 번호를 키에 넣지 않은 조회도 있어 전부 무효화한다.
  let lastUserId: number | null | undefined;
  browserSource.subscribe(({ userId }) => {
    if (lastUserId !== undefined && userId !== lastUserId) void queryClient.invalidateQueries();
    lastUserId = userId;
  });
}

/** 브라우저 비회원 출처의 로그아웃. 앱 웹뷰에서는 앱이 로그아웃을 맡아 아무것도 하지 않는다. */
export function logoutBrowserGuest(): Promise<boolean> {
  return browserSource?.logout() ?? Promise.resolve(true);
}

export function getTokenSource(): TokenSource | null {
  return source;
}

/** 테스트마다 출처를 다시 정하게 하는 초기화 */
export function __resetTokenSourceForTests(): void {
  source = null;
  browserSource = null;
}
