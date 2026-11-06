import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import {
  __resetNativePushPermissionForTests,
  canRequestPushPermission,
  requestPushPermission,
  requestPushPermissionOnHomeArrival,
} from "@/lib/nativePushPermission";

const postMessage = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  __resetNativePushPermissionForTests();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  postMessage.mockClear();
  window.history.replaceState(null, "", "/");
});

/** 알림 권한을 웹이 요청하는 셸이라는 표시(`pushPermission=1`)를 붙인다. */
function withPushPermissionShell() {
  window.history.replaceState(null, "", "/home?pushPermission=1");
  __resetNativePushPermissionForTests();
  vi.stubGlobal("ReactNativeWebView", { postMessage });
}

function nativeEntry(): (raw: string) => void {
  return (globalThis as unknown as Record<string, (raw: string) => void>)[NATIVE_MESSAGE_ENTRY];
}

it("표시가 없는 셸에서는 요청하지 않고 unsupported다 — 구버전 앱은 시작할 때 이미 물었다", async () => {
  vi.stubGlobal("ReactNativeWebView", { postMessage });

  expect(canRequestPushPermission()).toBe(false);
  await expect(requestPushPermission()).resolves.toBe("unsupported");
  expect(postMessage).not.toHaveBeenCalled();
});

it("브리지가 없으면 표시가 있어도 unsupported다", async () => {
  window.history.replaceState(null, "", "/home?pushPermission=1");
  __resetNativePushPermissionForTests();

  expect(canRequestPushPermission()).toBe(false);
  await expect(requestPushPermission()).resolves.toBe("unsupported");
});

it("request-push-permission을 보내고 응답의 status를 돌려준다", async () => {
  withPushPermissionShell();

  const pending = requestPushPermission();
  expect(JSON.parse(postMessage.mock.calls[0][0] as string).type).toBe("request-push-permission");

  nativeEntry()(JSON.stringify({ type: "push-permission-result", status: "granted", atMs: 1 }));

  await expect(pending).resolves.toBe("granted");
});

it("응답이 끝내 없으면 undetermined로 끝난다 — 온보딩이 다음 화면으로 넘어가야 한다", async () => {
  withPushPermissionShell();

  const pending = requestPushPermission();
  await vi.advanceTimersByTimeAsync(120_000);

  await expect(pending).resolves.toBe("undetermined");
});

it("요청을 보내지 못하면 기다리지 않고 undetermined로 끝난다", async () => {
  withPushPermissionShell();
  postMessage.mockImplementationOnce(() => {
    throw new Error("webview gone");
  });

  await expect(requestPushPermission()).resolves.toBe("undetermined");
});

it("동시에 불러도 요청은 한 번만 보낸다", async () => {
  withPushPermissionShell();

  const first = requestPushPermission();
  const second = requestPushPermission();
  nativeEntry()(JSON.stringify({ type: "push-permission-result", status: "denied", atMs: 1 }));

  await expect(first).resolves.toBe("denied");
  await expect(second).resolves.toBe("denied");
  expect(postMessage).toHaveBeenCalledTimes(1);
});

it("홈 도착 요청은 문서당 한 번만 보낸다 — 홈은 탭을 오가며 다시 마운트된다", () => {
  withPushPermissionShell();

  requestPushPermissionOnHomeArrival();
  requestPushPermissionOnHomeArrival();

  expect(postMessage).toHaveBeenCalledTimes(1);
});

it("홈 도착의 중복 호출도 같은 권한 응답이 끝날 때까지 기다린다", async () => {
  withPushPermissionShell();
  const first = requestPushPermissionOnHomeArrival();
  const second = requestPushPermissionOnHomeArrival();
  nativeEntry()(JSON.stringify({ type: "push-permission-result", status: "granted", atMs: 1 }));
  await expect(first).resolves.toBe("granted");
  await expect(second).resolves.toBe("granted");
  await expect(requestPushPermissionOnHomeArrival()).resolves.toBe("granted");
  expect(postMessage).toHaveBeenCalledTimes(1);
});
