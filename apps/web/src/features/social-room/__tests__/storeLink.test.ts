import { describe, expect, it } from "vitest";

import { detectStorePlatform, installLink, readInstallUtm, storeLink } from "../storeLink";

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

  it("Android에서 코드가 비어 있으면 referrer 없이 스토어만 가리킨다", () => {
    expect(storeLink("android", "")).toBe(
      "https://play.google.com/store/apps/details?id=com.breathlessyouth.mobile",
    );
  });
});

const UTM = { utm_source: "timelapse", utm_medium: "share", utm_campaign: "timelapse_share" };

describe("readInstallUtm", () => {
  it("UTM 세 개만 읽고 나머지 쿼리는 버린다", () => {
    expect(
      readInstallUtm("?utm_source=timelapse&code=0412&utm_campaign=timelapse_share&foo=1"),
    ).toEqual({ utm_source: "timelapse", utm_campaign: "timelapse_share" });
  });
});

describe("installLink", () => {
  it("Android는 UTM을 Play referrer에 한 번 인코딩해 싣는다", () => {
    expect(installLink("android", UTM)).toBe(
      "https://play.google.com/store/apps/details?id=com.breathlessyouth.mobile&referrer=utm_source%3Dtimelapse%26utm_medium%3Dshare%26utm_campaign%3Dtimelapse_share",
    );
  });

  it("iOS는 팀 provider 토큰과 utm_campaign을 캠페인 이름으로 싣는다", () => {
    expect(installLink("ios", UTM)).toBe(
      "https://apps.apple.com/app/apple-store/id6797220287?pt=129235193&ct=timelapse_share&mt=8",
    );
  });

  it("그 밖의 기기는 랜딩에 UTM을 그대로 붙인다", () => {
    expect(installLink(null, UTM)).toBe(
      "https://focusmakers.app/?utm_source=timelapse&utm_medium=share&utm_campaign=timelapse_share",
    );
  });

  it("UTM이 없으면 유입 표시 없이 각 목적지로 보낸다", () => {
    expect(installLink("android", {})).toBe(
      "https://play.google.com/store/apps/details?id=com.breathlessyouth.mobile",
    );
    expect(installLink("ios", {})).toBe(
      "https://apps.apple.com/app/apple-store/id6797220287?pt=129235193&mt=8",
    );
    expect(installLink(null, {})).toBe("https://focusmakers.app/");
  });
});
