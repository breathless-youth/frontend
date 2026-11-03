import { copy, getAppLocale, t } from "../i18n";

let mockLocales: { languageCode: string | null }[] = [{ languageCode: "ko" }];
jest.mock("expo-localization", () => ({ getLocales: () => mockLocales }));

afterEach(() => {
  mockLocales = [{ languageCode: "ko" }];
});

describe("getAppLocale", () => {
  it.each([
    ["ko", "ko"],
    ["en", "en"],
    ["ja", "en"],
    [null, "en"],
  ] as const)("기기 첫 언어가 %s면 %s다", (languageCode, expected) => {
    mockLocales = [{ languageCode }];
    expect(getAppLocale()).toBe(expected);
  });

  it("언어 목록이 비어 있으면 en이다", () => {
    mockLocales = [];
    expect(getAppLocale()).toBe("en");
  });

  it("호출할 때마다 기기 언어를 다시 읽는다", () => {
    expect(getAppLocale()).toBe("ko");
    mockLocales = [{ languageCode: "en" }];
    expect(getAppLocale()).toBe("en");
  });
});

describe("t", () => {
  it("기기 언어의 문구를 돌려준다", () => {
    expect(t("tab.home")).toBe("홈");
    mockLocales = [{ languageCode: "en" }];
    expect(t("tab.home")).toBe("Home");
  });

  it("{{이름}} 자리를 채운다", () => {
    expect(t("appLockPicker.selected", { count: 3 })).toBe("3개 선택");
    mockLocales = [{ languageCode: "en" }];
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
