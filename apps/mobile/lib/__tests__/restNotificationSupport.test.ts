import { requireOptionalNativeModule } from "expo-modules-core";

import { isRestNotificationSupported } from "../restNotification";

jest.mock("expo-modules-core", () => ({
  ...jest.requireActual<Record<string, unknown>>("expo-modules-core"),
  requireOptionalNativeModule: jest.fn(),
}));

const mockedRequireOptional = requireOptionalNativeModule as jest.MockedFunction<
  typeof requireOptionalNativeModule
>;

describe("isRestNotificationSupported", () => {
  it("알림 예약 네이티브 모듈이 있으면 참이다", () => {
    mockedRequireOptional.mockReturnValue({});

    expect(isRestNotificationSupported()).toBe(true);
    expect(mockedRequireOptional).toHaveBeenCalledWith("ExpoNotificationScheduler");
  });

  it("모듈 없이 만든 옛 Dev Client에서는 던지지 않고 거짓이다", () => {
    mockedRequireOptional.mockReturnValue(null);

    expect(isRestNotificationSupported()).toBe(false);
  });
});
