import { getAnalytics, setUserProperties, setUserProperty } from "@react-native-firebase/analytics";

import { rnfbFirebaseAnalyticsAdapter } from "../firebaseAnalyticsSdk";

jest.mock("@react-native-firebase/analytics", () => ({
  getAnalytics: jest.fn(() => "analytics-instance"),
  logEvent: jest.fn(),
  setUserId: jest.fn(async () => undefined),
  setUserProperties: jest.fn(async () => undefined),
  setUserProperty: jest.fn(async () => undefined),
}));
jest.mock("../auth", () => ({
  ensureAuth: jest.fn(async () => null),
  subscribeAuth: jest.fn(() => () => undefined),
}));

const mockedSetUserProperties = jest.mocked(setUserProperties);
const mockedSetUserProperty = jest.mocked(setUserProperty);

describe("rnfbFirebaseAnalyticsAdapter.setUserProperties", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("문자열은 한 번에 보내고 null(지움)은 키마다 setUserProperty로 따로 보낸다", async () => {
    await rnfbFirebaseAnalyticsAdapter.setUserProperties({
      has_dday: "true",
      streak_days: "3",
      initial_gclid: null,
      dday_days_left: null,
    });

    expect(getAnalytics).toHaveBeenCalled();
    expect(mockedSetUserProperties).toHaveBeenCalledTimes(1);
    expect(mockedSetUserProperties).toHaveBeenCalledWith("analytics-instance", {
      has_dday: "true",
      streak_days: "3",
    });
    expect(mockedSetUserProperty).toHaveBeenCalledTimes(2);
    expect(mockedSetUserProperty).toHaveBeenCalledWith("analytics-instance", "initial_gclid", null);
    expect(mockedSetUserProperty).toHaveBeenCalledWith(
      "analytics-instance",
      "dday_days_left",
      null,
    );
  });

  it("null만 있으면 setUserProperties를 부르지 않는다", async () => {
    await rnfbFirebaseAnalyticsAdapter.setUserProperties({ initial_gclid: null });

    expect(mockedSetUserProperties).not.toHaveBeenCalled();
    expect(mockedSetUserProperty).toHaveBeenCalledTimes(1);
  });

  it("키별 호출 하나가 거부되면 어댑터도 거부해 호출처의 경고 경로로 넘긴다", async () => {
    mockedSetUserProperty.mockRejectedValueOnce(new Error("sdk down"));

    await expect(
      rnfbFirebaseAnalyticsAdapter.setUserProperties({ has_dday: "true", initial_gclid: null }),
    ).rejects.toThrow("sdk down");
    expect(mockedSetUserProperties).toHaveBeenCalledTimes(1);
  });

  it("문자열만 있으면 setUserProperty를 부르지 않는다", async () => {
    await rnfbFirebaseAnalyticsAdapter.setUserProperties({ theme: "dark" });

    expect(mockedSetUserProperties).toHaveBeenCalledWith("analytics-instance", { theme: "dark" });
    expect(mockedSetUserProperty).not.toHaveBeenCalled();
  });
});
