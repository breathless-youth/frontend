import { describe, expect, it } from "vitest";

import { canSegmentGraphemes, countGraphemes, firstGrapheme } from "@/lib/graphemes";

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

describe("firstGrapheme", () => {
  it("첫 글자가 이모지 조합이면 반쪽이 아닌 온전한 글자를 돌려준다", () => {
    const first = firstGrapheme("🧑‍💻코딩");
    expect(first).toBe("🧑‍💻");
    expect(first.length).not.toBe(1);
  });

  it("일반 글자의 첫 글자, 빈 문자열은 빈 문자열이다", () => {
    expect(firstGrapheme("포메")).toBe("포");
    expect(firstGrapheme("")).toBe("");
  });
});
