import { waitFor } from "@testing-library/react-native";
import { Platform, Vibration } from "react-native";

import { triggerHaptic, triggerTabHaptic } from "../haptics";

jest.mock("expo-haptics", () => {
  throw new Error("ExpoHaptics native module is missing in this Dev Client");
});

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("expo-haptics 없는 개발 빌드", () => {
  it("Android 탭은 네이티브 모듈 없이도 20ms 진동을 한 번 낸다", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    const vibrate = jest.spyOn(Vibration, "vibrate").mockImplementation(() => {});

    triggerTabHaptic();
    await Promise.resolve();

    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith(20);
  });

  it("iOS 탭은 기존 10ms Vibration 폴백을 유지한다", async () => {
    jest.replaceProperty(Platform, "OS", "ios");
    const vibrate = jest.spyOn(Vibration, "vibrate").mockImplementation(() => {});

    triggerTabHaptic();

    await waitFor(() => expect(vibrate).toHaveBeenCalledWith(10));
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it.each(["android", "ios"] as const)(
    "%s의 탭 외 light는 기존 10ms 폴백을 유지한다",
    async (os) => {
      jest.replaceProperty(Platform, "OS", os);
      const vibrate = jest.spyOn(Vibration, "vibrate").mockImplementation(() => {});

      triggerHaptic("light");

      await waitFor(() => expect(vibrate).toHaveBeenCalledWith(10));
      expect(vibrate).toHaveBeenCalledTimes(1);
    },
  );
});
