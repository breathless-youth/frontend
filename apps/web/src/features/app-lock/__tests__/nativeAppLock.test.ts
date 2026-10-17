import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";

import { __resetAppLockCapabilityForTests } from "../appLockCapability";
import { writeAppLockEnabled } from "../appLockSettings";
import {
  APP_LOCK_RESPONSE_TIMEOUT_MS,
  authorizeAppLock,
  pickAppLockApps,
  queryAppLock,
  startAppLock,
  stopAppLock,
  subscribeAppLockStarted,
} from "../nativeAppLock";

const postMessage = vi.fn();
const STATE = {
  supported: true,
  authorized: true,
  revoked: false,
  appCount: 3,
  categoryCount: 1,
};

function withShell(): void {
  vi.stubGlobal("ReactNativeWebView", { postMessage });
  window.history.replaceState(null, "", "/settings?appLock=1");
  __resetAppLockCapabilityForTests();
}

function fromNative(message: object): void {
  (globalThis as unknown as Record<string, (raw: string) => void>)[NATIVE_MESSAGE_ENTRY](
    JSON.stringify({ ...message, atMs: 1 }),
  );
}

function sentTypes(): string[] {
  return postMessage.mock.calls.map(
    (call) => (JSON.parse(call[0] as string) as { type: string }).type,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  postMessage.mockClear();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  __resetAppLockCapabilityForTests();
});

describe("응답을 기다리는 요청", () => {
  it("브리지가 없으면 보내지 않고 바로 null이다", async () => {
    await expect(queryAppLock()).resolves.toBeNull();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("query를 보내고 app-lock-state를 상태로 돌려준다", async () => {
    withShell();
    const pending = queryAppLock();
    expect(sentTypes()).toEqual(["app-lock-query"]);
    fromNative({ type: "app-lock-state", ...STATE });
    await expect(pending).resolves.toEqual(STATE);
  });

  it("5초 안에 답이 없으면 null이다", async () => {
    withShell();
    const pending = queryAppLock();
    await vi.advanceTimersByTimeAsync(APP_LOCK_RESPONSE_TIMEOUT_MS);
    await expect(pending).resolves.toBeNull();
  });

  it("권한 요청은 사용자가 권한 창 앞에서 고민하는 동안 5초에 끊지 않는다", async () => {
    withShell();
    const pending = authorizeAppLock();
    expect(sentTypes()).toEqual(["app-lock-authorize"]);
    await vi.advanceTimersByTimeAsync(30_000);
    fromNative({ type: "app-lock-state", ...STATE });
    await expect(pending).resolves.toEqual(STATE);
  });

  it("요청이 겹치면 앞 요청이 끝난 뒤에 보내 각자 자기 응답을 받는다", async () => {
    withShell();
    const query = queryAppLock();
    const authorize = authorizeAppLock();
    await vi.advanceTimersByTimeAsync(0);
    expect(sentTypes()).toEqual(["app-lock-query"]);

    fromNative({ type: "app-lock-state", ...STATE, authorized: false });
    await expect(query).resolves.toMatchObject({ authorized: false });
    expect(sentTypes()).toEqual(["app-lock-query", "app-lock-authorize"]);

    fromNative({ type: "app-lock-state", ...STATE, authorized: true });
    await expect(authorize).resolves.toMatchObject({ authorized: true });
  });

  it("앞 요청이 시간 초과로 끝나도 다음 요청을 보낸다", async () => {
    withShell();
    const query = queryAppLock();
    const next = queryAppLock();
    await vi.advanceTimersByTimeAsync(APP_LOCK_RESPONSE_TIMEOUT_MS);
    await expect(query).resolves.toBeNull();
    expect(sentTypes()).toEqual(["app-lock-query", "app-lock-query"]);
    fromNative({ type: "app-lock-state", ...STATE });
    await expect(next).resolves.toEqual(STATE);
  });

  it("고르기는 모달이 닫힐 때까지 기다린다", async () => {
    withShell();
    const pending = pickAppLockApps();
    expect(sentTypes()).toEqual(["app-lock-pick"]);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    fromNative({ type: "app-lock-state", ...STATE, appCount: 5 });
    await expect(pending).resolves.toMatchObject({ appCount: 5 });
  });
});

describe("세션 잠금", () => {
  it("꺼져 있으면 start를 보내지 않는다", () => {
    withShell();
    startAppLock();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("켜져 있으면 start를 보낸다", () => {
    withShell();
    writeAppLockEnabled(true);
    startAppLock();
    expect(sentTypes()).toEqual(["app-lock-start"]);
  });

  it("stop은 켜짐과 상관없이 보낸다 — 공부 중에 꺼도 풀려야 한다", () => {
    withShell();
    stopAppLock();
    expect(sentTypes()).toEqual(["app-lock-stop"]);
  });

  it("기능 조회가 없는 셸에는 아무것도 보내지 않는다", () => {
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    writeAppLockEnabled(true);
    startAppLock();
    stopAppLock();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("app-lock-started를 개수와 함께 알린다", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAppLockStarted(listener);
    fromNative({ type: "app-lock-started", appCount: 2, categoryCount: 0 });
    expect(listener).toHaveBeenCalledWith({ appCount: 2, categoryCount: 0 });
    unsubscribe();
  });
});
