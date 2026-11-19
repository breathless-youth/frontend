import { apiVersionFor } from "@focusmakers/types";
import type { ApiEndpoint } from "@focusmakers/types";

import type { AuthSnapshot, TokenSource } from "./tokenSource";

/** 브라우저 비회원 출처. 탭 사이 로그아웃이 있어서 브리지 출처보다 하나가 많다. */
export interface BrowserTokenSource extends TokenSource {
  /** 로그아웃해 새 비회원으로 바꾼다. 이전 회원이 남은 채 실패하면 false다. */
  logout(): Promise<boolean>;
}

/** 탭 사이 잠금. navigator.locks와 같은 모양이고 테스트가 바꿔 끼운다. */
export interface AuthLocks {
  request<T>(name: string, task: () => Promise<T>): Promise<T>;
}

/** 탭 사이 알림. BroadcastChannel과 같은 모양이고 테스트가 바꿔 끼운다. */
export interface AuthChannel {
  postMessage(data: unknown): void;
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
}

export interface BrowserTokenSourceDeps {
  fetch?: typeof fetch;
  locks?: AuthLocks | null;
  channel?: AuthChannel | null;
  baseUrl?: string;
  newDeviceId?: () => string;
  language?: string;
}

/** 잠금과 채널 이름. 같은 출처의 탭끼리만 공유된다. */
const AUTH_CHANNEL = "focusmakers:auth";
/** 탭 사이 신원 순번의 저장 키. 토큰이 아니라 숫자만 둔다. */
const EPOCH_KEY = "focusmakers:auth-epoch";
/** 탭 사이 로그아웃 세대의 저장 키. 성공한 로그아웃마다 1씩 늘어난다. */
const LOGOUT_KEY = "focusmakers:auth-logout";
/** 첫 신원 대기 한도. 브리지 출처와 같은 3초다. */
const FIRST_TOKEN_TIMEOUT_MS = 3000;
/** 한 요청의 한도. 잠금을 쥔 채 멈추면 다른 탭의 갱신까지 함께 멈춘다. */
const REQUEST_TIMEOUT_MS = 10_000;
const EMPTY: AuthSnapshot = { userId: null, accessToken: null };

const browserSources = new WeakSet<TokenSource>();

/**
 * 브라우저 출처 판별
 *
 * `apiFetch`가 쿠키 모드 헤더를 붙일지 판단한다.
 */
export function isBrowserTokenSource(source: TokenSource | null): source is BrowserTokenSource {
  return source !== null && browserSources.has(source);
}

/**
 * access JWT의 사용자 번호
 *
 * `sub`를 사용자 번호로 읽는다.
 * 서명은 서버가 매 요청 검사하므로 여기서는 번호만 꺼낸다.
 * 읽을 수 없으면 null이고 호출부는 받은 토큰을 실패로 다룬다.
 */
export function readUserIdFromAccessToken(accessToken: string): number | null {
  const segments = accessToken.split(".");
  if (segments.length !== 3) return null;
  try {
    const claims: unknown = JSON.parse(
      atob(segments[1]!.replaceAll("-", "+").replaceAll("_", "/")),
    );
    const sub = (claims as { sub?: unknown }).sub;
    // 서버는 sub를 문자열로 준다. 숫자로 바뀌어 오면 명세가 바뀐 것이라 받지 않는다.
    if (typeof sub !== "string" || !/^\d+$/.test(sub)) return null;
    const userId = Number(sub);
    return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
  } catch {
    return null;
  }
}

/**
 * 새 기기 UUID
 *
 * `randomUUID`는 보안 출처에서만 있어 http로 연 개발 서버를 위해 직접 만든다.
 */
function newDeviceId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function defaultLocks(): AuthLocks | null {
  if (typeof navigator === "undefined" || !navigator.locks) return null;
  return { request: (name, task) => navigator.locks.request(name, task) };
}

function defaultChannel(): AuthChannel | null {
  return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(AUTH_CHANNEL);
}

/** 출처 요청의 결과. 본문은 요청 한도 안에서 미리 읽어 둔다. */
type Reply = { ok: boolean; status: number; body: unknown };

