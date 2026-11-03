import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AcquisitionResponse,
  AcquisitionSource,
  InstallAttributionMessage,
} from "@focusmakers/types";

import { ApiError } from "@/lib/api";
import {
  INSTALL_ATTRIBUTION_PENDING_KEY,
  acquisitionUserProperties,
  flushInstallAttribution,
  handleInstallAttribution,
  installUtmProperties,
  toAcquisitionRequest,
} from "@/lib/installAttribution";

const mocks = vi.hoisted(() => ({
  setInstallAttributionUserProperties: vi.fn(),
  postAcquisition: vi.fn(),
}));

vi.mock("@/lib/amplitude", () => ({
  setInstallAttributionUserProperties: mocks.setInstallAttributionUserProperties,
}));

vi.mock("@/lib/acquisitionApi", () => ({
  postAcquisition: mocks.postAcquisition,
}));

function message(overrides: Partial<InstallAttributionMessage> = {}): InstallAttributionMessage {
  return {
    type: "install-attribution",
    platform: "android",
    installReferrer: null,
    deepLinkAd: null,
    googleDeepLinkAd: null,
    capturedAtMs: 5,
    atMs: 9,
    ...overrides,
  };
}

function response(overrides: Partial<AcquisitionResponse> = {}): AcquisitionResponse {
  return {
    source: "UNKNOWN",
    metaAd: null,
    googleAd: null,
    inviteCode: null,
    firstTouchAt: "2026-11-04T00:00:00Z",
    ...overrides,
  };
}

describe("toAcquisitionRequest", () => {
  it("플랫폼을 대문자로, 읽은 시각을 ISO 문자열로 바꾼다", () => {
    expect(
      toAcquisitionRequest({
        platform: "android",
        installReferrer: "r",
        deepLinkAd: null,
        googleDeepLinkAd: "g_planner",
        capturedAtMs: 0,
      }),
    ).toEqual({
      platform: "ANDROID",
      installReferrer: "r",
      deepLinkAd: null,
      googleDeepLinkAd: "g_planner",
      capturedAt: "1970-01-01T00:00:00.000Z",
    });
  });
});

describe("acquisitionUserProperties", () => {
  it("메타 광고는 광고 번호와 아는 광고 ID만 남긴다", () => {
    expect(
      acquisitionUserProperties(
        response({
          source: "META_AD",
          metaAd: {
            campaignId: "120200000000000001",
            adsetId: "120200000000000002",
            adId: null,
            label: "aos_v3",
          },
          inviteCode: "0412",
        }),
      ),
    ).toEqual({
      install_source: "meta_ad",
      install_ad: "aos_v3",
      install_meta_campaign_id: "120200000000000001",
      install_meta_adset_id: "120200000000000002",
    });
  });

  it("구글 광고는 광고 그룹 번호를 광고 번호로 남긴다", () => {
    expect(
      acquisitionUserProperties(response({ source: "GOOGLE_AD", googleAd: { label: "g_group" } })),
    ).toEqual({ install_source: "google_ad", install_ad: "g_group" });
  });

  it("초대코드는 사용자 속성에 싣지 않는다", () => {
    expect(acquisitionUserProperties(response({ source: "INVITE", inviteCode: "0412" }))).toEqual({
      install_source: "invite",
    });
  });

  it("모르는 유입 경로도 소문자로 그대로 남긴다", () => {
    expect(
      acquisitionUserProperties(response({ source: "TIKTOK_AD" as AcquisitionSource })),
    ).toEqual({ install_source: "tiktok_ad" });
  });
});

describe("installUtmProperties", () => {
  it("UTM 값은 토큰 형식일 때만 남긴다", () => {
    expect(
      installUtmProperties(
        "utm_source=invite_share&utm_medium=kakao&utm_campaign=%ED%95%9C%EA%B8%80",
      ),
    ).toEqual({ install_utm_source: "invite_share", install_utm_medium: "kakao" });
  });

  it("설치 정보가 없으면 아무것도 남기지 않는다", () => {
    expect(installUtmProperties(null)).toEqual({});
  });
});

