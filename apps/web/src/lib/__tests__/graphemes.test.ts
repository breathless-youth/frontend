import { describe, expect, it } from "vitest";

import { canSegmentGraphemes, countGraphemes, normalizeServerText } from "@/lib/graphemes";

describe("canSegmentGraphemes", () => {
  it("이 환경(Node/vitest)은 Intl.Segmenter를 지원한다", () => {
    expect(canSegmentGraphemes).toBe(true);
  });
});

describe("countGraphemes", () => {
  it("이모지 조합(ZWJ·국기·키캡)을 한 글자로 센다", () => {
    expect(countGraphemes("🧑‍💻")).toBe(1);
    expect(countGraphemes("🇰🇷")).toBe(1);
    expect(countGraphemes("1️⃣")).toBe(1);
  });

  it("한글 글자 수를 세고, 빈 문자열은 0이다", () => {
    expect(countGraphemes("가나다")).toBe(3);
    expect(countGraphemes("")).toBe(0);
  });
});

describe("normalizeServerText", () => {
  it("서버처럼 NFC로 맞추고 앞뒤에서 자바 strip()이 빼는 글자만 뺀다", () => {
    expect(normalizeServerText("  가\u3000")).toBe("가");
    expect(normalizeServerText("\u001f가\t")).toBe("가");
    expect(normalizeServerText("\u00a0가\u00a0")).toBe("\u00a0가\u00a0");
    expect(normalizeServerText("\ufeff가")).toBe("\ufeff가");
    expect(normalizeServerText("가".normalize("NFD"))).toBe("가");
  });
});
