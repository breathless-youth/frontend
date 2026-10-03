import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveVisionAssetUrls } from "../mediapipeModule";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveVisionAssetUrls", () => {
  it("세션과 같은 규칙으로 고른 로더·wasm 경로를 돌려주고, 아무것도 받지 않는다", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const urls = await resolveVisionAssetUrls("/mediapipe/wasm");

    // SIMD 지원 여부에 따라 라이브러리가 둘 중 하나를 고른다. 모듈 변형(vision_wasm_module_internal)은
    // 번들에 없으므로 여기 나오면 안 된다.
    expect(urls.wasmLoaderPath).toMatch(/^\/mediapipe\/wasm\/vision_wasm_(nosimd_)?internal\.js$/);
    expect(urls.wasmBinaryPath).toMatch(
      /^\/mediapipe\/wasm\/vision_wasm_(nosimd_)?internal\.wasm$/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
