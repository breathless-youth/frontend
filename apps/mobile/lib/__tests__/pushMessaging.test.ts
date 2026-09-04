import * as pushMessaging from "../pushMessaging";
import type { PushMessagingAdapter } from "../pushMessaging";

const mockMessagingInstance = {};
const mockHasPermission = jest.fn();
const mockRequestPermission = jest.fn();
const mockGetToken = jest.fn();
const mockOnTokenRefresh = jest.fn();
const mockRegister = jest.fn();
const mockGetApnsToken = jest.fn();
const mockOnMessage = jest.fn();
const mockOnNotificationOpenedApp = jest.fn();
const mockGetInitialNotification = jest.fn();
const mockSetBackgroundMessageHandler = jest.fn();

jest.mock("@react-native-firebase/messaging", () => ({
  AuthorizationStatus: {
    NOT_DETERMINED: -1,
    DENIED: 0,
    AUTHORIZED: 1,
    PROVISIONAL: 2,
    EPHEMERAL: 3,
  },
  getMessaging: () => mockMessagingInstance,
  hasPermission: (...args: unknown[]) => mockHasPermission(...args) as Promise<number>,
  requestPermission: (...args: unknown[]) => mockRequestPermission(...args) as Promise<number>,
  getToken: (...args: unknown[]) => mockGetToken(...args) as Promise<string>,
  onTokenRefresh: (...args: unknown[]) => mockOnTokenRefresh(...args) as () => void,
  registerDeviceForRemoteMessages: (...args: unknown[]) => mockRegister(...args) as Promise<void>,
  getAPNSToken: (...args: unknown[]) => mockGetApnsToken(...args) as Promise<string | null>,
  onMessage: (...args: unknown[]) => mockOnMessage(...args) as () => void,
  onNotificationOpenedApp: (...args: unknown[]) =>
    mockOnNotificationOpenedApp(...args) as () => void,
  getInitialNotification: (...args: unknown[]) =>
    mockGetInitialNotification(...args) as Promise<unknown>,
  setBackgroundMessageHandler: (...args: unknown[]) => mockSetBackgroundMessageHandler(...args),
}));

