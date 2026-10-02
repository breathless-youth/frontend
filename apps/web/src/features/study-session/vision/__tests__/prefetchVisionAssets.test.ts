import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_MODEL_VARIANT, MEDIAPIPE_WASM_PATH, MODEL_PATHS } from "../visionConfig";

const LOADER = `${MEDIAPIPE_WASM_PATH}/vision_wasm_internal.js`;
const WASM = `${MEDIAPIPE_WASM_PATH}/vision_wasm_internal.wasm`;
const MODEL = MODEL_PATHS[DEFAULT_MODEL_VARIANT];

// MediaPipe 패키지 경계. 실제 경로 계산은 mediapipeModule.test.ts가 본다.
// hoisted 블록은 import보다 먼저 돌아 상수를 못 쓰므로 반환값은 아래에서 넣는다.
const resolveVisionAssetUrls = vi.hoisted(() =>
  vi.fn<() => Promise<{ wasmLoaderPath: string; wasmBinaryPath: string }>>(),
);
resolveVisionAssetUrls.mockResolvedValue({ wasmLoaderPath: LOADER, wasmBinaryPath: WASM });

vi.mock("../mediapipeModule", () => ({ resolveVisionAssetUrls }));

// 모듈이 "문서당 한 번" 플래그를 들고 있어 테스트마다 새로 불러온다.
async function loadModule() {
  return await import("../prefetchVisionAssets");
}

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();
let idleCallbacks: IdleRequestCallback[] = [];

function runIdle() {
  for (const callback of idleCallbacks.splice(0)) {
    callback({ didTimeout: false, timeRemaining: () => 50 });
  }
}

/** 이벤트 루프를 한 바퀴 돌린다. "더 이상 요청하지 않는다"를 확인할 때 쓴다. */
function nextTask() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.resetModules();
  idleCallbacks = [];
  vi.stubGlobal("requestIdleCallback", (callback: IdleRequestCallback) => {
    idleCallbacks.push(callback);
    return idleCallbacks.length;
  });
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => Promise.resolve(new Response(new Uint8Array(8))));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resolveVisionAssetUrls.mockClear();
  Reflect.deleteProperty(navigator, "connection");
});

describe("prefetchVisionAssets", () => {
  it("유휴 시점에 로더 → wasm → 기본 모델을 낮은 우선순위로 받는다", async () => {
    const { prefetchVisionAssets } = await loadModule();

    prefetchVisionAssets();
    await nextTask();
    // 유휴 콜백 전에는 아무것도 받지 않는다. 홈 첫 화면과 대역폭을 다투지 않는다.
    expect(fetchMock).not.toHaveBeenCalled();

    runIdle();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(resolveVisionAssetUrls).toHaveBeenCalledWith(MEDIAPIPE_WASM_PATH);
    expect(fetchMock.mock.calls).toEqual([
      [LOADER, { priority: "low" }],
      [WASM, { priority: "low" }],
      [MODEL, { priority: "low" }],
    ]);
  });

  it("앞 파일의 본문을 다 읽기 전에는 다음 파일을 요청하지 않는다", async () => {
    let resolveBody: (value: ArrayBuffer) => void = () => {};
    const bodyPromise = new Promise<ArrayBuffer>((resolve) => {
      resolveBody = resolve;
    });
    const loaderResponse = new Response(new Uint8Array(8));
    vi.spyOn(loaderResponse, "arrayBuffer").mockReturnValue(bodyPromise);
    fetchMock.mockImplementationOnce(() => Promise.resolve(loaderResponse));
    const { prefetchVisionAssets } = await loadModule();

    prefetchVisionAssets();
    runIdle();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await nextTask();
    // 본문을 아직 다 읽지 않았다. 다음 파일을 요청하면 안 된다.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveBody(new ArrayBuffer(8));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });

  it("Save-Data를 켠 사용자는 아무것도 받지 않는다", async () => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { saveData: true },
    });
    const { prefetchVisionAssets } = await loadModule();

    prefetchVisionAssets();

    expect(idleCallbacks).toHaveLength(0);
    await nextTask();
    expect(resolveVisionAssetUrls).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("측정용 전 빌드(VITE_VISION_PREFETCH=off)는 아무것도 받지 않는다", async () => {
    vi.stubEnv("VITE_VISION_PREFETCH", "off");
    const { prefetchVisionAssets } = await loadModule();

    prefetchVisionAssets();

    expect(idleCallbacks).toHaveLength(0);
    await nextTask();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("문서당 한 번만 받는다 — 홈이 다시 그려져도 요청이 늘지 않는다", async () => {
    const { prefetchVisionAssets } = await loadModule();

    prefetchVisionAssets();
    prefetchVisionAssets();
    prefetchVisionAssets();

    expect(idleCallbacks).toHaveLength(1);
    runIdle();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await nextTask();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("requestIdleCallback이 없는 엔진(iOS WKWebView)은 1.5초 뒤에 받는다", async () => {
    // vi.useFakeTimers()가 자체 fake requestIdleCallback을 설치하므로, 설치 뒤에 undefined로
    // 덮어써야 "없는 엔진" 상태가 유지된다(먼저 스텁하면 설치 시 되돌아간다).
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", undefined);
    const { prefetchVisionAssets } = await loadModule();

    prefetchVisionAssets();
    await vi.advanceTimersByTimeAsync(1_499);
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });

  it("받기에 실패하면 조용히 멈추고 남은 파일은 받지 않는다", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Load failed"));
    const { prefetchVisionAssets } = await loadModule();

    prefetchVisionAssets();
    runIdle();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await nextTask();

    // 거부가 새어 나가면 vitest가 처리되지 않은 오류로 실행 전체를 실패시킨다.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("응답이 실패(404 등)여도 조용히 멈추고 남은 파일은 받지 않는다", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not found", { status: 404 }));
    const { prefetchVisionAssets } = await loadModule();

    prefetchVisionAssets();
    runIdle();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await nextTask();

    // fetch는 404에서도 resolve한다. 응답 상태를 보지 않으면 나머지 파일도 받아 버린다.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("경로 계산에 실패해도 조용히 넘어가고 아무것도 받지 않는다", async () => {
    resolveVisionAssetUrls.mockRejectedValueOnce(new Error("wasm 경로 계산 실패"));
    const { prefetchVisionAssets } = await loadModule();

    prefetchVisionAssets();
    runIdle();
    await vi.waitFor(() => expect(resolveVisionAssetUrls).toHaveBeenCalled());
    await nextTask();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
