import * as Application from "expo-application";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import {
  __resetInstallAttributionForTests,
  acknowledgeInstallAttribution,
  attachInstallAttributionSink,
  deepLinkAdFromUrl,
  type InstallAttribution,
  startInstallAttribution,
} from "../installAttribution";
import { readGoogleDeferredDeepLink } from "../googleDeferredLink";
import { fetchMetaDeferredAppLink } from "../metaAds";
import { trackNativeEvent } from "../nativeAnalytics";

jest.mock("expo-application", () => ({ getInstallReferrerAsync: jest.fn() }));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));
jest.mock("../metaAds", () => ({ fetchMetaDeferredAppLink: jest.fn() }));
jest.mock("../googleDeferredLink", () => ({ readGoogleDeferredDeepLink: jest.fn() }));
jest.mock("../nativeAnalytics", () => ({ trackNativeEvent: jest.fn() }));

const mockedReferrer = Application.getInstallReferrerAsync as jest.Mock;
const mockedGet = SecureStore.getItemAsync as jest.Mock;
const mockedSet = SecureStore.setItemAsync as jest.Mock;
const mockedDeferred = fetchMetaDeferredAppLink as jest.Mock;
const mockedGoogle = readGoogleDeferredDeepLink as jest.Mock;
const mockedTrack = trackNativeEvent as jest.Mock;

const STORAGE_KEY = "installAttributionV1";
const NOW = 1_761_700_000_000;

let warn: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  __resetInstallAttributionForTests();
  jest.spyOn(Date, "now").mockReturnValue(NOW);
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  mockedGet.mockResolvedValue(null);
  mockedSet.mockResolvedValue(undefined);
  mockedReferrer.mockResolvedValue(null);
  mockedDeferred.mockResolvedValue(null);
  mockedGoogle.mockResolvedValue({ result: "unsupported" });
});

afterEach(() => {
  jest.restoreAllMocks();
  warn.mockRestore();
});

function collect(): InstallAttribution[] {
  const received: InstallAttribution[] = [];
  attachInstallAttributionSink((payload) => received.push(payload));
  return received;
}

describe("deepLinkAdFromUrl", () => {
  it("지연 딥링크 주소에서 fm_ad 값을 꺼낸다", () => {
    expect(deepLinkAdFromUrl("focusmakers://?fm_ad=ios_v1")).toBe("ios_v1");
    expect(deepLinkAdFromUrl("focusmakers:///?fm_ad=aos_v12")).toBe("aos_v12");
  });

  it("형식에 맞지 않는 값은 버린다", () => {
    expect(deepLinkAdFromUrl("focusmakers://?fm_ad=web_v1")).toBeNull();
    expect(deepLinkAdFromUrl("focusmakers://?fm_ad=ios_v1%20x")).toBeNull();
    expect(deepLinkAdFromUrl("focusmakers://?other=1")).toBeNull();
  });

  it("주소가 없거나 깨졌으면 null이다", () => {
    expect(deepLinkAdFromUrl(null)).toBeNull();
    expect(deepLinkAdFromUrl("")).toBeNull();
    expect(deepLinkAdFromUrl("not a url")).toBeNull();
  });

  it("메타가 덧붙인 파라미터와 조각(#)이 있어도 광고 번호만 꺼낸다", () => {
    expect(deepLinkAdFromUrl("focusmakers://?fm_ad=ios_v1&al_applink_data=%7B%22a%22%3A1%7D")).toBe(
      "ios_v1",
    );
    expect(deepLinkAdFromUrl("focusmakers://?fm_ad=aos_v2&fb_click_time_utc=1700000000")).toBe(
      "aos_v2",
    );
    expect(deepLinkAdFromUrl("focusmakers://?fm_ad=ios_v3#fragment")).toBe("ios_v3");
  });

  it("다른 파라미터의 인코딩이 깨져도 throw하지 않는다", () => {
    expect(deepLinkAdFromUrl("focusmakers://?bad=%E0%A4%A&fm_ad=ios_v4")).toBe("ios_v4");
  });

  it("광고 번호 자체의 인코딩이 깨졌으면 null이다", () => {
    expect(deepLinkAdFromUrl("focusmakers://?fm_ad=%E0%A4%A")).toBeNull();
  });
});

