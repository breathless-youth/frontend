import { Platform } from "react-native";

import { readGoogleDeferredDeepLink } from "../googleDeferredLink";

const mockModule: { current: { readDeepLink: jest.Mock } | null } = { current: null };

jest.mock("../../modules/google-deferred-link", () => ({
  get googleDeferredLinkNative() {
    return mockModule.current;
  },
}));

let readDeepLink: jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  readDeepLink = jest.fn().mockReturnValue(null);
  mockModule.current = { readDeepLink };
  jest.replaceProperty(Platform, "OS", "android");
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("readGoogleDeferredDeepLink", () => {
  it("세 번째 시도에서 값이 들어오면 found와 주소를 돌려준다", async () => {
    readDeepLink
      .mockReturnValueOnce(null)
      .mockReturnValueOnce("")
      .mockReturnValueOnce("focusmakers://?fm_ad=g_planner");

    const promise = readGoogleDeferredDeepLink({ attempts: 6, intervalMs: 1000 });
    await jest.advanceTimersByTimeAsync(2000);

    await expect(promise).resolves.toEqual({
      result: "found",
      url: "focusmakers://?fm_ad=g_planner",
    });
    expect(readDeepLink).toHaveBeenCalledTimes(3);
  });

  it("iOS면 모듈을 부르지 않고 unsupported", async () => {
    jest.replaceProperty(Platform, "OS", "ios");

    await expect(readGoogleDeferredDeepLink({ attempts: 3, intervalMs: 500 })).resolves.toEqual({
      result: "unsupported",
    });
    expect(readDeepLink).not.toHaveBeenCalled();
  });

  it("모듈이 없으면 unsupported", async () => {
    mockModule.current = null;

    await expect(readGoogleDeferredDeepLink({ attempts: 3, intervalMs: 500 })).resolves.toEqual({
      result: "unsupported",
    });
  });

  it("끝까지 비어 있으면 attempts번 묻고 empty", async () => {
    const promise = readGoogleDeferredDeepLink({ attempts: 3, intervalMs: 500 });
    await jest.advanceTimersByTimeAsync(1000);

    await expect(promise).resolves.toEqual({ result: "empty" });
    expect(readDeepLink).toHaveBeenCalledTimes(3);
  });

  it("네이티브가 throw하면 다시 묻지 않고 error", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    readDeepLink.mockImplementation(() => {
      throw new Error("prefs");
    });

    await expect(readGoogleDeferredDeepLink({ attempts: 3, intervalMs: 500 })).resolves.toEqual({
      result: "error",
    });
    expect(readDeepLink).toHaveBeenCalledTimes(1);
  });
});
