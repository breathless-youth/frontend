import { parseQueryParams } from "expo-router/build/fork/getStateFromPath-forks";
import { resolveHref } from "expo-router/build/link/href";

import {
  PUSH_HOME_ROUTE,
  pushTargetForRoute,
  resolvePushRoute,
  routeFromPushLink,
} from "../pushNotificationRouting";
import { remoteScreenInput } from "../tabDeepLink";

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

describe("pushTargetForRoute — 웹 경로를 담당 탭으로", () => {
  const AT = 1700000000000;

  it.each([
    ["/", "/"],
    ["/home", "/"],
    ["/records", "/records"],
    ["/ranking", "/ranking"],
    ["/settings", "/settings"],
    ["/social", "/social"],
    ["/social/join?code=1234", "/social/join?code=1234"],
  ])("탭 루트·초대 참여 %s는 네이티브 라우트 그대로", (route, expected) => {
    expect(pushTargetForRoute(route, AT)).toBe(expected);
  });

  it.each([
    ["/planner", "/(tabs)/records"],
    ["/manual-record", "/(tabs)/records"],
    ["/records?date=2026-10-01", "/(tabs)/records"],
    ["/timelapses", "/(tabs)"],
    ["/profile", "/(tabs)/settings"],
    ["/timelapse-settings", "/(tabs)/settings"],
    ["/social/code", "/(tabs)/social"],
    ["/ranking/records", "/(tabs)/ranking"],
  ])("웹 전용 경로 %s는 %s 탭에 path 파라미터로 연다", (route, pathname) => {
    expect(pushTargetForRoute(route, AT)).toEqual({
      pathname,
      params: { path: encodeURIComponent(route), at: String(AT) },
    });
  });

  it("쿼리는 그대로 넘기고 해시는 뗀다", () => {
    expect(pushTargetForRoute("/planner?date=2026-10-01&view=week#top", AT)).toEqual({
      pathname: "/(tabs)/records",
      params: { path: encodeURIComponent("/planner?date=2026-10-01&view=week"), at: String(AT) },
    });
  });

  it("라우터를 거쳐도 쿼리 값의 이스케이프가 보존된다 — href 조립·상태 복원·useLocalSearchParams 디코딩 순서 그대로", () => {
    const target = pushTargetForRoute("/records?note=a%26b&q=a%2Bb", AT);
    expect(typeof target).toBe("object");
    const href = resolveHref(target as Exclude<typeof target, string>);
    const fromState = parseQueryParams(
      href,
      {} as Parameters<typeof parseQueryParams>[1],
    ) as Record<string, string>;
    // useLocalSearchParams는 값을 한 번 더 decodeURIComponent한다.
    const seenByTab = Object.fromEntries(
      Object.entries(fromState).map(([key, value]) => [key, decodeURIComponent(value)]),
    );
    expect(seenByTab.path).toBe("/records?note=a%26b&q=a%2Bb");
    expect(remoteScreenInput(seenByTab, "/records").extraQuery).toEqual({
      note: "a&b",
      q: "a+b",
    });
  });

  it.each([
    ["/room/1"],
    ["/social/room/9"],
    ["/room/1/result"],
    ["/unknown"],
    ["/dev/webrtc-loopback"],
    ["/onboarding-guide"],
  ])("세션 화면·모르는 경로 %s는 홈으로", (route) => {
    expect(pushTargetForRoute(route, AT)).toBe(PUSH_HOME_ROUTE);
  });
});
