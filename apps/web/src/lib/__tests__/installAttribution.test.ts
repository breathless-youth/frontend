import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { InstallAttributionMessage } from "@focusmakers/types";

import {
  INSTALL_ATTRIBUTION_PENDING_KEY,
  handleInstallAttribution,
  installAttributionProperties,
} from "@/lib/installAttribution";

const mocks = vi.hoisted(() => ({ setInstallAttributionUserProperties: vi.fn() }));

vi.mock("@/lib/amplitude", () => ({
  setInstallAttributionUserProperties: mocks.setInstallAttributionUserProperties,
}));

function message(overrides: Partial<InstallAttributionMessage> = {}): InstallAttributionMessage {
  return {
    type: "install-attribution",
    platform: "android",
    installReferrer: null,
    deepLinkAd: null,
    capturedAtMs: 5,
    atMs: 9,
    ...overrides,
  };
}

describe("installAttributionProperties", () => {
  it("딥링크 광고 번호가 있으면 메타 광고와 그 번호를 남긴다", () => {
    expect(installAttributionProperties(message({ deepLinkAd: "ios_v1" }))).toEqual({
      install_source: "meta_ad",
      install_ad: "ios_v1",
    });
  });

  it("딥링크 광고 번호를 설치 정보보다 먼저 본다", () => {
    expect(
      installAttributionProperties(
        message({
          deepLinkAd: "aos_v2",
          installReferrer: "utm_source=google-play&utm_medium=organic",
        }),
      ),
    ).toEqual({ install_source: "meta_ad", install_ad: "aos_v2" });
  });

  it.each(["apps.facebook.com", "apps.instagram.com"])(
    "설치 정보 출처가 %s면 광고 번호 없이 메타 광고로 남긴다 — 번호는 서버가 암호문을 풀어 채운다",
    (source) => {
      expect(
        installAttributionProperties(
          message({
            installReferrer: `utm_source=${source}&utm_content=%7B%22source%22%3A%7B%7D%7D`,
          }),
        ),
      ).toEqual({ install_source: "meta_ad" });
    },
  );

  it("초대코드가 있으면 친구 초대로 남기고 코드는 싣지 않는다", () => {
    expect(installAttributionProperties(message({ installReferrer: "code=0412" }))).toEqual({
      install_source: "invite",
    });
  });

  it("플레이 오가닉 설치를 구분한다", () => {
    expect(
      installAttributionProperties(
        message({ installReferrer: "utm_source=google-play&utm_medium=organic" }),
      ),
    ).toEqual({ install_source: "organic" });
  });

  it("그 밖의 링크는 UTM 값을 토큰일 때만 남긴다", () => {
    expect(
      installAttributionProperties(
        message({
          installReferrer:
            "utm_source=invite_share&utm_medium=kakao&utm_campaign=%ED%95%9C%EA%B8%80",
        }),
      ),
    ).toEqual({
      install_source: "other_link",
      install_utm_source: "invite_share",
      install_utm_medium: "kakao",
    });
  });

  it("출처 없이 UTM만 있어도 그 밖의 링크로 남긴다", () => {
    expect(
      installAttributionProperties(message({ installReferrer: "utm_campaign=fall_promo" })),
    ).toEqual({ install_source: "other_link", install_utm_campaign: "fall_promo" });
  });

  it("읽은 값이 없으면 알 수 없음으로 남긴다", () => {
    expect(installAttributionProperties(message({ platform: "ios" }))).toEqual({
      install_source: "unknown",
    });
  });
});

describe("handleInstallAttribution", () => {
  const postMessage = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  function sentTypes(): string[] {
    return postMessage.mock.calls.map(
      ([raw]) => (JSON.parse(raw as string) as { type: string }).type,
    );
  }

  it("원문을 기기에 보관하고 user property를 남긴 뒤 앱에 받았다고 답한다", () => {
    const received = message({ installReferrer: "code=0412" });

    handleInstallAttribution(received);

    expect(JSON.parse(localStorage.getItem(INSTALL_ATTRIBUTION_PENDING_KEY)!)).toEqual({
      platform: "android",
      installReferrer: "code=0412",
      deepLinkAd: null,
      capturedAtMs: 5,
    });
    expect(mocks.setInstallAttributionUserProperties).toHaveBeenCalledWith({
      install_source: "invite",
    });
    expect(sentTypes()).toEqual(["install-attribution-received"]);
  });

  it("보관에 실패하면 답하지 않는다 — 앱이 다음 준비 신호에서 다시 보낸다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    expect(() => handleInstallAttribution(message({ deepLinkAd: "ios_v1" }))).not.toThrow();

    expect(mocks.setInstallAttributionUserProperties).toHaveBeenCalledTimes(1);
    expect(sentTypes()).toEqual([]);
  });
});
