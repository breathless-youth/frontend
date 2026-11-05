import { setDeviceLanguages } from "../../jest/deviceLanguages";
import { copy, getAppLocale, t } from "../i18n";

afterEach(() => {
  setDeviceLanguages(["ko-KR"]);
});

describe("getAppLocale", () => {
  it.each([
    [["ko-KR"], "ko"],
    [["en-US"], "en"],
    [["ja-JP"], "ja"],
    [["zh-Hant-TW"], "zh-Hant"],
    [["zh-HK"], "zh-Hant"],
    [["zh-MO"], "zh-Hant"],
    [["zh-Hans-CN"], "en"],
    [["fr-FR"], "en"],
    [["fr", "ja"], "ja"],
    [["zh-Hans-CN", "ko-KR"], "ko"],
    [[], "en"],
  ])("기기 선호 언어가 %j면 %s다", (tags, expected) => {
    setDeviceLanguages(tags);
    expect(getAppLocale()).toBe(expected);
  });

  it("호출할 때마다 기기 언어를 다시 읽는다", () => {
    expect(getAppLocale()).toBe("ko");
    setDeviceLanguages(["en-US"]);
    expect(getAppLocale()).toBe("en");
  });
});

describe("t", () => {
  it("기기 언어의 문구를 돌려준다", () => {
    expect(t("tab.home")).toBe("홈");
    setDeviceLanguages(["en-US"]);
    expect(t("tab.home")).toBe("Home");
  });

  it("일본어·번체 중국어 기기는 그 언어 문구를 돌려준다", () => {
    setDeviceLanguages(["ja-JP"]);
    expect(t("tab.home")).toBe("ホーム");
    expect(t("appLockPicker.selected", { count: 3 })).toBe("3個を選択中");
    setDeviceLanguages(["zh-Hant-TW"]);
    expect(t("tab.records")).toBe("紀錄");
    expect(t("appLockPicker.selected", { count: 3 })).toBe("已選取 3 個");
  });

  it("{{이름}} 자리를 채운다", () => {
    expect(t("appLockPicker.selected", { count: 3 })).toBe("3개 선택");
    setDeviceLanguages(["en-US"]);
    expect(t("appLockPicker.selected", { count: 3 })).toBe("3 selected");
  });
});

describe("셸 문구 가드", () => {
  const variables = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

  const others = ["en", "ja", "zh-Hant"] as const;

  it("네 언어의 키 집합이 같다", () => {
    for (const locale of others) {
      expect({ locale, keys: Object.keys(copy[locale]).sort() }).toEqual({
        locale,
        keys: Object.keys(copy.ko).sort(),
      });
    }
  });

  it.each(others)("%s 문구는 비어 있지 않고 한글이 없다", (locale) => {
    for (const [key, text] of Object.entries(copy[locale])) {
      expect({ key, empty: text.trim() === "", hangul: /[가-힣]/.test(text) }).toEqual({
        key,
        empty: false,
        hangul: false,
      });
    }
  });

  it.each(others)("%s의 보간 변수 이름이 ko와 같다", (locale) => {
    for (const key of Object.keys(copy.ko) as (keyof typeof copy.ko)[]) {
      expect({ key, vars: variables(copy[locale][key]) }).toEqual({
        key,
        vars: variables(copy.ko[key]),
      });
    }
  });
});
