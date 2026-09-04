import { registerPushBackgroundHandler } from "../pushBackground";
import { setPushBackgroundHandler } from "../pushMessaging";

jest.mock("../pushMessaging", () => ({
  setPushBackgroundHandler: jest.fn(),
}));

const mockedSet = setPushBackgroundHandler as jest.Mock;

describe("registerPushBackgroundHandler (BY-586)", () => {
  beforeEach(() => {
    mockedSet.mockReset();
  });

  it("백그라운드 핸들러를 한 번 등록하고, 핸들러는 메시지를 받아 정상 종료한다(로그만)", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => {});

    registerPushBackgroundHandler();

    expect(mockedSet).toHaveBeenCalledTimes(1);
    const handler = mockedSet.mock.calls[0][0] as (m: unknown) => Promise<void>;
    await expect(
      handler({ messageId: "m1", data: { link: "/social" }, notification: null }),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("background message id=m1"));
    log.mockRestore();
  });

  it("등록이 throw해도 앱을 죽이지 않고 경고만 남긴다", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockedSet.mockImplementation(() => {
      throw new Error("Native module not registered");
    });

    expect(() => registerPushBackgroundHandler()).not.toThrow();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("등록 실패"), expect.any(Error));
    warn.mockRestore();
  });
});
