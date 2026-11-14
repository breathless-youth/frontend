import { afterEach, describe, expect, it, vi } from "vitest";

import { deviceRegion } from "../deviceRegion";

function mockLanguages(languages: string[]) {
  vi.spyOn(navigator, "languages", "get").mockReturnValue(languages);
  vi.spyOn(navigator, "language", "get").mockReturnValue(languages[0] ?? "");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("deviceRegion", () => {
  it("기기 언어 태그의 지역을 대문자 두 글자로 돌려준다", () => {
    mockLanguages(["zh-Hant-TW", "en-US"]);
    expect(deviceRegion()).toBe("TW");
  });

  it("첫 언어에 지역이 없으면 추측하지 않고 null이다", () => {
    mockLanguages(["ja", "en-US"]);
    expect(deviceRegion()).toBeNull();
  });

  it("숫자 지역(419 등)이나 읽을 수 없는 태그는 null이다", () => {
    mockLanguages(["es-419"]);
    expect(deviceRegion()).toBeNull();
    mockLanguages(["not a tag"]);
    expect(deviceRegion()).toBeNull();
  });
});
