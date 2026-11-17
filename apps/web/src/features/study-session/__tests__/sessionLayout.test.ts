import { describe, expect, it } from "vitest";

import { PIP_ANCHOR, PIP_SIZE, SESSION_LAYER_INSET } from "../sessionLayout";

describe("PIP_ANCHOR", () => {
  it("작은 창 위 끝을 세션 레이어 위 여백과 같은 높이에 둔다", () => {
    expect(SESSION_LAYER_INSET).toContain("pt-[calc(env(safe-area-inset-top)+13px)]");
    expect(PIP_ANCHOR).toContain("top-[calc(env(safe-area-inset-top)+13px)]");
    expect(SESSION_LAYER_INSET).toContain(
      "landscape-compact:pt-[calc(env(safe-area-inset-top)+18px)]",
    );
    expect(PIP_ANCHOR).toContain("landscape-compact:top-[calc(env(safe-area-inset-top)+18px)]");
    expect(PIP_ANCHOR).toContain("left-[calc(env(safe-area-inset-left)+16px)]");
  });

  it("크기는 세로 108×144, 폭 600 이상 144×192, 가로 160×108이다", () => {
    expect(PIP_SIZE.split(" ")).toEqual(
      expect.arrayContaining([
        "w-27",
        "h-36",
        "regular:w-36",
        "regular:h-48",
        "landscape-compact:w-40",
        "landscape-compact:h-27",
      ]),
    );
  });
});
