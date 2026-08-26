import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import { requestCameraGate } from "@/lib/nativeCameraGate";

const postMessage = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  postMessage.mockClear();
  window.history.replaceState(null, "", "/");
});

/** 셸이 게이트를 처리할 수 있다는 표시(`cameraGate=1`)를 붙인 URL로 바꾼다. */
function withGateCapableShell() {
  window.history.replaceState(null, "", "/social/room/1?userId=7&cameraGate=1");
}

function nativeEntry(): (raw: string) => void {
  return (globalThis as unknown as Record<string, (raw: string) => void>)[NATIVE_MESSAGE_ENTRY];
}

it("브리지가 없으면 즉시 true다 — 브라우저 자체 권한 프롬프트가 기존대로 동작한다", async () => {
  await expect(requestCameraGate()).resolves.toBe(true);
  expect(postMessage).not.toHaveBeenCalled();
});

it("request-camera-gate를 보내고 camera-gate-result 응답을 그대로 돌려준다", async () => {
  vi.stubGlobal("ReactNativeWebView", { postMessage });

  const pending = requestCameraGate();
  expect(JSON.parse(postMessage.mock.calls[0][0] as string).type).toBe("request-camera-gate");

  nativeEntry()(JSON.stringify({ type: "camera-gate-result", granted: false, atMs: 1 }));

  await expect(pending).resolves.toBe(false);
});

it("표시 없는 구형 셸에서 응답이 없으면 타임아웃 후 true로 진행한다 — 오늘 동작 유지", async () => {
  vi.stubGlobal("ReactNativeWebView", { postMessage });

  const pending = requestCameraGate();
  vi.advanceTimersByTime(3000);

  await expect(pending).resolves.toBe(true);
});

it("게이트를 처리하는 셸에서는 OS 다이얼로그 응답을 기다린다 — 3초에 끊지 않는다", async () => {
  withGateCapableShell();
  vi.stubGlobal("ReactNativeWebView", { postMessage });

  const pending = requestCameraGate();
  // 사용자가 권한 다이얼로그 앞에서 고민하는 구간. 여기서 끊으면 뒤늦은 허용이 버려진다.
  await vi.advanceTimersByTimeAsync(10_000);
  nativeEntry()(JSON.stringify({ type: "camera-gate-result", granted: true, atMs: 1 }));

  await expect(pending).resolves.toBe(true);
});

it("게이트를 처리하는 셸도 응답이 끝내 없으면 차단한다 — 다이얼로그를 방치한 경우", async () => {
  withGateCapableShell();
  vi.stubGlobal("ReactNativeWebView", { postMessage });

  const pending = requestCameraGate();
  await vi.advanceTimersByTimeAsync(120_000);

  await expect(pending).resolves.toBe(false);
});

it("진행 중 요청이 있으면 재발신 없이 같은 결과를 공유한다 — StrictMode 이중 effect 대비", async () => {
  vi.stubGlobal("ReactNativeWebView", { postMessage });

  const first = requestCameraGate();
  const second = requestCameraGate();
  expect(postMessage).toHaveBeenCalledTimes(1);

  nativeEntry()(JSON.stringify({ type: "camera-gate-result", granted: false, atMs: 1 }));

  await expect(first).resolves.toBe(false);
  await expect(second).resolves.toBe(false);
});

it("요청이 끝난 뒤의 새 호출은 다시 발신한다", async () => {
  vi.stubGlobal("ReactNativeWebView", { postMessage });

  const first = requestCameraGate();
  nativeEntry()(JSON.stringify({ type: "camera-gate-result", granted: true, atMs: 1 }));
  await first;

  const second = requestCameraGate();
  expect(postMessage).toHaveBeenCalledTimes(2);
  // 요청을 완결시켜 모듈 스코프 진행 중 표시를 비운다 — 다음 테스트로 새면 안 된다.
  nativeEntry()(JSON.stringify({ type: "camera-gate-result", granted: true, atMs: 2 }));
  await second;
});

it("게이트를 처리하는 셸에서도 허용 응답이 제때 오면 통과시킨다", async () => {
  withGateCapableShell();
  vi.stubGlobal("ReactNativeWebView", { postMessage });

  const pending = requestCameraGate();
  nativeEntry()(JSON.stringify({ type: "camera-gate-result", granted: true, atMs: 1 }));

  await expect(pending).resolves.toBe(true);
});

it("타임아웃 뒤에 도착한 응답은 결과를 뒤집지 않는다", async () => {
  vi.stubGlobal("ReactNativeWebView", { postMessage });

  const pending = requestCameraGate();
  vi.advanceTimersByTime(3000);
  nativeEntry()(JSON.stringify({ type: "camera-gate-result", granted: false, atMs: 1 }));

  await expect(pending).resolves.toBe(true);
});