/**
 * 갱신 실패가 쿠키를 잃은 경우인지 판단
 *
 * 쿠키가 없으면 서버는 400 `VALIDATION_FAILED`를, 만료되거나 폐기됐으면 401을 준다.
 * `API-Version` 불일치나 읽을 수 없는 요청 같은 다른 400까지 받으면 배포 실수 하나로 모든 브라우저가 새로고침마다 새 비회원이 된다.
 */
function lostRefreshCookie(res: Reply | null): boolean {
  if (res?.status === 401) return true;
  return (
    res?.status === 400 && (res.body as { code?: unknown } | null)?.code === "VALIDATION_FAILED"
  );
}

/**
 * 응답의 access 토큰으로 만든 신원
 *
 * `sub`를 못 읽으면 null이다.
 */
function snapshotFrom(res: Reply | null): AuthSnapshot | null {
  if (!res?.ok) return null;
  const token = (res.body as { accessToken?: unknown } | null)?.accessToken;
  return typeof token === "string" ? snapshotOf(token) : null;
}

/** 저장소의 로그아웃 세대. 저장소를 못 쓰면 null이다. */
function logoutGeneration(): number | null {
  try {
    return Number(localStorage.getItem(LOGOUT_KEY)) || 0;
  } catch {
    return null;
  }
}

function bumpLogoutGeneration(): void {
  try {
    localStorage.setItem(LOGOUT_KEY, String((logoutGeneration() ?? 0) + 1));
  } catch {
    // 저장소를 막은 브라우저는 탭 안의 사용자 번호 비교로만 판단한다
  }
}

function snapshotOf(accessToken: string): AuthSnapshot | null {
  const userId = readUserIdFromAccessToken(accessToken);
  return userId === null ? null : { userId, accessToken };
}

/**
 * 브리지가 없는 브라우저의 토큰 출처
 *
 * refresh 토큰은 서버가 HttpOnly 쿠키로 들고 웹은 access 토큰만 탭 메모리에 둔다.
 * 기기 UUID는 저장하지 않는다.
 * 쿠키가 살아 있으면 갱신으로 같은 신원을 되찾고, 없을 때만 새 비회원으로 등록한다.
 * 같은 쿠키로 갱신이 겹치면 서버가 재사용으로 보고 그 사용자의 refresh를 모두 폐기하므로,
 * 갱신과 등록과 로그아웃은 탭 사이 잠금 안에서 하나씩 한다.
 * 만들자마자 첫 신원을 받으러 간다.
 * 화면 대부분이 신원이 있어야 요청을 보내서 첫 API 호출까지 미룰 수 없다.
 */
