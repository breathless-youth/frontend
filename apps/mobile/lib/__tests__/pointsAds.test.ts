import { awaitAuth } from "../auth";
import {
  __resetPointsAdsForTests,
  isPointsAdsSupported,
  setPointsAdsAdapter,
  showPointsAd,
} from "../pointsAds";
import { parseToNativeMessage } from "../webBridge";

jest.mock("../auth", () => ({ awaitAuth: jest.fn() }));

const adapter = { show: jest.fn() };

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  __resetPointsAdsForTests();
  (awaitAuth as jest.Mock).mockResolvedValue({ userId: 1685, accessToken: "a", refreshToken: "r" });
  adapter.show.mockResolvedValue("rewarded");
});

describe("보상형 광고 보기", () => {
  it("어댑터가 없으면 지원하지 않고 볼 수 있는 광고가 없다고 답한다", async () => {
    expect(isPointsAdsSupported()).toBe(false);
    expect(await showPointsAd()).toBe("unavailable");
  });

  it("지금 사용자 ID를 문자열로 넘겨 광고를 띄운다", async () => {
    setPointsAdsAdapter(adapter);

    expect(isPointsAdsSupported()).toBe(true);
    expect(await showPointsAd()).toBe("rewarded");
    expect(adapter.show).toHaveBeenCalledWith("1685");
  });

  it("인증 상태가 없으면 광고를 띄우지 않는다", async () => {
    setPointsAdsAdapter(adapter);
    (awaitAuth as jest.Mock).mockResolvedValue(null);

    expect(await showPointsAd()).toBe("unavailable");
    expect(adapter.show).not.toHaveBeenCalled();
  });

  it("끝까지 보지 않고 닫으면 취소, SDK 오류는 볼 수 있는 광고 없음이다", async () => {
    setPointsAdsAdapter(adapter);
    adapter.show.mockResolvedValueOnce("cancelled");
    expect(await showPointsAd()).toBe("cancelled");

    adapter.show.mockRejectedValueOnce(new Error("no fill"));
    expect(await showPointsAd()).toBe("unavailable");
  });

  it("광고 오류는 객체를 통째로 남기지 않고 코드나 이름만 남긴다", async () => {
    setPointsAdsAdapter(adapter);
    const warn = jest.mocked(console.warn);
    adapter.show.mockRejectedValueOnce(
      Object.assign(new Error("ad request for userId 1685 failed"), { code: "no-fill" }),
    );
    adapter.show.mockRejectedValueOnce(new TypeError("ad request for userId 1685 failed"));

    await showPointsAd();
    await showPointsAd();

    expect(warn.mock.calls).toEqual([
      ["[points-ads] 광고 실패", "code no-fill"],
      ["[points-ads] 광고 실패", "TypeError"],
    ]);
  });

  it("광고가 떠 있는 동안 온 두 번째 요청은 취소로 답하고 광고를 또 띄우지 않는다", async () => {
    setPointsAdsAdapter(adapter);
    let close: (status: "rewarded") => void = () => {};
    adapter.show.mockReturnValue(new Promise((resolve) => (close = resolve)));

    const first = showPointsAd();
    await Promise.resolve();
    await Promise.resolve();
    expect(await showPointsAd()).toBe("cancelled");
    close("rewarded");
    expect(await first).toBe("rewarded");
    expect(adapter.show).toHaveBeenCalledTimes(1);

    adapter.show.mockResolvedValue("rewarded");
    expect(await showPointsAd()).toBe("rewarded");
  });
});

describe("points-ad-show 메시지 파싱", () => {
  it("id가 있는 요청만 받는다", () => {
    expect(
      parseToNativeMessage(JSON.stringify({ type: "points-ad-show", id: "a1", atMs: 1 })),
    ).toEqual({
      type: "points-ad-show",
      id: "a1",
      atMs: 1,
    });
    expect(
      parseToNativeMessage(JSON.stringify({ type: "points-ad-show", id: "", atMs: 1 })),
    ).toBeNull();
    expect(parseToNativeMessage(JSON.stringify({ type: "points-ad-show", atMs: 1 }))).toBeNull();
  });
});