describe("pushMessaging 어댑터 (BY-585)", () => {
  beforeEach(() => {
    mockHasPermission.mockReset();
    mockRequestPermission.mockReset();
    mockGetToken.mockReset();
    mockOnTokenRefresh.mockReset();
    mockRegister.mockReset().mockResolvedValue(undefined);
    mockGetApnsToken.mockReset().mockResolvedValue(null);
    mockOnMessage.mockReset().mockReturnValue(jest.fn());
    mockOnNotificationOpenedApp.mockReset().mockReturnValue(jest.fn());
    mockGetInitialNotification.mockReset().mockResolvedValue(null);
    mockSetBackgroundMessageHandler.mockReset();
    pushMessaging.setPushMessagingAdapter(pushMessaging.rnfbPushMessagingAdapter);
  });

  it.each([
    [-1, "undetermined"],
    [0, "denied"],
    [1, "granted"],
    [2, "granted"],
    [3, "granted"],
    [99, "undetermined"],
  ])("AuthorizationStatus %i → %s", (status, expected) => {
    expect(pushMessaging.toPushPermissionStatus(status)).toBe(expected);
  });

  it("권한 조회·요청은 RNFB 결과를 3단 상태로 좁혀 돌려준다", async () => {
    mockHasPermission.mockResolvedValue(-1);
    mockRequestPermission.mockResolvedValue(1);

    await expect(pushMessaging.getPushPermissionStatus()).resolves.toBe("undetermined");
    await expect(pushMessaging.requestPushPermission()).resolves.toBe("granted");
    expect(mockHasPermission).toHaveBeenCalledWith(mockMessagingInstance);
    expect(mockRequestPermission).toHaveBeenCalledWith(mockMessagingInstance);
  });

  it("APNs 토큰이 이미 있으면 다시 등록하지 않고 바로 FCM 토큰을 받는다", async () => {
    mockGetApnsToken.mockResolvedValue("apns-hex");
    mockGetToken.mockResolvedValue("fcm-token");

    await expect(pushMessaging.getPushToken()).resolves.toBe("fcm-token");

    expect(mockRegister).not.toHaveBeenCalled();
    expect(mockGetToken).toHaveBeenCalledWith(mockMessagingInstance);
  });

  it("APNs 토큰이 없으면 등록해 도착을 기다린 뒤 FCM 토큰을 받는다", async () => {
    mockGetApnsToken
      .mockRejectedValueOnce(new Error("[messaging/unregistered]"))
      .mockResolvedValueOnce("apns-hex");
    mockGetToken.mockResolvedValue("fcm-token");

    await expect(pushMessaging.getPushToken()).resolves.toBe("fcm-token");

    expect(mockRegister).toHaveBeenCalledWith(mockMessagingInstance);
    expect(mockRegister.mock.invocationCallOrder[0]).toBeLessThan(
      mockGetToken.mock.invocationCallOrder[0] as number,
    );
  });

  it("등록 후에도 APNs 토큰이 없거나 등록이 실패하면 null을 돌려준다", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockGetApnsToken.mockResolvedValue(null);
    await expect(pushMessaging.getPushToken()).resolves.toBeNull();
    expect(mockGetToken).not.toHaveBeenCalled();

    mockRegister.mockRejectedValueOnce(new Error("[messaging/registration-timeout]"));
    await expect(pushMessaging.getPushToken()).resolves.toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("토큰이 빈 문자열이면 null로 돌려준다 (시뮬레이터 등 발급 불가)", async () => {
    mockGetApnsToken.mockResolvedValue("apns-hex");
    mockGetToken.mockResolvedValueOnce("fcm-token").mockResolvedValueOnce("");

    await expect(pushMessaging.getPushToken()).resolves.toBe("fcm-token");
    await expect(pushMessaging.getPushToken()).resolves.toBeNull();
  });

  it("APNs 토큰은 없으면 null, 있으면 그대로 돌려준다", async () => {
    mockGetApnsToken.mockResolvedValueOnce(null).mockResolvedValueOnce("apns-hex");

    await expect(pushMessaging.getApnsToken()).resolves.toBeNull();
    await expect(pushMessaging.getApnsToken()).resolves.toBe("apns-hex");
  });

  it("토큰 갱신 구독은 리스너를 넘기고 해제 함수를 그대로 돌려준다", () => {
    const unsubscribe = jest.fn();
    mockOnTokenRefresh.mockReturnValue(unsubscribe);
    const listener = jest.fn();

    expect(pushMessaging.onPushTokenRefresh(listener)).toBe(unsubscribe);
    expect(mockOnTokenRefresh).toHaveBeenCalledWith(mockMessagingInstance, listener);
  });

  it("setPushMessagingAdapter로 교체한 어댑터가 공개 함수에 그대로 반영된다", async () => {
    const fake: PushMessagingAdapter = {
      getPermissionStatus: jest.fn(() => Promise.resolve("denied" as const)),
      requestPermission: jest.fn(() => Promise.resolve("denied" as const)),
      getToken: jest.fn(() => Promise.resolve(null)),
      getApnsToken: jest.fn(() => Promise.resolve(null)),
      onTokenRefresh: jest.fn(() => () => {}),
      onMessage: jest.fn(() => () => {}),
      onNotificationOpened: jest.fn(() => () => {}),
      getInitialNotification: jest.fn(() => Promise.resolve(null)),
      setBackgroundHandler: jest.fn(),
    };
    pushMessaging.setPushMessagingAdapter(fake);

    await expect(pushMessaging.getPushPermissionStatus()).resolves.toBe("denied");
    await expect(pushMessaging.getPushToken()).resolves.toBeNull();
    expect(mockHasPermission).not.toHaveBeenCalled();
    expect(mockGetToken).not.toHaveBeenCalled();
  });
});

describe("pushMessaging 메시지 핸들러 (BY-586)", () => {
  beforeEach(() => {
    mockOnMessage.mockReset().mockReturnValue(jest.fn());
    mockOnNotificationOpenedApp.mockReset().mockReturnValue(jest.fn());
    mockGetInitialNotification.mockReset().mockResolvedValue(null);
    mockSetBackgroundMessageHandler.mockReset();
    // 위 describe의 마지막 테스트가 가짜 어댑터를 꽂아 두므로 RNFB 어댑터로 되돌린다.
    pushMessaging.setPushMessagingAdapter(pushMessaging.rnfbPushMessagingAdapter);
  });

  const remote = {
    messageId: "m1",
    data: { link: "focusmakers://social", nested: { a: 1 }, count: "3" },
    notification: { title: "제목", body: "본문", android: { channelId: "x" } },
  };

  it("toPushMessage는 data의 문자열 값만 남기고 notification을 title/body로 좁힌다", () => {
    expect(pushMessaging.toPushMessage(remote)).toEqual({
      messageId: "m1",
      data: { link: "focusmakers://social", count: "3" },
      notification: { title: "제목", body: "본문" },
    });
    expect(pushMessaging.toPushMessage({})).toEqual({
      messageId: null,
      data: {},
      notification: null,
    });
  });

  it("포그라운드·알림 탭 구독은 RNFB 메시지를 PushMessage로 바꿔 넘기고 해제 함수를 돌려준다", () => {
    const unsubscribe = jest.fn();
    mockOnMessage.mockReturnValue(unsubscribe);
    mockOnNotificationOpenedApp.mockReturnValue(unsubscribe);
    const onMessage = jest.fn();
    const onOpened = jest.fn();

    expect(pushMessaging.onPushMessage(onMessage)).toBe(unsubscribe);
    expect(pushMessaging.onPushNotificationOpened(onOpened)).toBe(unsubscribe);

    (mockOnMessage.mock.calls[0][1] as (m: unknown) => void)(remote);
    (mockOnNotificationOpenedApp.mock.calls[0][1] as (m: unknown) => void)(remote);
    expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ messageId: "m1" }));
    expect(onOpened).toHaveBeenCalledWith(expect.objectContaining({ messageId: "m1" }));
  });

  it("초기 알림은 있으면 PushMessage, 없으면 null", async () => {
    mockGetInitialNotification.mockResolvedValue(remote);
    await expect(pushMessaging.getInitialPushNotification()).resolves.toMatchObject({
      messageId: "m1",
    });

    mockGetInitialNotification.mockResolvedValue(null);
    await expect(pushMessaging.getInitialPushNotification()).resolves.toBeNull();
  });

  it("백그라운드 핸들러는 RNFB에 등록하고 PushMessage로 바꿔 부른다", async () => {
    const handler = jest.fn(() => Promise.resolve());

    pushMessaging.setPushBackgroundHandler(handler);

    expect(mockSetBackgroundMessageHandler).toHaveBeenCalledWith(
      mockMessagingInstance,
      expect.any(Function),
    );
    await (mockSetBackgroundMessageHandler.mock.calls[0][1] as (m: unknown) => Promise<void>)(
      remote,
    );
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ messageId: "m1" }));
  });
});
