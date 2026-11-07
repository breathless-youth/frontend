import { describe, expect, it } from "vitest";

import { resolveLocale } from "../locale";

describe("resolveLocale", () => {
  it.each([
    ["?lang=en", ["ko-KR"], null, "en"],
    ["?lang=ko", ["en-US"], null, "ko"],
    ["?lang=ko-KR", ["en-US"], null, "ko"],
    ["?lang=KO", ["en-US"], null, "ko"],
    ["?lang=xx", ["ko-KR"], null, "en"],
    ["?lang=ja", ["ko-KR"], null, "ja"],
    ["?lang=zh-Hant", ["ko-KR"], null, "zh-Hant"],
    ["?lang=fr", ["ko-KR"], null, "en"],
    ["", ["ko-KR"], null, "ko"],
    ["", ["en-US"], null, "en"],
    ["", ["ja-JP"], null, "ja"],
    ["", ["zh-TW"], null, "zh-Hant"],
    ["", ["zh-HK"], null, "zh-Hant"],
    ["", ["zh-CN"], null, "en"],
    ["", [], null, "en"],
    ["", ["en-US"], "ko", "ko"],
    ["", ["ko-KR"], "en", "en"],
    ["", ["ko-KR"], "fr", "ko"],
    ["", ["ko-KR"], "ja", "ja"],
    ["", ["ko-KR"], "zh-Hant", "zh-Hant"],
    ["?lang=en", ["ko-KR"], "ko", "en"],
    ["?theme=dark&lang=ko", ["en-US"], null, "ko"],
    ["?lang=", ["ko-KR"], null, "ko"],
    ["", ["fr-FR", "ko-KR"], null, "ko"],
    ["", ["ja-JP", "ko-KR"], null, "ja"],
    ["", ["fr-FR", "ja-JP"], null, "ja"],
    ["", ["zh-CN", "fr-FR"], null, "en"],
  ] as const)("search=%s languages=%j stored=%s → %s", (search, languages, stored, expected) => {
    expect(resolveLocale(search, languages, stored)).toBe(expected);
  });
});
