import { describe, expect, it } from "vitest";

import { resolveLocale } from "../locale";

describe("resolveLocale", () => {
  it.each([
    ["?lang=en", "ko-KR", null, "en"],
    ["?lang=ko", "en-US", null, "ko"],
    ["?lang=ko-KR", "en-US", null, "ko"],
    ["?lang=KO", "en-US", null, "ko"],
    ["?lang=xx", "ko-KR", null, "en"],
    ["", "ko-KR", null, "ko"],
    ["", "en-US", null, "en"],
    ["", "ja-JP", null, "en"],
    ["", undefined, null, "en"],
    ["", "en-US", "ko", "ko"],
    ["", "ko-KR", "en", "en"],
    ["", "ko-KR", "fr", "ko"],
    ["?lang=en", "ko-KR", "ko", "en"],
    ["?theme=dark&lang=ko", "en-US", null, "ko"],
    ["?lang=", "ko-KR", null, "ko"],
  ] as const)("search=%s nav=%s stored=%s → %s", (search, nav, stored, expected) => {
    expect(resolveLocale(search, nav, stored)).toBe(expected);
  });
});
