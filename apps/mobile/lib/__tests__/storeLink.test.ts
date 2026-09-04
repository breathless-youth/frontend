import { Linking } from "react-native";

import { openAppStore, storeSchemeUrl, storeWebUrl } from "../storeLink";

describe("storeLink (BY-586)", () => {
  let openURL: jest.SpyInstance<Promise<boolean>, [url: string]>;

  beforeEach(() => {
    openURL = jest.spyOn(Linking, "openURL");
    openURL.mockReset();
  });

  afterEach(() => {
    openURL.mockRestore();
  });

  it("웹 storeLink.ts와 같은 ID로 스킴·https 링크를 만든다", () => {
    expect(storeSchemeUrl("ios")).toBe("itms-apps://apps.apple.com/app/id6797220287");
    expect(storeSchemeUrl("android")).toBe("market://details?id=com.breathlessyouth.mobile");
    expect(storeWebUrl("ios")).toBe("https://apps.apple.com/app/id6797220287");
    expect(storeWebUrl("android")).toBe(
      "https://play.google.com/store/apps/details?id=com.breathlessyouth.mobile",
    );
  });

  it("스킴으로 먼저 열고 성공하면 끝낸다", async () => {
    openURL.mockResolvedValue(true);

    await openAppStore("ios");

    expect(openURL.mock.calls).toEqual([["itms-apps://apps.apple.com/app/id6797220287"]]);
  });

  it("스킴이 실패하면 https로 한 번 더 시도한다", async () => {
    openURL.mockRejectedValueOnce(new Error("no handler")).mockResolvedValueOnce(true);

    await openAppStore("android");

    expect(openURL.mock.calls).toEqual([
      ["market://details?id=com.breathlessyouth.mobile"],
      ["https://play.google.com/store/apps/details?id=com.breathlessyouth.mobile"],
    ]);
  });

  it("둘 다 실패해도 throw하지 않는다 — 화면은 그대로 남아 다시 누를 수 있다", async () => {
    openURL.mockRejectedValue(new Error("blocked"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    await expect(openAppStore("ios")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
