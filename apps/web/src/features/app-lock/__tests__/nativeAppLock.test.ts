import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";

import { __resetAppLockCapabilityForTests } from "../appLockCapability";
import { writeAppLockEnabled } from "../appLockSettings";
import {
  APP_LOCK_RESPONSE_TIMEOUT_MS,
  authorizeAppLock,
  openAppLockBatteryGuide,
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

function sent(): { type: string; id?: string }[] {
  return postMessage.mock.calls.map(
    (call) => JSON.parse(call[0] as string) as { type: string; id?: string },
  );
}

function sentTypes(): string[] {
  return sent().map((message) => message.type);
}

function idOf(index: number): string {
  const id = sent()[index]?.id;
  if (id === undefined) throw new Error(`${index}번째 요청에 id가 없다`);
  return id;
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

  it("query를 보내고 같은 id의 app-lock-state를 상태로 돌려준다", async () => {
    withShell();
    const pending = queryAppLock();
    expect(sentTypes()).toEqual(["app-lock-query"]);
    fromNative({ type: "app-lock-state", id: idOf(0), ...STATE });
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
    fromNative({ type: "app-lock-state", id: idOf(0), ...STATE });
    await expect(pending).resolves.toEqual(STATE);
  });

  it("시간이 다 된 요청의 늦은 응답은 다음 요청의 답이 되지 않는다", async () => {
    withShell();
    const query = queryAppLock();
    await vi.advanceTimersByTimeAsync(APP_LOCK_RESPONSE_TIMEOUT_MS);
    await expect(query).resolves.toBeNull();

    const authorize = authorizeAppLock();
    const settled = vi.fn();
    void authorize.then(settled);
    fromNative({ type: "app-lock-state", id: idOf(0), ...STATE, authorized: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).not.toHaveBeenCalled();

    fromNative({ type: "app-lock-state", id: idOf(1), ...STATE, authorized: true });
    await expect(authorize).resolves.toMatchObject({ authorized: true });
  });

  it("겹친 요청은 바로 보내고 응답 순서가 바뀌어도 각자 자기 응답을 받는다", async () => {
    withShell();
    const query = queryAppLock();
    const authorize = authorizeAppLock();
    expect(sentTypes()).toEqual(["app-lock-query", "app-lock-authorize"]);
    expect(idOf(0)).not.toBe(idOf(1));

    fromNative({ type: "app-lock-state", id: idOf(1), ...STATE, authorized: true });
    fromNative({ type: "app-lock-state", id: idOf(0), ...STATE, authorized: false });
    await expect(authorize).resolves.toMatchObject({ authorized: true });
    await expect(query).resolves.toMatchObject({ authorized: false });
  });

  it("Android에서 설정 화면 두 곳을 다녀오는 동안 2분에 끊지 않는다", async () => {
    withShell();
    const pending = authorizeAppLock();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    fromNative({ type: "app-lock-state", id: idOf(0), ...STATE });
    await expect(pending).resolves.toEqual(STATE);
  });

  it("고르기는 모달 앞에서 고르는 동안 기다린다", async () => {
    withShell();
    const pending = pickAppLockApps();
    expect(sentTypes()).toEqual(["app-lock-pick"]);
    await vi.advanceTimersByTimeAsync(9 * 60_000);
    fromNative({ type: "app-lock-state", id: idOf(0), ...STATE, appCount: 5 });
    await expect(pending).resolves.toMatchObject({ appCount: 5 });
  });

  it("고르기 응답이 10분 안에 오지 않으면 null이다", async () => {
    withShell();
    const pending = pickAppLockApps();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    await expect(pending).resolves.toBeNull();
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

  it("배터리 안내는 켜짐과 상관없이 보내고 답을 기다리지 않는다", () => {
    withShell();
    openAppLockBatteryGuide();
    expect(sent()).toEqual([{ type: "app-lock-battery-guide", atMs: expect.any(Number) }]);
  });

  it("기능 조회가 없는 셸에는 아무것도 보내지 않는다", () => {
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    writeAppLockEnabled(true);
    startAppLock();
    stopAppLock();
    openAppLockBatteryGuide();
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