export function createBrowserTokenSource(deps: BrowserTokenSourceDeps = {}): BrowserTokenSource {
  const doFetch = deps.fetch ?? ((input, init) => fetch(input, init));
  const locks = deps.locks === undefined ? defaultLocks() : deps.locks;
  const channel = deps.channel === undefined ? defaultChannel() : deps.channel;
  const baseUrl = deps.baseUrl ?? __API_BASE__;
  const makeDeviceId = deps.newDeviceId ?? newDeviceId;
  const language = deps.language ?? navigator.languages?.[0] ?? navigator.language;

  let snapshot: AuthSnapshot | null = null;
  const listeners = new Set<(snapshot: AuthSnapshot) => void>();
  let settleFirst: () => void = () => {};
  const firstSettled = new Promise<void>((resolve) => (settleFirst = resolve));

  function publish(next: AuthSnapshot): void {
    snapshot = next;
    settleFirst();
    for (const listener of [...listeners]) listener(next);
  }

  // 이 탭이 마지막으로 받아들인 신원의 순번
  let epoch = 0;

  /** 저장소에 남은 가장 최근 순번. 저장소를 못 쓰면 0이다. */
  function storedEpoch(): number {
    try {
      return Number(localStorage.getItem(EPOCH_KEY)) || 0;
    } catch {
      return 0;
    }
  }

  /**
   * 탭 사이에서 늘 커지는 다음 순번
   *
   * 신원은 잠금 안에서만 바뀌므로 저장된 값에 1을 더하면 앞 탭의 순번보다 크다.
   * 저장소를 막은 브라우저는 탭끼리 순번을 나눌 수 없어 null이고, 그때는 순서를 따지지 않는다.
   * 저장소 차단은 출처 단위라 같은 브라우저의 탭은 모두 같은 쪽이다.
   */
  function nextEpoch(): number | null {
    try {
      const next = Math.max(storedEpoch(), epoch) + 1;
      localStorage.setItem(EPOCH_KEY, String(next));
      return next;
    } catch {
      return null;
    }
  }

  /**
   * 이 탭이 받은 신원의 탭 간 공유
   *
   * 토큰은 받는 탭에서도 메모리에만 남는다.
   * 알림은 보낸 탭이 달라지면 도착 순서가 보장되지 않아 순번을 함께 싣는다.
   */
  function adopt(next: AuthSnapshot): void {
    const sent = nextEpoch();
    if (sent !== null) epoch = sent;
    publish(next);
    channel?.postMessage({ accessToken: next.accessToken, epoch: sent });
  }

  // 이미 받아들인 순번 이하이거나 저장소의 최근 순번보다 오래된 알림은 버린다.
  // 다른 탭의 갱신 알림이 로그아웃보다 늦게 도착해 이전 계정으로 되돌아가는 것을 막는다.
  // 이 탭이 로그아웃 알림을 아직 받지 못했어도 저장소에는 그 순번이 먼저 남는다.
  // ponytail: 저장소를 막은 브라우저는 순번이 없어 늦은 알림이 신원을 되돌릴 수 있다.
  // 그런 사용자가 실제로 있으면 잠금 안에서 알림 수신 확인을 기다리는 방식으로 바꾼다.
  channel?.addEventListener("message", (event) => {
    const data = event.data as { accessToken?: unknown; epoch?: unknown } | null;
    const token = data?.accessToken;
    const next = token === null ? EMPTY : typeof token === "string" ? snapshotOf(token) : null;
    if (next === null) return;
    if (typeof data?.epoch === "number") {
      if (data.epoch <= epoch || data.epoch < storedEpoch()) return;
      epoch = data.epoch;
    }
    if (next.accessToken !== (snapshot?.accessToken ?? null)) publish(next);
  });

  // ponytail: navigator.locks가 없는 브라우저는 탭 안에서만 차례를 지킨다.
  // 두 탭이 같은 쿠키로 동시에 갱신하면 서버가 그 사용자의 refresh를 모두 폐기할 수 있다.
  // 그런 브라우저가 실제로 많으면 localStorage 기반 잠금으로 바꾼다.
  let tail: Promise<unknown> = Promise.resolve();
  function withLock<T>(task: () => Promise<T>): Promise<T> {
    if (locks !== null) return locks.request(AUTH_CHANNEL, task);
    const run = tail.then(task);
    tail = run.catch(() => {});
    return run;
  }

  /**
   * 출처 자신의 요청
   *
   * `apiFetch`를 쓰면 자기 `getAccessToken`을 기다리다 멈춘다.
   * 응답 본문도 같은 한도 안에서 읽는다.
   * 헤더만 오고 본문이 멈추면 잠금을 쥔 채 다른 탭의 갱신까지 멈추기 때문이다.
   */
  async function send(
    path: string,
    endpoint: ApiEndpoint,
    options: { token?: string; body?: unknown } = {},
  ): Promise<Reply | null> {
    const headers = new Headers({
      "API-Version": apiVersionFor(endpoint, false),
      "Refresh-Transport": "cookie",
    });
    if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
    if (options.body !== undefined) headers.set("Content-Type", "application/json");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await doFetch(`${baseUrl}${path}`, {
        method: "POST",
        credentials: "include",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
      const body: unknown = res.status === 204 ? null : await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, body };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  function register(): Promise<Reply | null> {
    const deviceId = makeDeviceId();
    return send("/api/users", "register", {
      body: language ? { deviceId, language } : { deviceId },
    });
  }

  /**
   * 쿠키 갱신, 쿠키가 없거나 만료됐으면 새 비회원 등록
   *
   * 잠금을 기다리는 사이 다른 탭이 새 토큰을 알렸으면 그 토큰을 쓴다.
   * 알림이 늦게 와도 회전된 새 쿠키로 차례대로 갱신하므로 재사용으로 걸리지 않는다.
   * 네트워크 오류와 5xx는 신원을 그대로 두고 null을 준다.
   * 잠깐의 장애로 새 비회원을 만들면 기록이 다른 사람 것이 된다.
   */
  function acquire(): Promise<string | null> {
    const sent = snapshot?.accessToken ?? null;
    return withLock(async () => {
      const current = snapshot?.accessToken ?? null;
      if (current !== null && current !== sent) return current;
      let res = await send("/api/auth/refresh", "refresh");
      if (lostRefreshCookie(res)) res = await register();
      const next = snapshotFrom(res);
      if (next === null) return null;
      adopt(next);
      return next.accessToken;
    });
  }

  // 진행 중인 갱신은 시작할 때의 토큰이 그대로일 때만 함께 기다린다.
  // 새 토큰을 알린 직후의 401은 그 새 토큰이 거절된 것이라 끝나 가는 갱신을 돌려주면 안 된다.
  let pending: { token: string | null; promise: Promise<string | null> } | null = null;
  function refresh(): Promise<string | null> {
    const token = snapshot?.accessToken ?? null;
    if (pending?.token !== token) {
      const promise = acquire().finally(() => {
        if (pending?.promise === promise) pending = null;
      });
      pending = { token, promise };
    }
    return pending.promise;
  }

  void refresh();
  // 한도 안에 신원이 안 오면 빈 신원으로 확정한다. 확정하지 않으면 신원을 기다리는 화면이 로딩에 갇힌다.
  const firstTimer = setTimeout(() => {
    if (snapshot === null) publish(EMPTY);
  }, FIRST_TOKEN_TIMEOUT_MS);
  void firstSettled.then(() => clearTimeout(firstTimer));

  // 로그아웃 중에 시작한 요청은 이전 계정의 토큰을 싣지 않도록 새 신원이 정해질 때까지 기다린다.
  let switching: Promise<boolean> | null = null;

  const source: BrowserTokenSource = {
    getAccessToken: () =>
      switching !== null || snapshot === null
        ? (switching ?? firstSettled).then(() => snapshot?.accessToken ?? null)
        : Promise.resolve(snapshot.accessToken),
    getCurrentToken: () => snapshot?.accessToken ?? null,
    getUserId: () => snapshot?.userId ?? null,
    hasSettled: () => snapshot !== null,
    refresh,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /**
     * 로그아웃 뒤 새 비회원 전환
     *
     * 본문을 실으면 서버가 쿠키의 refresh를 폐기하지 않아 본문 없이 보낸다.
     * 새 등록이 성공하면 그 응답이 refresh 쿠키를 덮어써 서버 로그아웃이 실패해도 이전 회원이 남지 않는다.
     * 서버 로그아웃이 성공하면 서버가 쿠키를 만료시키므로 등록이 실패해도 빈 신원으로 둔다.
     * 둘 다 실패하면 이전 회원의 쿠키가 남아 다음 갱신이 그 회원을 되살리므로, 신원을 바꾸지 않고 실패로 알린다.
     * 잠금을 기다리는 사이 다른 탭이 이미 로그아웃했으면 그 새 비회원을 다시 내보내지 않는다.
     * 그 탭의 방송은 늦게 올 수 있어 저장소의 로그아웃 세대로 먼저 알아채고, 바뀐 쿠키로 갱신해 새 비회원을 받는다.
     * 진행 중에 또 부르면 같은 로그아웃을 돌려준다.
     */
    logout: () => {
      const target = snapshot?.userId ?? null;
      const generation = logoutGeneration();
      return (switching ??= withLock(async () => {
        if ((snapshot?.userId ?? null) !== target) return true;
        if (generation !== null && (logoutGeneration() ?? 0) > generation) {
          let res = await send("/api/auth/refresh", "refresh");
          if (lostRefreshCookie(res)) res = await register();
          const next = snapshotFrom(res);
          // 실패한 빈 신원을 방송하면 순번이 앞 탭의 새 비회원보다 높아 모든 탭이 신원을 잃는다.
          // 이 탭만 비워 두면 늦게 온 앞 탭의 알림이 이 탭에도 새 비회원을 채운다.
          if (next) adopt(next);
          else publish(EMPTY);
          return true;
        }
        const token = snapshot?.accessToken;
        const out = token ? await send("/api/auth/logout", "logout", { token }) : null;
        const next = snapshotFrom(await register());
        if (next === null && token && !out?.ok) return false;
        bumpLogoutGeneration();
        adopt(next ?? EMPTY);
        return true;
      }).finally(() => {
        switching = null;
      }));
    },
  };
  browserSources.add(source);
  return source;
}
