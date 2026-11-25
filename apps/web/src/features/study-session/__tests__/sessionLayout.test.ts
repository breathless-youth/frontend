import { describe, expect, it } from "vitest";

import { PIP_SIZE } from "../sessionLayout";

describe("PIP_SIZE", () => {
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
