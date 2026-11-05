import {
  __resetNativeAnalyticsForTests,
  attachNativeAnalyticsSink,
  type NativeAnalyticsEvent,
} from "../nativeAnalytics";
import {
  inviteCodeFrom,
  inviteCodeFromRoute,
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
    ["/social/join?code=AB2CD3", "AB2CD3"],
    ["/social/join?code=ab2cd3", "AB2CD3"],
    ["/social/join?ref=kakao&code=AB2-CD3", "AB2CD3"],
  ])("%s에서 %s를 꺼낸다", (route, code) => {
    expect(inviteCodeFromRoute(route)).toBe(code);
  });

  it.each([
    "/social/join",
    "/social/join?code=",
    "/social/join?code=468",
    "/social/join?code=46800",
    "/social/join?code=abcd",
    "/social/join?code=AB0CD3",
    "/social/join?code=AB2CD3E",
    "/social?code=4680",
    "/social?code=AB2CD3",
    "/",
  ])("%s는 초대 경로가 아니다", (route) => {
    expect(inviteCodeFromRoute(route)).toBeNull();
  });
});

describe("inviteCodeFrom", () => {
  it.each([
    ["4680", "4680"],
    ["0712", "0712"],
  ])("예전 방의 숫자 4자리 코드 %s는 앞자리 0까지 그대로 넘긴다", (raw, code) => {
    expect(inviteCodeFrom(raw)).toBe(code);
  });

  it.each([
    ["AB2CD3", "AB2CD3"],
    ["ab2cd3", "AB2CD3"],
    [" ab2-cd3 ", "AB2CD3"],
    ["AB2 CD3", "AB2CD3"],
    ["234567", "234567"],
    ["HJKMNP", "HJKMNP"],
  ])("그룹 6자리 코드 %j는 대문자로 맞추고 구분 글자를 버려 %s로 넘긴다", (raw, code) => {
    expect(inviteCodeFrom(raw)).toBe(code);
  });

  it.each([
    "",
    "468",
    "46800",
    "12a4",
    "AB2CD",
    "AB2CD3E",
    "AB0CD3",
    "AB1CD3",
    "ABOCD3",
    "ABICD3",
    "ABLCD3",
    "AB2CD!",
    "가나다라마바",
    "ABßCD",
    "javascript:x",
  ])("어느 코드 모양도 아닌 %j는 null이다", (raw) => {
    expect(inviteCodeFrom(raw)).toBeNull();
  });

  it("문자열이 아니면 null이다", () => {
    expect(inviteCodeFrom(4680)).toBeNull();
    expect(inviteCodeFrom(undefined)).toBeNull();
    expect(inviteCodeFrom(null)).toBeNull();
  });
});

describe("offerRouteToSession", () => {
  it("세션 화면이 없으면 넘기지 않는다", () => {
    expect(offerRouteToSession("/social/join?code=4680")).toBe(false);
    expect(offerRouteToSession("/social/join?code=AB2CD3")).toBe(false);
    expect(received).toEqual([]);
  });

  it("세션 화면이 있으면 그룹 코드를 넘기고 초대 진입 이벤트를 남긴다", () => {
    const handler = jest.fn();
    release = setSessionInviteHandler(handler);

    expect(offerRouteToSession("/social/join?code=AB2CD3")).toBe(true);
    expect(handler).toHaveBeenCalledWith("AB2CD3");
    expect(received.map((event) => [event.name, event.properties])).toEqual([
      ["invite_deep_link_opened", { has_code: true }],
    ]);
  });

  it("그룹 초대 링크도 정리한 코드로 넘긴다", () => {
    const handler = jest.fn();
    release = setSessionInviteHandler(handler);

    expect(offerRouteToSession("/social/join?code=ab2cd3")).toBe(true);
    expect(handler).toHaveBeenCalledWith("AB2CD3");
  });

  it.each(["4680", "0712"])(
    "예전 방의 숫자 4자리 링크 %s는 세션 화면에 넘기지 않고 가로채기만 한다",
    (code) => {
      const handler = jest.fn();
      release = setSessionInviteHandler(handler);

      // true를 돌려줘야 호출부가 화면을 이동하지 않아 세션 위에 시트가 쌓이지 않는다.
      expect(offerRouteToSession(`/social/join?code=${code}`)).toBe(true);
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it("가로챈 숫자 4자리 링크도 초대 진입 이벤트는 남긴다", () => {
    release = setSessionInviteHandler(jest.fn());

    offerRouteToSession("/social/join?code=4680");

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

    expect(offerRouteToSession("/social/join?code=AB2CD3")).toBe(false);
  });

  it("늦게 온 해제가 그사이 등록된 새 핸들러를 지우지 않는다", () => {
    const releaseOld = setSessionInviteHandler(jest.fn());
    const next = jest.fn();
    release = setSessionInviteHandler(next);

    releaseOld();

    expect(offerRouteToSession("/social/join?code=AB2CD3")).toBe(true);
    expect(next).toHaveBeenCalledWith("AB2CD3");
  });
});
