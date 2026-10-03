import {
  __resetNativeAnalyticsForTests,
  attachNativeAnalyticsSink,
  type NativeAnalyticsEvent,
} from "../nativeAnalytics";
import {
  inviteCodeFromRoute,
  isInviteCode,
  offerRouteToSession,
  setSessionInviteHandler,
} from "../sessionInvite";

let release: (() => void) | null = null;
let received: NativeAnalyticsEvent[] = [];

beforeEach(() => {
  __resetNativeAnalyticsForTests();
  received = [];
  attachNativeAnalyticsSink((event) => received.push(event));
});

afterEach(() => {
  release?.();
  release = null;
});

describe("inviteCodeFromRoute", () => {
  it.each([
    ["/social/join?code=4680", "4680"],
    ["/social/join?code=0712", "0712"],
    ["/social/join?ref=kakao&code=4680", "4680"],
  ])("%s에서 %s를 꺼낸다", (route, code) => {
    expect(inviteCodeFromRoute(route)).toBe(code);
  });

  it.each([
    "/social/join",
    "/social/join?code=",
    "/social/join?code=468",
    "/social/join?code=46800",
    "/social/join?code=abcd",
    "/social?code=4680",
    "/",
  ])("%s는 초대 경로가 아니다", (route) => {
    expect(inviteCodeFromRoute(route)).toBeNull();
  });
});

describe("isInviteCode", () => {
  it("4자리 숫자 문자열만 초대코드다", () => {
    expect(isInviteCode("4680")).toBe(true);
    expect(isInviteCode("468")).toBe(false);
    expect(isInviteCode(4680)).toBe(false);
    expect(isInviteCode(undefined)).toBe(false);
  });
});

describe("offerRouteToSession", () => {
  it("세션 화면이 없으면 넘기지 않는다", () => {
    expect(offerRouteToSession("/social/join?code=4680")).toBe(false);
    expect(received).toEqual([]);
  });

  it("세션 화면이 있으면 코드를 넘기고 초대 진입 이벤트를 남긴다", () => {
    const handler = jest.fn();
    release = setSessionInviteHandler(handler);

    expect(offerRouteToSession("/social/join?code=4680")).toBe(true);
    expect(handler).toHaveBeenCalledWith("4680");
    expect(received.map((event) => [event.name, event.properties])).toEqual([
      ["invite_deep_link_opened", { has_code: true }],
    ]);
  });

  it("초대 경로가 아니면 세션 화면이 있어도 넘기지 않는다", () => {
    const handler = jest.fn();
    release = setSessionInviteHandler(handler);

    expect(offerRouteToSession("/records")).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it("해제하면 더는 넘기지 않는다", () => {
    const releaseHandler = setSessionInviteHandler(jest.fn());
    releaseHandler();

    expect(offerRouteToSession("/social/join?code=4680")).toBe(false);
  });

  it("늦게 온 해제가 그사이 등록된 새 핸들러를 지우지 않는다", () => {
    const releaseOld = setSessionInviteHandler(jest.fn());
    const next = jest.fn();
    release = setSessionInviteHandler(next);

    releaseOld();

    expect(offerRouteToSession("/social/join?code=4680")).toBe(true);
    expect(next).toHaveBeenCalledWith("4680");
  });
});
