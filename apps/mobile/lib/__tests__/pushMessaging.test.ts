import * as pushMessaging from "../pushMessaging";
import type { PushMessagingAdapter } from "../pushMessaging";

const mockMessagingInstance = {};
const mockHasPermission = jest.fn();
const mockRequestPermission = jest.fn();
const mockGetToken = jest.fn();
const mockOnTokenRefresh = jest.fn();
const mockIsRegistered = jest.fn();
const mockRegister = jest.fn();

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
  isDeviceRegisteredForRemoteMessages: (...args: unknown[]) => mockIsRegistered(...args) as boolean,
  registerDeviceForRemoteMessages: (...args: unknown[]) => mockRegister(...args) as Promise<void>,
}));

describe("pushMessaging 어댑터 (BY-585)", () => {
  beforeEach(() => {
    mockHasPermission.mockReset();
    mockRequestPermission.mockReset();
    mockGetToken.mockReset();
    mockOnTokenRefresh.mockReset();
    mockIsRegistered.mockReset().mockReturnValue(true);
    mockRegister.mockReset().mockResolvedValue(undefined);
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

  it("원격 메시지 미등록 상태면 getToken 전에 등록부터 한다 (iOS [messaging/unregistered] 방지)", async () => {
    mockIsRegistered.mockReturnValue(false);
    mockGetToken.mockResolvedValue("fcm-token");

    await expect(pushMessaging.getPushToken()).resolves.toBe("fcm-token");

    expect(mockRegister).toHaveBeenCalledWith(mockMessagingInstance);
    expect(mockRegister.mock.invocationCallOrder[0]).toBeLessThan(
      mockGetToken.mock.invocationCallOrder[0] as number,
    );
  });

  it("이미 등록돼 있으면 다시 등록하지 않는다", async () => {
    mockIsRegistered.mockReturnValue(true);
    mockGetToken.mockResolvedValue("fcm-token");

    await pushMessaging.getPushToken();

    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("토큰이 빈 문자열이면 null로 돌려준다 (시뮬레이터 등 발급 불가)", async () => {
    mockGetToken.mockResolvedValueOnce("fcm-token").mockResolvedValueOnce("");

    await expect(pushMessaging.getPushToken()).resolves.toBe("fcm-token");
    await expect(pushMessaging.getPushToken()).resolves.toBeNull();
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
      onTokenRefresh: jest.fn(() => () => {}),
    };
    pushMessaging.setPushMessagingAdapter(fake);

    await expect(pushMessaging.getPushPermissionStatus()).resolves.toBe("denied");
    await expect(pushMessaging.getPushToken()).resolves.toBeNull();
    expect(mockHasPermission).not.toHaveBeenCalled();
    expect(mockGetToken).not.toHaveBeenCalled();
  });
});
