import { PUSH_HOME_ROUTE, resolvePushRoute, routeFromPushLink } from "../pushNotificationRouting";

// getter로 감싸는 이유: jest.mock 팩토리는 이 파일 본문보다 먼저 실행돼 mockExtra가 아직 없다.
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: mockExtra };
    },
  },
}));

let mockExtra: Record<string, unknown> = {};

afterEach(() => {
  mockExtra = {};
});

const PROD = {
  schemes: ["focusmakers", "focuson"],
  hosts: ["web.focusmakers.app", "web.sunqstudio.kr"],
};
const STAGING = { schemes: ["focusmakers-staging"], hosts: ["web-dev.focusmakers.app"] };

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
    expect(routeFromPushLink(link, PROD)).toBe(expected);
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
    expect(routeFromPushLink(link as string | null | undefined, PROD)).toBeNull();
  });

  it("resolvePushRoute는 data.link를 쓰고, 없거나 허용 밖이면 홈이다", () => {
    expect(resolvePushRoute({ link: "focusmakers://social/join?code=1234" }, PROD)).toBe(
      "/social/join?code=1234",
    );
    expect(resolvePushRoute({}, PROD)).toBe(PUSH_HOME_ROUTE);
    expect(resolvePushRoute({ link: "https://evil.example/x" }, PROD)).toBe(PUSH_HOME_ROUTE);
    expect(resolvePushRoute({ url: "focusmakers://social" }, PROD)).toBe(PUSH_HOME_ROUTE);
  });

  describe("허용 목록은 빌드 변형을 따른다", () => {
    it("staging은 전용 스킴과 web-dev 호스트만 받는다", () => {
      expect(routeFromPushLink("focusmakers-staging://social/join?code=1", STAGING)).toBe(
        "/social/join?code=1",
      );
      expect(routeFromPushLink("https://web-dev.focusmakers.app/social/join", STAGING)).toBe(
        "/social/join",
      );
      expect(routeFromPushLink("focusmakers://social/join", STAGING)).toBeNull();
      expect(routeFromPushLink("https://web.focusmakers.app/social/join", STAGING)).toBeNull();
    });

    it("allow를 생략하면 expo-constants의 extra를 읽는다", () => {
      mockExtra = { appSchemes: ["focusmakers-dev"], deepLinkHosts: [] };
      expect(routeFromPushLink("focusmakers-dev://social")).toBe("/social");
      expect(routeFromPushLink("https://web-dev.focusmakers.app/social")).toBeNull();
    });

    it("extra가 비면 아무 링크도 받지 않는다", () => {
      expect(routeFromPushLink("focusmakers://social/join")).toBeNull();
      expect(routeFromPushLink("https://web.focusmakers.app/social/join")).toBeNull();
    });
  });
});
