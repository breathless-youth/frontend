import { openPushRoute } from "../pushRouteOpener";
import { setSessionInviteHandler } from "../sessionInvite";
import { __resetSessionPresenceForTests, markSessionOpen } from "../sessionPresence";

jest.mock("../nativeAnalytics", () => ({ trackNativeEvent: jest.fn() }));

const AT = 1700000000000;
const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));

afterEach(() => {
  __resetSessionPresenceForTests();
});

describe("openPushRoute", () => {
  it("세션이 없으면 담당 탭으로 이동한다 — 호출 직후가 아니라 한 틱 뒤", async () => {
    const push = jest.fn();

    openPushRoute("/planner", push, () => AT);
    expect(push).not.toHaveBeenCalled();
    await flush();

    expect(push).toHaveBeenCalledWith({
      pathname: "/(tabs)/records",
      params: { path: encodeURIComponent("/planner"), at: String(AT) },
    });
  });

  it("세션 화면이 열려 있으면 닫힌 뒤에 이동한다", async () => {
    const push = jest.fn();
    const closeSession = markSessionOpen("single");

    openPushRoute("/records?date=2026-10-01", push, () => AT);
    await flush();
    expect(push).not.toHaveBeenCalled();

    closeSession();
    await flush();
    expect(push).toHaveBeenCalledWith({
      pathname: "/(tabs)/records",
      params: { path: encodeURIComponent("/records?date=2026-10-01"), at: String(AT) },
    });
  });

  it("세션 중 알림이 여러 건 쌓이면 마지막 것만 연다", async () => {
    const push = jest.fn();
    const closeSession = markSessionOpen("single");

    openPushRoute("/planner", push, () => AT);
    openPushRoute("/profile", push, () => AT + 1);
    closeSession();
    await flush();

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith({
      pathname: "/(tabs)/settings",
      params: { path: encodeURIComponent("/profile"), at: String(AT + 1) },
    });
  });

  it("세션 중 초대 링크가 오면 앞서 대기 중이던 알림도 열지 않는다", async () => {
    const push = jest.fn();
    const invite = jest.fn();
    const closeSession = markSessionOpen("single");
    const unregister = setSessionInviteHandler(invite);

    openPushRoute("/planner", push, () => AT);
    openPushRoute("/social/join?code=1234", push, () => AT + 1);
    closeSession();
    await flush();

    expect(invite).toHaveBeenCalledWith("1234");
    expect(push).not.toHaveBeenCalled();
    unregister();
  });

  it("세션 중 초대 링크는 세션 화면에 넘기고 이동하지 않는다", async () => {
    const push = jest.fn();
    const invite = jest.fn();
    const closeSession = markSessionOpen("single");
    const unregister = setSessionInviteHandler(invite);

    openPushRoute("/social/join?code=1234", push, () => AT);
    closeSession();
    await flush();

    expect(invite).toHaveBeenCalledWith("1234");
    expect(push).not.toHaveBeenCalled();
    unregister();
  });

  it("세션이 없을 때 초대 링크는 초대 참여 라우트로 간다", async () => {
    const push = jest.fn();

    openPushRoute("/social/join?code=1234", push, () => AT);
    await flush();

    expect(push).toHaveBeenCalledWith("/social/join?code=1234");
  });
});
