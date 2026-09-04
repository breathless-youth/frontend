import { PUSH_HOME_ROUTE, resolvePushRoute, routeFromPushLink } from "../pushNotificationRouting";

describe("pushNotificationRouting (BY-586)", () => {
  it.each([
    ["focusmakers://social/join?code=1234", "/social/join?code=1234"],
    ["focuson://social/join?code=0012", "/social/join?code=0012"],
    ["FOCUSMAKERS://social", "/social"],
    ["https://web.focusmakers.app/social/join?code=1234", "/social/join?code=1234"],
    ["https://web.sunqstudio.kr/social/join?code=1234", "/social/join?code=1234"],
    ["https://web.focusmakers.app", "/"],
    ["https://web.focusmakers.app/", "/"],
    ["/social/join?code=1234", "/social/join?code=1234"],
    ["/social/join/?code=1234", "/social/join?code=1234"],
    ["  /room/abc  ", "/room/abc"],
  ])("허용 주소 %s → %s", (link, expected) => {
    expect(routeFromPushLink(link)).toBe(expected);
  });

  it.each([
    [null],
    [undefined],
    [""],
    ["https://example.com/social/join"],
    ["http://web.focusmakers.app/social/join"],
    ["javascript:alert(1)"],
    ["social/join"],
    ["mailto:a@b.c"],
  ])("허용 밖 주소 %s → null", (link) => {
    expect(routeFromPushLink(link as string | null | undefined)).toBeNull();
  });

  it("resolvePushRoute는 data.link를 쓰고, 없거나 허용 밖이면 홈이다", () => {
    expect(resolvePushRoute({ link: "focusmakers://social/join?code=1234" })).toBe(
      "/social/join?code=1234",
    );
    expect(resolvePushRoute({})).toBe(PUSH_HOME_ROUTE);
    expect(resolvePushRoute({ link: "https://evil.example/x" })).toBe(PUSH_HOME_ROUTE);
    expect(resolvePushRoute({ url: "focusmakers://social" })).toBe(PUSH_HOME_ROUTE);
  });
});
