import { router } from "expo-router";

import {
  authorizeAppLock,
  getAppLockState,
  isAppLockSupported,
  saveSelection,
  startStudyLock,
  stopStudyLock,
} from "../appLock";
import { handleAppLockMessage, notifyPickerClosed } from "../appLockRelay";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("../appLock", () => ({
  authorizeAppLock: jest.fn(),
  getAppLockState: jest.fn(),
  isAppLockSupported: jest.fn(),
  saveSelection: jest.fn(),
  startStudyLock: jest.fn(),
  stopStudyLock: jest.fn(),
}));

const STATE = {
  supported: true,
  authorized: true,
  revoked: false,
  appCount: 2,
  categoryCount: 1,
};

beforeEach(() => {
  jest.clearAllMocks();
  (getAppLockState as jest.Mock).mockResolvedValue(STATE);
  (authorizeAppLock as jest.Mock).mockResolvedValue({ ...STATE, authorized: false });
  (saveSelection as jest.Mock).mockResolvedValue({ ...STATE, appCount: 5 });
  (isAppLockSupported as jest.Mock).mockReturnValue(true);
  (startStudyLock as jest.Mock).mockResolvedValue({ appCount: 2, categoryCount: 1 });
  (stopStudyLock as jest.Mock).mockResolvedValue(undefined);
});

describe("handleAppLockMessage", () => {
  it("query에 현재 상태로 답한다", async () => {
    const reply = jest.fn();
    await handleAppLockMessage({ type: "app-lock-query", atMs: 1 }, reply);
    expect(reply).toHaveBeenCalledWith({
      type: "app-lock-state",
      ...STATE,
      atMs: expect.any(Number),
    });
  });

  it("authorize에 권한 요청 결과로 답한다", async () => {
    const reply = jest.fn();
    await handleAppLockMessage({ type: "app-lock-authorize", atMs: 1 }, reply);
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ type: "app-lock-state", authorized: false }),
    );
  });

  it("start로 잠갔으면 개수를 알린다", async () => {
    const reply = jest.fn();
    await handleAppLockMessage({ type: "app-lock-start", atMs: 1 }, reply);
    expect(reply).toHaveBeenCalledWith({
      type: "app-lock-started",
      appCount: 2,
      categoryCount: 1,
      atMs: expect.any(Number),
    });
  });

  it("start로 잠그지 않았으면 아무것도 보내지 않는다", async () => {
    (startStudyLock as jest.Mock).mockResolvedValue(null);
    const reply = jest.fn();
    await handleAppLockMessage({ type: "app-lock-start", atMs: 1 }, reply);
    expect(reply).not.toHaveBeenCalled();
  });

  it("stop은 잠금을 풀고 답하지 않는다", async () => {
    const reply = jest.fn();
    await handleAppLockMessage({ type: "app-lock-stop", atMs: 1 }, reply);
    expect(stopStudyLock).toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();
  });

  it("pick은 고르기 화면을 열고, 닫히면 저장한 뒤 그 문서에 상태를 보낸다", async () => {
    const reply = jest.fn();
    await handleAppLockMessage({ type: "app-lock-pick", atMs: 1 }, reply);
    expect(router.push).toHaveBeenCalledWith("/app-lock-picker");
    expect(reply).not.toHaveBeenCalled();

    await notifyPickerClosed("selection");
    expect(saveSelection).toHaveBeenCalledWith("selection");
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ type: "app-lock-state", appCount: 5 }),
    );

    await notifyPickerClosed("selection");
    expect(reply).toHaveBeenCalledTimes(1);
  });

  it("고르지 않고 닫으면 저장하지 않고 지금 상태를 보낸다", async () => {
    const reply = jest.fn();
    await handleAppLockMessage({ type: "app-lock-pick", atMs: 1 }, reply);
    await notifyPickerClosed(undefined);
    expect(saveSelection).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ appCount: 2 }));
  });

  it("다 지우고 닫으면 선택을 지운 상태를 보낸다", async () => {
    (saveSelection as jest.Mock).mockResolvedValue({ ...STATE, appCount: 0, categoryCount: 0 });
    const reply = jest.fn();
    await handleAppLockMessage({ type: "app-lock-pick", atMs: 1 }, reply);
    await notifyPickerClosed(null);
    expect(saveSelection).toHaveBeenCalledWith(null);
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ type: "app-lock-state", appCount: 0, categoryCount: 0 }),
    );
  });

  it("지원하지 않는 기기에서 pick은 화면 없이 바로 상태로 답한다", async () => {
    (isAppLockSupported as jest.Mock).mockReturnValue(false);
    const reply = jest.fn();
    await handleAppLockMessage({ type: "app-lock-pick", atMs: 1 }, reply);
    expect(router.push).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ type: "app-lock-state" }));
  });
});
