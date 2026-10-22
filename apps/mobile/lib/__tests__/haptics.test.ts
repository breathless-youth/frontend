import * as Haptics from "expo-haptics";
import { waitFor } from "@testing-library/react-native";
import { Platform } from "react-native";

import { triggerHaptic } from "../haptics";

jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy", Rigid: "rigid" },
  impactAsync: jest.fn(() => Promise.resolve()),
}));

afterEach(() => {
  jest.restoreAllMocks();
  (Haptics.impactAsync as jest.Mock).mockClear();
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
});