describe("startInstallAttribution 수집", () => {
  it("Android는 플레이 설치 정보 원문과 딥링크 값을 함께 읽어 보관한다", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    mockedReferrer.mockResolvedValue("utm_source=apps.facebook.com&utm_content=%7B%7D");
    mockedDeferred.mockResolvedValue("focusmakers://?fm_ad=aos_v3");

    await startInstallAttribution();

    const expected: InstallAttribution = {
      platform: "android",
      installReferrer: "utm_source=apps.facebook.com&utm_content=%7B%7D",
      deepLinkAd: "aos_v3",
      googleDeepLinkAd: null,
      capturedAtMs: NOW,
    };
    expect(mockedSet).toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify(expected));
    expect(collect()).toEqual([expected]);
  });

  it("iOS는 설치 정보를 읽지 않고 딥링크 값만 읽는다", async () => {
    jest.replaceProperty(Platform, "OS", "ios");
    mockedDeferred.mockResolvedValue("focusmakers://?fm_ad=ios_v2");

    await startInstallAttribution();

    expect(mockedReferrer).not.toHaveBeenCalled();
    expect(collect()).toEqual([
      {
        platform: "ios",
        installReferrer: null,
        deepLinkAd: "ios_v2",
        googleDeepLinkAd: null,
        capturedAtMs: NOW,
      },
    ]);
  });

  it("읽은 값이 없어도 보관한다 — 유입을 알 수 없는 사용자도 그대로 기록한다", async () => {
    jest.replaceProperty(Platform, "OS", "ios");

    await startInstallAttribution();

    expect(collect()).toEqual([
      {
        platform: "ios",
        installReferrer: null,
        deepLinkAd: null,
        googleDeepLinkAd: null,
        capturedAtMs: NOW,
      },
    ]);
  });

  it("설치 정보 조회가 실패하면 이번 실행에는 넘기지 않고 다음 실행에서 설치 정보만 다시 읽는다", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    mockedReferrer.mockRejectedValueOnce(new Error("SERVICE_UNAVAILABLE"));
    mockedDeferred.mockResolvedValue("focusmakers://?fm_ad=aos_v1");

    await startInstallAttribution();
    expect(collect()).toEqual([]);

    const firstStored = mockedSet.mock.calls.at(-1)![1] as string;
    mockedGet.mockResolvedValue(firstStored);
    mockedReferrer.mockResolvedValue("code=0412");
    __resetInstallAttributionForTests();

    await startInstallAttribution();

    expect(mockedDeferred).toHaveBeenCalledTimes(1);
    expect(collect()).toEqual([
      {
        platform: "android",
        installReferrer: "code=0412",
        deepLinkAd: "aos_v1",
        googleDeepLinkAd: null,
        capturedAtMs: NOW,
      },
    ]);
    expect(JSON.parse(mockedSet.mock.calls.at(-1)![1] as string)).toEqual({
      platform: "android",
      installReferrer: "code=0412",
      deepLinkAd: "aos_v1",
      googleDeepLinkAd: null,
      capturedAtMs: NOW,
    });
  });

  it("설치 정보 조회가 세 번째 실행에서도 실패하면 원문 없이 넘긴다 — 영영 기록이 빠지면 안 된다", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    mockedGet.mockResolvedValue(
      JSON.stringify({
        platform: "android",
        installReferrer: null,
        deepLinkAd: null,
        capturedAtMs: 1,
        referrerFailures: 2,
      }),
    );
    mockedReferrer.mockRejectedValue(new Error("SERVICE_DISCONNECTED"));

    await startInstallAttribution();

    expect(collect()).toEqual([
      {
        platform: "android",
        installReferrer: null,
        deepLinkAd: null,
        googleDeepLinkAd: null,
        capturedAtMs: 1,
      },
    ]);
  });

  it("보관한 값의 모양이 이상하면 처음부터 다시 읽는다 — 깨진 값을 계속 보내지 않는다", async () => {
    jest.replaceProperty(Platform, "OS", "ios");
    mockedGet.mockResolvedValue(JSON.stringify({ platform: "web", installReferrer: 1 }));
    mockedDeferred.mockResolvedValue("focusmakers://?fm_ad=ios_v2");

    await startInstallAttribution();

    expect(mockedDeferred).toHaveBeenCalledTimes(1);
    expect(collect()).toEqual([
      {
        platform: "ios",
        installReferrer: null,
        deepLinkAd: "ios_v2",
        googleDeepLinkAd: null,
        capturedAtMs: NOW,
      },
    ]);
  });

  it("너무 긴 설치 정보는 싣지 않는다", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    mockedReferrer.mockResolvedValue(`utm_source=x&pad=${"a".repeat(5000)}`);

    await startInstallAttribution();

    expect(collect()[0]?.installReferrer).toBeNull();
  });

  it("이미 보관한 값이 있으면 다시 읽지 않고 그 값을 넘긴다", async () => {
    const stored: InstallAttribution = {
      platform: "android",
      installReferrer: "code=0412",
      deepLinkAd: null,
      googleDeepLinkAd: null,
      capturedAtMs: 1,
    };
    mockedGet.mockResolvedValue(JSON.stringify(stored));

    await startInstallAttribution();

    expect(mockedReferrer).not.toHaveBeenCalled();
    expect(mockedDeferred).not.toHaveBeenCalled();
    expect(collect()).toEqual([stored]);
  });

  it("웹이 받았다고 답한 뒤에는 다시 읽지도 넘기지도 않는다", async () => {
    mockedGet.mockResolvedValue("acked");

    await startInstallAttribution();

    expect(mockedDeferred).not.toHaveBeenCalled();
    expect(collect()).toEqual([]);
  });

  it("보관소를 읽지 못하면 이번 실행에는 아무것도 하지 않는다 — 다음 실행에서 다시 시도한다", async () => {
    mockedGet.mockRejectedValue(new Error("keychain locked"));

    await startInstallAttribution();

    expect(mockedDeferred).not.toHaveBeenCalled();
    expect(mockedSet).not.toHaveBeenCalled();
    expect(collect()).toEqual([]);
  });

  it("보관에 실패해도 이번 실행에는 넘긴다", async () => {
    jest.replaceProperty(Platform, "OS", "ios");
    mockedSet.mockRejectedValue(new Error("keychain locked"));

    await startInstallAttribution();

    expect(collect()).toHaveLength(1);
  });
});

