import { describe, expect, it } from "vitest";

import { detectStorePlatform, storeLink } from "../storeLink";

const MAC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

describe("detectStorePlatform", () => {
  it("Android UA를 판별한다", () => {
    expect(
      detectStorePlatform("Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36", 5),
    ).toBe("android");
  });

  it("iPhone·iPad UA를 판별한다", () => {
    expect(detectStorePlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)", 5)).toBe(
      "ios",
    );
    expect(detectStorePlatform("Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X)", 5)).toBe("ios");
  });

  it("데스크톱 모드 iPadOS(맥 UA + 멀티터치)를 iOS로 판별한다", () => {
    expect(detectStorePlatform(MAC_UA, 5)).toBe("ios");
  });

  it("진짜 맥(터치 없음)은 null을 돌려준다", () => {
    expect(detectStorePlatform(MAC_UA, 0)).toBeNull();
  });
});

describe("storeLink", () => {
  it("Android는 referrer에 초대코드를 URL 인코딩해 싣는다", () => {
    expect(storeLink("android", "0412")).toBe(
      "https://play.google.com/store/apps/details?id=com.breathlessyouth.mobile&referrer=code%3D0412",
    );
  });

  it("iOS는 App Store 앱 페이지를 가리킨다", () => {
    expect(storeLink("ios", "0412")).toBe("https://apps.apple.com/app/id6797220287");
  });
});
