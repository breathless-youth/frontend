import type { ForceUpdateDecision } from "../forceUpdate";
import { __resetSessionPresenceForTests, markSessionOpen } from "../sessionPresence";
import {
  checkUpdateOnConnect,
  createReconnectListener,
  RECONNECT_AFTER_BACKGROUND_MS,
} from "../updateOnConnect";

const mockRefresh = jest.fn<Promise<ForceUpdateDecision>, [string]>();
jest.mock("../forceUpdate", () => ({
  refreshForceUpdate: (trigger: string) => mockRefresh(trigger),
}));

const decision: ForceUpdateDecision = {
  forced: false,
  recommended: true,
  appVersion: "1.0.2",
  minVersion: "1.0.0",
  latestVersion: "1.0.3",
};

beforeEach(() => {
  __resetSessionPresenceForTests();
  mockRefresh.mockReset().mockResolvedValue(decision);
});

describe("checkUpdateOnConnect", () => {
  it("새로 받은 값으로 판정해 apply에 넘긴다 — 접속 종류는 재판정에 그대로 전달한다", async () => {
    const apply = jest.fn();

    await checkUpdateOnConnect("resume", apply);

    expect(mockRefresh).toHaveBeenCalledWith("resume");
    expect(apply).toHaveBeenCalledWith(decision);
  });

  it("세션 화면이 떠 있으면 값은 받아 두고 적용은 세션이 끝난 뒤에 한다", async () => {
    const close = markSessionOpen("single");
    const apply = jest.fn();

    await checkUpdateOnConnect("cold_start", apply);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(apply).not.toHaveBeenCalled();

    close();
    expect(apply).toHaveBeenCalledWith(decision);
  });
});

describe("createReconnectListener", () => {
  it("30분 이상 백그라운드에 있다 돌아오면 접속으로 친다", () => {
    let now = 1_000;
    const onReconnect = jest.fn();
    const listen = createReconnectListener(onReconnect, () => now);

    listen("background");
    now += RECONNECT_AFTER_BACKGROUND_MS;
    listen("active");

    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it("30분 미만이면 아무것도 하지 않는다", () => {
    let now = 1_000;
    const onReconnect = jest.fn();
    const listen = createReconnectListener(onReconnect, () => now);

    listen("background");
    now += RECONNECT_AFTER_BACKGROUND_MS - 1;
    listen("active");

    expect(onReconnect).not.toHaveBeenCalled();
  });

  it("inactive(제어 센터·앱 전환기)는 백그라운드로 세지 않고, 시작 직후 첫 active도 접속이 아니다", () => {
    let now = 1_000;
    const onReconnect = jest.fn();
    const listen = createReconnectListener(onReconnect, () => now);

    listen("active");
    listen("inactive");
    now += RECONNECT_AFTER_BACKGROUND_MS * 2;
    listen("active");

    expect(onReconnect).not.toHaveBeenCalled();
  });

  it("백그라운드 시작 시각은 처음 들어간 때다 — background가 반복 와도 늘리지 않는다", () => {
    let now = 1_000;
    const onReconnect = jest.fn();
    const listen = createReconnectListener(onReconnect, () => now);

    listen("background");
    now += RECONNECT_AFTER_BACKGROUND_MS - 10;
    listen("background");
    now += 10;
    listen("active");

    expect(onReconnect).toHaveBeenCalledTimes(1);
  });
});