describe("구글 광고 그룹 번호 필드", () => {
  it("새로 읽은 값에는 googleDeepLinkAd가 null로 실린다", async () => {
    jest.replaceProperty(Platform, "OS", "android");

    await startInstallAttribution();

    expect(collect()[0]).toMatchObject({ googleDeepLinkAd: null });
  });

  it("구버전 앱이 보관한 값에 googleDeepLinkAd가 없으면 null로 읽고 다시 수집하지 않는다", async () => {
    mockedGet.mockResolvedValue(
      JSON.stringify({
        platform: "android",
        installReferrer: "r",
        deepLinkAd: null,
        capturedAtMs: 1,
      }),
    );

    await startInstallAttribution();

    expect(mockedDeferred).not.toHaveBeenCalled();
    expect(collect()[0]).toMatchObject({ installReferrer: "r", googleDeepLinkAd: null });
  });
});

describe("구글 광고 그룹 번호 읽기", () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, "OS", "android");
  });

  it("구글 지연 딥링크의 g_ 라벨을 싣고 found를 기록한다", async () => {
    mockedGoogle.mockResolvedValue({ result: "found", url: "focusmakers://?fm_ad=g_planner" });

    await startInstallAttribution();

    expect(collect()[0]).toMatchObject({ googleDeepLinkAd: "g_planner", deepLinkAd: null });
    expect(mockedTrack).toHaveBeenCalledWith("google_deferred_link_read", {
      result: "found",
      has_gclid: false,
    });
  });

  it("메타 라벨 패턴으로는 g_ 값을 받지 않는다", () => {
    expect(deepLinkAdFromUrl("focusmakers://?fm_ad=g_planner")).toBeNull();
  });

  it("형식 밖 라벨이면 null을 싣고 invalid를 기록한다", async () => {
    mockedGoogle.mockResolvedValue({ result: "found", url: "focusmakers://?fm_ad=ios_v1" });

    await startInstallAttribution();

    expect(collect()[0]).toMatchObject({ googleDeepLinkAd: null });
    expect(mockedTrack).toHaveBeenCalledWith("google_deferred_link_read", {
      result: "invalid",
      has_gclid: false,
    });
  });

  it.each(["empty", "error"] as const)("%s면 null을 싣고 그 결과를 기록한다", async (result) => {
    mockedGoogle.mockResolvedValue({ result });

    await startInstallAttribution();

    expect(collect()[0]).toMatchObject({ googleDeepLinkAd: null });
    expect(mockedTrack).toHaveBeenCalledWith("google_deferred_link_read", {
      result,
      has_gclid: false,
    });
  });

  it("설치 정보에 gclid가 있으면 구글 값을 1초 간격으로 30번까지 묻고 그 사실을 기록한다", async () => {
    mockedReferrer.mockResolvedValue("gclid=Cj0KCQ&gbraid=x");
    mockedGoogle.mockResolvedValue({ result: "found", url: "focusmakers://?fm_ad=g_group" });

    await startInstallAttribution();

    expect(mockedGoogle).toHaveBeenCalledWith({ attempts: 30, intervalMs: 1000 });
    expect(mockedTrack).toHaveBeenCalledWith("google_deferred_link_read", {
      result: "found",
      has_gclid: true,
    });
    expect(collect()[0]).toMatchObject({ googleDeepLinkAd: "g_group" });
  });

  it("gclid가 없으면 구글 값을 한 번만 묻는다 — 구글과 상관없는 설치가 기다리지 않는다", async () => {
    mockedReferrer.mockResolvedValue("utm_source=google-play&utm_medium=organic");

    await startInstallAttribution();

    expect(mockedGoogle).toHaveBeenCalledWith({ attempts: 1, intervalMs: 1000 });
  });

  it("unsupported면 기록하지 않는다", async () => {
    await startInstallAttribution();

    expect(mockedTrack).not.toHaveBeenCalled();
  });

  it("구글 읽기가 reject해도 설치 정보와 메타 값은 그대로 넘긴다", async () => {
    mockedGoogle.mockRejectedValue(new Error("boom"));
    mockedReferrer.mockResolvedValue("code=0412");
    mockedDeferred.mockResolvedValue("focusmakers://?fm_ad=aos_v2");

    await startInstallAttribution();

    expect(collect()[0]).toMatchObject({
      installReferrer: "code=0412",
      deepLinkAd: "aos_v2",
      googleDeepLinkAd: null,
    });
    expect(mockedTrack).toHaveBeenCalledWith("google_deferred_link_read", {
      result: "error",
      has_gclid: false,
    });
  });

  it("설치 정보만 다시 읽는 실행에서는 구글 값을 다시 묻지 않는다", async () => {
    mockedGet.mockResolvedValue(
      JSON.stringify({
        platform: "android",
        installReferrer: null,
        deepLinkAd: null,
        googleDeepLinkAd: "g_group",
        capturedAtMs: 1,
        referrerFailures: 1,
      }),
    );
    mockedReferrer.mockResolvedValue("r");

    await startInstallAttribution();

    expect(mockedGoogle).not.toHaveBeenCalled();
    expect(collect()[0]).toMatchObject({ installReferrer: "r", googleDeepLinkAd: "g_group" });
  });
});

