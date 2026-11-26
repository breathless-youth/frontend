import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { cancelRestNotification, scheduleRestNotification } from "../restNotification";

jest.mock("expo-notifications", () => ({
  SchedulableTriggerInputTypes: { DATE: "date" },
  AndroidImportance: { HIGH: 4 },
  setNotificationChannelAsync: jest.fn(async () => null),
  scheduleNotificationAsync: jest.fn(async () => "rest"),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
}));

describe("restNotification", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("같은 id로 날짜 트리거 로컬 알림을 예약하고 Android는 휴식 채널을 쓴다", async () => {
    Platform.OS = "android";
    await scheduleRestNotification({
      id: "rest",
      fireAtMs: 1_800_000_000_000,
      title: "5분 휴식이 끝났어요",
      body: "다시 공부를 시작할 시간이에요",
    });

    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      "rest",
      expect.objectContaining({ importance: Notifications.AndroidImportance.HIGH }),
    );
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("rest");
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      identifier: "rest",
      content: { title: "5분 휴식이 끝났어요", body: "다시 공부를 시작할 시간이에요" },
      trigger: { type: "date", date: 1_800_000_000_000, channelId: "rest" },
    });
  });

  it("취소는 같은 id의 예약을 거둔다", async () => {
    await cancelRestNotification("rest");

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("rest");
  });

  it("채널을 만드는 사이 들어온 취소는 예약이 끝난 뒤에 처리해 알림이 남지 않는다", async () => {
    Platform.OS = "android";
    let releaseChannel: () => void = () => undefined;
    const channelCreated = new Promise<null>((resolve) => {
      releaseChannel = () => resolve(null);
    });
    jest
      .mocked(Notifications.setNotificationChannelAsync)
      .mockImplementationOnce(() => channelCreated);
    const order: string[] = [];
    jest.mocked(Notifications.scheduleNotificationAsync).mockImplementationOnce(async () => {
      order.push("schedule");
      return "rest";
    });
    jest.mocked(Notifications.cancelScheduledNotificationAsync).mockImplementation(async () => {
      order.push("cancel");
    });

    const scheduled = scheduleRestNotification({ id: "rest", fireAtMs: 1, title: "t", body: "b" });
    const cancelled = cancelRestNotification("rest");
    releaseChannel();
    await Promise.all([scheduled, cancelled]);

    expect(order.at(-1)).toBe("cancel");
    expect(order.indexOf("schedule")).toBeLessThan(order.lastIndexOf("cancel"));
  });

  it("앞의 예약이 실패해도 다음 요청은 처리한다", async () => {
    jest.mocked(Notifications.scheduleNotificationAsync).mockRejectedValueOnce(new Error("boom"));

    await expect(
      scheduleRestNotification({ id: "rest", fireAtMs: 1, title: "t", body: "b" }),
    ).rejects.toThrow("boom");
    await cancelRestNotification("rest");

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenLastCalledWith("rest");
  });
});
