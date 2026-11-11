import { afterEach, describe, expect, it, vi } from "vitest";

import en from "../../locales/en/common.json";
import ja from "../../locales/ja/common.json";
import zhHant from "../../locales/zh-Hant/common.json";
import i18n, {
  buildResources,
  decideInitialLocale,
  isKoreanLocale,
  withObjectParticle,
} from "../i18n";
import { LOCALE_STORAGE_KEY } from "../locale";

afterEach(async () => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
  await i18n.changeLanguage("ko");
});

describe("i18n", () => {
  it("테스트 환경에서는 한국어로 초기화된다", () => {
    expect(i18n.language).toBe("ko");
    expect(i18n.t("actions.close")).toBe("닫기");
  });

  it("영어로 바꾸면 영어 카탈로그를 읽는다", async () => {
    await i18n.changeLanguage("en");

    expect(i18n.t("actions.close")).toBe(en.actions.close);
  });

  it.each([
    ["ja", ja.actions.close],
    ["zh-Hant", zhHant.actions.close],
  ])("%s로 바꾸면 그 언어 카탈로그를 읽는다", async (lng, close) => {
    await i18n.changeLanguage(lng);

    expect(i18n.language).toBe(lng);
    expect(i18n.t("actions.close")).toBe(close);
  });

  it("지원하지 않는 언어는 영어로 떨어진다", async () => {
    await i18n.changeLanguage("fr");

    expect(i18n.language).toBe("en");
    expect(i18n.t("actions.close")).toBe(en.actions.close);
  });

  it("보간 변수를 채운다", () => {
    expect(i18n.t("duration.hoursMinutes", { hours: 3, minutes: 42 })).toBe("3시간 42분");
  });

  it("glob 결과를 언어·네임스페이스 리소스로 묶는다", () => {
    const resources = buildResources({
      "../locales/ko/records.json": { default: { a: "가" } },
      "../locales/en/records.json": { default: { a: "A" } },
    });

    expect(resources).toEqual({ ko: { records: { a: "가" } }, en: { records: { a: "A" } } });
  });

  it("locales 폴더 안에서 부른 glob 키도 묶는다", () => {
    const resources = buildResources({ "../ko/common.json": { default: { a: "가" } } });

    expect(resources).toEqual({ ko: { common: { a: "가" } } });
  });
});

describe("isKoreanLocale", () => {
  it.each([
    ["ko", true],
    ["en", false],
    ["ja", false],
    ["zh-Hant", false],
  ])("%s 화면이면 %s", async (lng, expected) => {
    await i18n.changeLanguage(lng);

    expect(isKoreanLocale()).toBe(expected);
  });
});

describe("i18n 모듈 재평가", () => {
  it("모듈을 다시 평가해도 언어와 저장값을 바꾸지 않는다", async () => {
    vi.resetModules();
    const again = (await import("@/lib/i18n")).default;

    expect(again).toBe(i18n);
    expect(i18n.language).toBe("ko");
    expect(sessionStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
  });
});

describe("decideInitialLocale", () => {
  it("정한 언어를 sessionStorage에 적는다", () => {
    window.history.replaceState(null, "", "/?lang=en");

    expect(decideInitialLocale()).toBe("en");
    expect(sessionStorage.getItem(LOCALE_STORAGE_KEY)).toBe("en");
  });

  it("?lang이 없으면 저장값을 navigator.languages보다 먼저 본다", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-US"]);
    sessionStorage.setItem(LOCALE_STORAGE_KEY, "ko");

    expect(decideInitialLocale()).toBe("ko");
  });

  it("저장소 읽기가 막히면 navigator.languages로 정한다", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["ko-KR"]);

    expect(decideInitialLocale()).toBe("ko");
  });

  it("navigator.languages를 위에서부터 훑는다", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["fr-FR", "ko-KR"]);

    expect(decideInitialLocale()).toBe("ko");
  });

  it("navigator.languages가 비어 있으면 navigator.language를 본다", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue([]);
    vi.spyOn(navigator, "language", "get").mockReturnValue("ko-KR");

    expect(decideInitialLocale()).toBe("ko");
  });

  it("저장소 쓰기가 막혀도 언어를 정한다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    window.history.replaceState(null, "", "/?lang=en");

    expect(decideInitialLocale()).toBe("en");
  });
});

describe("복수형", () => {
  const ns = "plural-probe";
  // 임시 네임스페이스는 카탈로그 키 타입에 없어 타입 검사 없이 부른다.
  const t = i18n.t.bind(i18n) as unknown as (key: string, options: object) => string;

  afterEach(() => {
    i18n.removeResourceBundle("ko", ns);
    i18n.removeResourceBundle("en", ns);
  });

  it("영어는 count로 _one과 _other를 고르고 한국어는 접미 없는 키 하나를 쓴다", async () => {
    i18n.addResourceBundle("ko", ns, { session: "공부 {{count}}회" });
    i18n.addResourceBundle("en", ns, {
      session_one: "{{count}} session",
      session_other: "{{count}} sessions",
    });

    expect(t("session", { ns, count: 1 })).toBe("공부 1회");
    expect(t("session", { ns, count: 2 })).toBe("공부 2회");

    await i18n.changeLanguage("en");

    expect(t("session", { ns, count: 1 })).toBe("1 session");
    expect(t("session", { ns, count: 2 })).toBe("2 sessions");
  });
});

describe("withObjectParticle", () => {
  it("받침이 있으면 을, 없으면 를을 붙인다", () => {
    expect(withObjectParticle("왕관")).toBe("왕관을");
    expect(withObjectParticle("헤드폰")).toBe("헤드폰을");
    expect(withObjectParticle("단추 리본")).toBe("단추 리본을");
    expect(withObjectParticle("하트 묶음")).toBe("하트 묶음을");
    expect(withObjectParticle("라벤더")).toBe("라벤더를");
  });

  it("한글로 끝나지 않으면 둘 다 적는다", () => {
    expect(withObjectParticle("D-day")).toBe("D-day을(를)");
  });
});