describe("전달과 확인", () => {
  it("수집이 끝날 때 붙어 있는 sink가 있으면 바로 넘긴다", async () => {
    jest.replaceProperty(Platform, "OS", "ios");
    const received = collect();

    await startInstallAttribution();

    expect(received).toHaveLength(1);
  });

  it("웹이 받았다고 답하면 보관을 끝내고 다음 sink에는 넘기지 않는다", async () => {
    jest.replaceProperty(Platform, "OS", "ios");
    await startInstallAttribution();

    await acknowledgeInstallAttribution();

    expect(mockedSet).toHaveBeenLastCalledWith(STORAGE_KEY, "acked");
    expect(collect()).toEqual([]);
  });

  it("마지막에 붙은 sink 하나에만 넘긴다", async () => {
    jest.replaceProperty(Platform, "OS", "ios");
    const first = collect();
    const second = collect();

    await startInstallAttribution();

    expect(first).toEqual([]);
    expect(second).toHaveLength(1);
  });

  it("떼어 낸 sink에는 넘기지 않는다", async () => {
    jest.replaceProperty(Platform, "OS", "ios");
    const received: InstallAttribution[] = [];
    const detach = attachInstallAttributionSink((payload) => received.push(payload));
    detach();

    await startInstallAttribution();

    expect(received).toEqual([]);
  });
});
