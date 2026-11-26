import { Alert, AppState, Platform } from "react-native";

import type * as RestNotification from "../restNotification";

jest.mock("expo-notifications", () => ({
  SchedulableTriggerInputTypes: { DATE: "date" },
  AndroidImportance: { HIGH: 4 },
  setNotificationChannelAsync: jest.fn(async () => null),
  scheduleNotificationAsync: jest.fn(async () => "rest"),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
}));

const mockNative = {
  canScheduleExactAlarms: jest.fn(() => false),
  openExactAlarmSettings: jest.fn(),
};
jest.mock("../../modules/app-lock", () => ({ appLockNative: mockNative }));

type AlertButtons = { text: string; onPress?: () => void }[];

const request = {
  id: "rest",
  fireAtMs: Date.now() + 5 * 60_000,
  title: "5분 휴식이 끝났어요",
  body: "다시 공부를 시작할 시간이에요",
};

// 묻는 횟수가 모듈에 남으므로 테스트마다 새로 불러온다.
function load(): typeof RestNotification {
  let loaded: typeof RestNotification | undefined;
  jest.isolateModules(() => {
    loaded = jest.requireActual<typeof RestNotification>("../restNotification");
  });
  return loaded as typeof RestNotification;
}

function scheduled() {
  // isolateModules 안의 require는 같은 jest.mock 인스턴스를 받는다.
  return jest.requireMock<{ scheduleNotificationAsync: jest.Mock }>("expo-notifications")
    .scheduleNotificationAsync;
}

describe("휴식 알림 정확한 알람 허용 묻기", () => {
  let alert: jest.SpyInstance;
  let appStateListener: ((state: string) => void) | undefined;
  const remove = jest.fn();

  beforeEach(() => {
    Platform.OS = "android";
    mockNative.canScheduleExactAlarms.mockReturnValue(false);
    alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
      appStateListener = listener as (state: string) => void;
      return { remove } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    appStateListener = undefined;
  });

  it("허용 안 된 Android에서 휴식 알림을 고르면 앱을 켠 뒤 한 번만 묻는다", async () => {
    const { scheduleRestNotification } = load();
    await scheduleRestNotification(request);
    await scheduleRestNotification(request);

    expect(alert).toHaveBeenCalledTimes(1);
  });

  it("이미 허용됐거나 iOS면 묻지 않는다", async () => {
    mockNative.canScheduleExactAlarms.mockReturnValue(true);
    await load().scheduleRestNotification(request);
    Platform.OS = "ios";
    mockNative.canScheduleExactAlarms.mockReturnValue(false);
    await load().scheduleRestNotification(request);

    expect(alert).not.toHaveBeenCalled();
  });

  it("설정을 열고 허용한 뒤 돌아오면 같은 알림을 다시 예약한다", async () => {
    const { scheduleRestNotification } = load();
    await scheduleRestNotification(request);
    const buttons = alert.mock.calls[0][2] as AlertButtons;
    buttons[1].onPress?.();
    expect(mockNative.openExactAlarmSettings).toHaveBeenCalledTimes(1);

    mockNative.canScheduleExactAlarms.mockReturnValue(true);
    appStateListener?.("active");
    await new Promise((resolve) => setImmediate(resolve));

    expect(remove).toHaveBeenCalled();
    expect(scheduled()).toHaveBeenCalledTimes(2);
  });

  it("허용하지 않고 돌아오거나 그사이 휴식 알림을 껐으면 다시 예약하지 않는다", async () => {
    const { scheduleRestNotification, cancelRestNotification } = load();
    await scheduleRestNotification(request);
    (alert.mock.calls[0][2] as AlertButtons)[1].onPress?.();

    appStateListener?.("active");
    await new Promise((resolve) => setImmediate(resolve));
    expect(scheduled()).toHaveBeenCalledTimes(1);

    await scheduleRestNotification(request);
    await cancelRestNotification("rest");
    mockNative.canScheduleExactAlarms.mockReturnValue(true);
    appStateListener?.("active");
    await new Promise((resolve) => setImmediate(resolve));
    expect(scheduled()).toHaveBeenCalledTimes(2);
  });
});
