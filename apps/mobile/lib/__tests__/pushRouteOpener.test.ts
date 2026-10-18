import { openPushRoute } from "../pushRouteOpener";
import { setSessionInviteHandler } from "../sessionInvite";
import { __resetSessionPresenceForTests, markSessionOpen } from "../sessionPresence";

jest.mock("../nativeAnalytics", () => ({ trackNativeEvent: jest.fn() }));

const AT = 1700000000000;

afterEach(() => {
  __resetSessionPresenceForTests();
});

describe("openPushRoute", () => {
  it("세션이 없으면 바로 담당 탭으로 이동한다", () => {
    const push = jest.fn();

    openPushRoute("/planner", push, () => AT);

    expect(push).toHaveBeenCalledWith({
      pathname: "/(tabs)/records",
      params: { path: encodeURIComponent("/planner"), at: String(AT) },
    });
  });

  it("세션 화면이 열려 있으면 닫힌 뒤에 이동한다", () => {
    const push = jest.fn();
    const closeSession = markSessionOpen();

    openPushRoute("/records?date=2026-10-01", push, () => AT);
    expect(push).not.toHaveBeenCalled();

    closeSession();
    expect(push).toHaveBeenCalledWith({
      pathname: "/(tabs)/records",
      params: { path: encodeURIComponent("/records?date=2026-10-01"), at: String(AT) },
    });
  });

  it("세션 중 초대 링크는 세션 화면에 넘기고 이동하지 않는다", () => {
    const push = jest.fn();
    const invite = jest.fn();
    const closeSession = markSessionOpen();
    const unregister = setSessionInviteHandler(invite);

    openPushRoute("/social/join?code=1234", push, () => AT);
    closeSession();

    expect(invite).toHaveBeenCalledWith("1234");
    expect(push).not.toHaveBeenCalled();
    unregister();
  });

  it("세션이 없을 때 초대 링크는 초대 참여 라우트로 간다", () => {
    const push = jest.fn();

    openPushRoute("/social/join?code=1234", push, () => AT);

    expect(push).toHaveBeenCalledWith("/social/join?code=1234");
  });
});
