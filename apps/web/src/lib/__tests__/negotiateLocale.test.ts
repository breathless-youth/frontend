import { describe, expect, it } from "vitest";

import { APP_LOCALES, negotiateLocale } from "@focusmakers/types";

describe("negotiateLocale", () => {
  it.each([
    ["ko-KR", "ko"],
    ["ja-JP", "ja"],
    ["ja", "ja"],
    ["en-GB", "en"],
    ["zh-TW", "zh-Hant"],
    ["zh-HK", "zh-Hant"],
    ["zh-MO", "zh-Hant"],
    ["zh-Hant-HK", "zh-Hant"],
    ["zh_TW", "zh-Hant"],
    ["ZH-hant", "zh-Hant"],
    ["zh-CN", "en"],
    ["zh-Hans", "en"],
    ["zh-Hans-HK", "en"],
    ["zh-SG", "en"],
    ["zh", "en"],
    ["fr-FR", "en"],
  ] as const)("%s → %s", (tag, expected) => {
    expect(negotiateLocale([tag], APP_LOCALES)).toBe(expected);
  });

  it("지원하지 않는 언어는 건너뛰고 다음 선호 언어를 본다", () => {
    expect(negotiateLocale(["fr-FR", "ja-JP"], APP_LOCALES)).toBe("ja");
    expect(negotiateLocale(["zh-CN", "ja"], APP_LOCALES)).toBe("ja");
  });

  it("선호 언어가 없으면 en이다", () => {
    expect(negotiateLocale([], APP_LOCALES)).toBe("en");
  });

  it("supported 밖의 언어는 건너뛴다", () => {
    expect(negotiateLocale(["ja-JP", "ko-KR"], ["ko", "en"])).toBe("ko");
    expect(negotiateLocale(["zh-TW"], ["ko", "en"])).toBe("en");
  });
});
