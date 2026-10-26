import * as Haptics from "expo-haptics";
import { waitFor } from "@testing-library/react-native";
import { Platform, Vibration } from "react-native";

import { triggerHaptic } from "../haptics";

jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy", Rigid: "rigid" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
}));

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  (Haptics.impactAsync as jest.Mock).mockClear();
  (Haptics.notificationAsync as jest.Mock).mockClear();
});

describe("triggerHaptic", () => {
  it("iOS에서 heavy는 Rigid로 낸다", async () => {
    jest.replaceProperty(Platform, "OS", "ios");
    triggerHaptic("heavy");
    // expo-haptics를 지연 import하므로 호출이 비동기로 온다.
    await waitFor(() =>
      expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Rigid),
    );
  });

  it("Android에서 heavy는 Heavy로 낸다", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    triggerHaptic("heavy");
    await waitFor(() =>
      expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Heavy),
    );
  });

  it("iOS에서 alert는 시스템 진동 세 번과 같은 박자에 Error 알림 햅틱을 낸다", async () => {
    jest.useFakeTimers();
    jest.replaceProperty(Platform, "OS", "ios");
    const vibrate = jest.spyOn(Vibration, "vibrate").mockImplementation(() => {});

    triggerHaptic("alert");

    expect(vibrate).toHaveBeenCalledWith([0, 600, 600]);
    await jest.advanceTimersByTimeAsync(0);
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Error);
    await jest.advanceTimersByTimeAsync(599);
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(600);
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(3);
    await jest.advanceTimersByTimeAsync(5_000);
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(3);
  });

  it("Android에서 alert는 진동 패턴만 낸다", async () => {
    jest.useFakeTimers();
    jest.replaceProperty(Platform, "OS", "android");
    const vibrate = jest.spyOn(Vibration, "vibrate").mockImplementation(() => {});

    triggerHaptic("alert");
    await jest.advanceTimersByTimeAsync(5_000);

    expect(vibrate).toHaveBeenCalledWith([0, 400, 200, 400, 200, 400]);
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });
});
