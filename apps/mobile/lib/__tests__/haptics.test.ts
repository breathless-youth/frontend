import * as Haptics from "expo-haptics";
import { waitFor } from "@testing-library/react-native";
import { Platform, Vibration } from "react-native";

import { triggerHaptic, triggerTabHaptic } from "../haptics";

jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy", Rigid: "rigid" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
  AndroidHaptics: { Segment_Frequent_Tick: "segment-frequent-tick" },
  performAndroidHapticsAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  (Haptics.impactAsync as jest.Mock).mockClear();
  (Haptics.notificationAsync as jest.Mock).mockClear();
});

describe("triggerHaptic", () => {
  afterEach(() => {
    expect(Haptics.performAndroidHapticsAsync).not.toHaveBeenCalled();
  });

  it.each(["android", "ios"] as const)(
    "%s의 탭 외 light는 기존 Light 임팩트를 유지한다",
    async (os) => {
      jest.replaceProperty(Platform, "OS", os);
      const vibrate = jest.spyOn(Vibration, "vibrate").mockImplementation(() => {});

      triggerHaptic("light");

      await waitFor(() =>
        expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light),
      );
      expect(vibrate).not.toHaveBeenCalled();
    },
  );

  it.each(["android", "ios"] as const)(
    "%s의 탭 외 medium은 기존 Medium 임팩트를 유지한다",
    async (os) => {
      jest.replaceProperty(Platform, "OS", os);
      const vibrate = jest.spyOn(Vibration, "vibrate").mockImplementation(() => {});

      triggerHaptic("medium");

      await waitFor(() =>
        expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Medium),
      );
      expect(vibrate).not.toHaveBeenCalled();
    },
  );

  it.each(["android", "ios"] as const)(
    "%s에서 임팩트가 실패하면 기존 10ms 진동으로 폴백한다",
    async (os) => {
      jest.replaceProperty(Platform, "OS", os);
      const vibrate = jest.spyOn(Vibration, "vibrate").mockImplementation(() => {});
      (Haptics.impactAsync as jest.Mock).mockRejectedValueOnce(new Error("Haptics unavailable"));

      triggerHaptic("light");

      await waitFor(() => expect(vibrate).toHaveBeenCalledWith(10));
      expect(vibrate).toHaveBeenCalledTimes(1);
    },
  );

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

describe("triggerTabHaptic", () => {
  it("Android 탭은 가장 부드러운 시스템 틱을 한 번 내고 진동이나 임팩트를 겹치지 않는다", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    const vibrate = jest.spyOn(Vibration, "vibrate").mockImplementation(() => {});

    triggerTabHaptic();

    await waitFor(() =>
      expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledWith(
        Haptics.AndroidHaptics.Segment_Frequent_Tick,
      ),
    );
    expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledTimes(1);
    expect(vibrate).not.toHaveBeenCalled();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it.each(["reject", "throw"] as const)(
    "Android 시스템 틱 호출이 %s하면 10ms 진동으로 한 번 폴백한다",
    async (failure) => {
      jest.replaceProperty(Platform, "OS", "android");
      const vibrate = jest.spyOn(Vibration, "vibrate").mockImplementation(() => {});
      const performHaptics = Haptics.performAndroidHapticsAsync as jest.Mock;
      const error = new Error("Android haptics unavailable");
      if (failure === "reject") {
        performHaptics.mockRejectedValueOnce(error);
      } else {
        performHaptics.mockImplementationOnce(() => {
          throw error;
        });
      }

      triggerTabHaptic();

      await waitFor(() => expect(vibrate).toHaveBeenCalledWith(10));
      expect(vibrate).toHaveBeenCalledTimes(1);
      expect(performHaptics).toHaveBeenCalledTimes(1);
      expect(Haptics.impactAsync).not.toHaveBeenCalled();
      expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    },
  );

  it("iOS에서는 기존 Light 임팩트를 유지한다", async () => {
    jest.replaceProperty(Platform, "OS", "ios");
    const vibrate = jest.spyOn(Vibration, "vibrate").mockImplementation(() => {});

    triggerTabHaptic();

    await waitFor(() =>
      expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light),
    );
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.performAndroidHapticsAsync).not.toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();
  });
});
