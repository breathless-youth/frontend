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

  it("문구가 아직 없는 언어는 영어 문구를 돌려준다", () => {
    setDeviceLanguages(["ja-JP"]);
    expect(t("tab.home")).toBe("Home");
    setDeviceLanguages(["zh-Hant-TW"]);
    expect(t("appLockPicker.selected", { count: 3 })).toBe("3 selected");
  });

  it("{{이름}} 자리를 채운다", () => {
    expect(t("appLockPicker.selected", { count: 3 })).toBe("3개 선택");
    setDeviceLanguages(["en-US"]);
    expect(t("appLockPicker.selected", { count: 3 })).toBe("3 selected");
  });
});

describe("셸 문구 가드", () => {
  const variables = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

  it("ko와 en의 키 집합이 같다", () => {
    expect(Object.keys(copy.en).sort()).toEqual(Object.keys(copy.ko).sort());
  });

  it("en 문구는 비어 있지 않고 한글이 없다", () => {
    for (const [key, text] of Object.entries(copy.en)) {
      expect({ key, empty: text.trim() === "", hangul: /[가-힣]/.test(text) }).toEqual({
        key,
        empty: false,
        hangul: false,
      });
    }
  });

  it("ko와 en의 보간 변수 이름이 같다", () => {
    for (const key of Object.keys(copy.ko) as (keyof typeof copy.ko)[]) {
      expect({ key, vars: variables(copy.en[key]) }).toEqual({
        key,
        vars: variables(copy.ko[key]),
      });
    }
  });
});
