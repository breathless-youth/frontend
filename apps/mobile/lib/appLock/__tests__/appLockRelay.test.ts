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
    await handleAppLockMessage({ type: "app-lock-query", id: "q1", atMs: 1 }, reply);
    expect(reply).toHaveBeenCalledWith({
      type: "app-lock-state",
      id: "q1",
      ...STATE,
      atMs: expect.any(Number),
    });
  });

  it("authorize에 권한 요청 결과로 답한다", async () => {
    const reply = jest.fn();
    await handleAppLockMessage({ type: "app-lock-authorize", id: "a1", atMs: 1 }, reply);
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ type: "app-lock-state", id: "a1", authorized: false }),
    );
  });

  it("권한 창이 떠 있는 동안에도 query에 바로 답한다", async () => {
    (authorizeAppLock as jest.Mock).mockReturnValue(new Promise(() => undefined));
    void handleAppLockMessage({ type: "app-lock-authorize", id: "a1", atMs: 1 }, jest.fn());
    const reply = jest.fn();
    await handleAppLockMessage({ type: "app-lock-query", id: "q1", atMs: 2 }, reply);
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ id: "q1" }));
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
    await handleAppLockMessage({ type: "app-lock-pick", id: "p1", atMs: 1 }, reply);
    expect(router.push).toHaveBeenCalledWith("/app-lock-picker");
    expect(reply).not.toHaveBeenCalled();

    await notifyPickerClosed("selection");
    expect(saveSelection).toHaveBeenCalledWith("selection");
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ type: "app-lock-state", id: "p1", appCount: 5 }),
    );

    await notifyPickerClosed("selection");
    expect(reply).toHaveBeenCalledTimes(1);
  });

  it("고르지 않고 닫으면 저장하지 않고 지금 상태를 보낸다", async () => {
    const reply = jest.fn();
    await handleAppLockMessage({ type: "app-lock-pick", id: "p1", atMs: 1 }, reply);
    await notifyPickerClosed(undefined);
    expect(saveSelection).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ appCount: 2 }));
  });

  it("다 지우고 닫으면 선택을 지운 상태를 보낸다", async () => {
    (saveSelection as jest.Mock).mockResolvedValue({ ...STATE, appCount: 0, categoryCount: 0 });
    const reply = jest.fn();
    await handleAppLockMessage({ type: "app-lock-pick", id: "p1", atMs: 1 }, reply);
    await notifyPickerClosed(null);
    expect(saveSelection).toHaveBeenCalledWith(null);
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ type: "app-lock-state", appCount: 0, categoryCount: 0 }),
    );
  });

  it("지원하지 않는 기기에서 pick은 화면 없이 바로 상태로 답한다", async () => {
    (isAppLockSupported as jest.Mock).mockReturnValue(false);
    const reply = jest.fn();
    await handleAppLockMessage({ type: "app-lock-pick", id: "p1", atMs: 1 }, reply);
    expect(router.push).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ type: "app-lock-state" }));
  });

  it("고르기 화면을 열지 못하면 바로 지금 상태로 답하고 다음 pick은 다시 연다", async () => {
    (router.push as jest.Mock).mockImplementationOnce(() => {
      throw new Error("navigation");
    });
    const reply = jest.fn();
    await expect(
      handleAppLockMessage({ type: "app-lock-pick", id: "p1", atMs: 1 }, reply),
    ).rejects.toThrow("navigation");
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ type: "app-lock-state", id: "p1", appCount: 2 }),
    );

    await notifyPickerClosed("selection");
    expect(reply).toHaveBeenCalledTimes(1);

    await handleAppLockMessage({ type: "app-lock-pick", id: "p2", atMs: 2 }, reply);
    expect(router.push).toHaveBeenCalledTimes(2);
    await notifyPickerClosed(undefined);
  });

  it("고르기 화면이 열려 있으면 새 pick은 바로 지금 상태로 답하고 먼저 연 요청에 답한다", async () => {
    const first = jest.fn();
    const second = jest.fn();
    await handleAppLockMessage({ type: "app-lock-pick", id: "p1", atMs: 1 }, first);
    await handleAppLockMessage({ type: "app-lock-pick", id: "p2", atMs: 2 }, second);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith(
      expect.objectContaining({ type: "app-lock-state", id: "p2", appCount: 2 }),
    );

    await notifyPickerClosed("selection");
    expect(first).toHaveBeenCalledWith(
      expect.objectContaining({ type: "app-lock-state", id: "p1", appCount: 5 }),
    );
    expect(second).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["저장", "selection", saveSelection],
    ["조회", undefined, getAppLockState],
  ] as const)(
    "닫힌 뒤 %s에 실패해도 그 요청에 대체 상태로 답하고 실패를 넘기지 않는다",
    async (_label, selection, failing) => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
      const reply = jest.fn();
      await handleAppLockMessage({ type: "app-lock-pick", id: "p1", atMs: 1 }, reply);
      (failing as jest.Mock).mockRejectedValueOnce(new Error("native"));

      await expect(notifyPickerClosed(selection)).resolves.toBeUndefined();
      expect(reply).toHaveBeenCalledWith({
        type: "app-lock-state",
        id: "p1",
        supported: true,
        authorized: false,
        revoked: false,
        appCount: 0,
        categoryCount: 0,
        atMs: expect.any(Number),
      });
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    },
  );

  it("고르기 화면이 열려 있을 때 새 pick의 조회가 실패해도 그 요청에 대체 상태로 답한다", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    await handleAppLockMessage({ type: "app-lock-pick", id: "p1", atMs: 1 }, jest.fn());
    (getAppLockState as jest.Mock).mockRejectedValueOnce(new Error("native"));
    const second = jest.fn();

    await handleAppLockMessage({ type: "app-lock-pick", id: "p2", atMs: 2 }, second);
    expect(second).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p2", supported: true, authorized: false, appCount: 0 }),
    );
    await notifyPickerClosed(undefined);
    warn.mockRestore();
  });

  it("고르기 화면을 열지 못하고 조회도 실패하면 그 요청에 대체 상태로 답한다", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    (router.push as jest.Mock).mockImplementationOnce(() => {
      throw new Error("navigation");
    });
    (getAppLockState as jest.Mock).mockRejectedValueOnce(new Error("native"));
    const reply = jest.fn();

    await expect(
      handleAppLockMessage({ type: "app-lock-pick", id: "p1", atMs: 1 }, reply),
    ).rejects.toThrow("navigation");
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p1", supported: true, authorized: false, appCount: 0 }),
    );
    warn.mockRestore();
  });
});
