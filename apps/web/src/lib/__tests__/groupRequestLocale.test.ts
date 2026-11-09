import { afterEach, describe, expect, it } from "vitest";

import i18n from "../i18n";
import { groupRequestLocale, toGroupRequestLocale } from "../groupRequestLocale";

afterEach(async () => {
  await i18n.changeLanguage("ko");
});

describe("toGroupRequestLocale", () => {
  it("화면 언어를 서버 번역 언어로 바꾸고 번체는 zh-TW로 보낸다", () => {
    expect(toGroupRequestLocale("ko")).toBe("ko");
    expect(toGroupRequestLocale("en")).toBe("en");
    expect(toGroupRequestLocale("ja")).toBe("ja");
    expect(toGroupRequestLocale("zh-Hant")).toBe("zh-TW");
  });

  it("모르는 언어는 영어 화면과 맞춰 en으로 보낸다", () => {
    expect(toGroupRequestLocale("fr")).toBe("en");
  });
});

describe("groupRequestLocale", () => {
  it("지금 화면 언어를 읽는다", async () => {
    await i18n.changeLanguage("zh-Hant");
    expect(groupRequestLocale()).toBe("zh-TW");
  });
});