describe("handleInstallAttribution과 flushInstallAttribution", () => {
  const postMessage = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.postAcquisition.mockResolvedValue(response());
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

  function storePending(value: unknown) {
    localStorage.setItem(INSTALL_ATTRIBUTION_PENDING_KEY, JSON.stringify(value));
  }

  it("앱 메시지를 보관하고 답신한 뒤 서버로 보내고, 성공하면 속성을 남기고 보관을 지운다", async () => {
    mocks.postAcquisition.mockResolvedValue(
      response({ source: "GOOGLE_AD", googleAd: { label: "g_planner" } }),
    );

    handleInstallAttribution(
      message({ installReferrer: "gclid=abc&utm_source=google", googleDeepLinkAd: "g_planner" }),
    );
    expect(sentTypes()).toEqual(["install-attribution-received"]);
    await flushInstallAttribution();

    expect(mocks.postAcquisition).toHaveBeenCalledTimes(1);
    expect(mocks.postAcquisition).toHaveBeenCalledWith({
      platform: "ANDROID",
      installReferrer: "gclid=abc&utm_source=google",
      deepLinkAd: null,
      googleDeepLinkAd: "g_planner",
      capturedAt: "1970-01-01T00:00:00.005Z",
    });
    expect(mocks.setInstallAttributionUserProperties).toHaveBeenCalledWith({
      install_utm_source: "google",
      install_source: "google_ad",
      install_ad: "g_planner",
    });
    expect(localStorage.getItem(INSTALL_ATTRIBUTION_PENDING_KEY)).toBeNull();
  });

  it("400이면 보관을 지우고 속성은 남기지 않는다", async () => {
    mocks.postAcquisition.mockRejectedValue(new ApiError("bad", 400, "INVALID"));
    storePending({ platform: "ios", installReferrer: null, deepLinkAd: null, capturedAtMs: 1 });

    await flushInstallAttribution();

    expect(localStorage.getItem(INSTALL_ATTRIBUTION_PENDING_KEY)).toBeNull();
    expect(mocks.setInstallAttributionUserProperties).not.toHaveBeenCalled();
  });

  it.each([401, 500])("%i이면 보관을 남기고 속성은 남기지 않는다", async (status) => {
    mocks.postAcquisition.mockRejectedValue(new ApiError("fail", status));
    storePending({ platform: "ios", installReferrer: null, deepLinkAd: null, capturedAtMs: 1 });

    await flushInstallAttribution();

    expect(localStorage.getItem(INSTALL_ATTRIBUTION_PENDING_KEY)).not.toBeNull();
    expect(mocks.setInstallAttributionUserProperties).not.toHaveBeenCalled();
  });

  it("네트워크 실패면 보관을 남긴다", async () => {
    mocks.postAcquisition.mockRejectedValue(new TypeError("Failed to fetch"));
    storePending({ platform: "ios", installReferrer: null, deepLinkAd: null, capturedAtMs: 1 });

    await flushInstallAttribution();

    expect(localStorage.getItem(INSTALL_ATTRIBUTION_PENDING_KEY)).not.toBeNull();
  });

  it("전송 중에 다시 불려도 서버로는 한 번만 보낸다", async () => {
    let resolve: (value: AcquisitionResponse) => void = () => {};
    mocks.postAcquisition.mockReturnValue(
      new Promise<AcquisitionResponse>((r) => {
        resolve = r;
      }),
    );
    storePending({ platform: "ios", installReferrer: null, deepLinkAd: null, capturedAtMs: 1 });

    const first = flushInstallAttribution();
    const second = flushInstallAttribution();
    resolve(response());
    await Promise.all([first, second]);

    expect(mocks.postAcquisition).toHaveBeenCalledTimes(1);
  });

  it("보관 원문에 googleDeepLinkAd가 없으면 null로 보낸다", async () => {
    storePending({ platform: "android", installReferrer: "r", deepLinkAd: null, capturedAtMs: 1 });

    await flushInstallAttribution();

    expect(mocks.postAcquisition).toHaveBeenCalledWith(
      expect.objectContaining({ googleDeepLinkAd: null }),
    );
  });

  it("localStorage가 throw하면 서버를 부르지 않고 답신도 보내지 않는다", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    expect(() => handleInstallAttribution(message({ deepLinkAd: "ios_v1" }))).not.toThrow();
    await flushInstallAttribution();

    expect(sentTypes()).toEqual([]);
    expect(mocks.postAcquisition).not.toHaveBeenCalled();
  });

  it("보관한 값이 없으면 서버를 부르지 않는다", async () => {
    await flushInstallAttribution();

    expect(mocks.postAcquisition).not.toHaveBeenCalled();
  });

  it("보관 값 모양이 깨졌으면 지우고 서버를 부르지 않는다", async () => {
    storePending({ platform: "web", installReferrer: 1 });

    await flushInstallAttribution();

    expect(mocks.postAcquisition).not.toHaveBeenCalled();
    expect(localStorage.getItem(INSTALL_ATTRIBUTION_PENDING_KEY)).toBeNull();
  });
});
