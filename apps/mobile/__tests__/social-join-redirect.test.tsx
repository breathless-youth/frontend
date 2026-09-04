import { render } from "@testing-library/react-native";

import SocialJoinDeepLinkScreen from "../app/social/join";
import {
  __resetNativeAnalyticsForTests,
  attachNativeAnalyticsSink,
  type NativeAnalyticsEvent,
} from "../lib/nativeAnalytics";

const mockParams: { code?: string } = {};
const redirectCalls: unknown[] = [];

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  Redirect: (props: { href: unknown }) => {
    redirectCalls.push(props.href);
    return null;
  },
}));

afterEach(() => {
  delete mockParams.code;
  redirectCalls.length = 0;
});

describe("SocialJoinDeepLinkScreen", () => {
  it("code를 실어 소셜 탭으로 리다이렉트한다", () => {
    mockParams.code = "5634";
    render(<SocialJoinDeepLinkScreen />);
    expect(redirectCalls).toEqual([{ pathname: "/(tabs)/social", params: { code: "5634" } }]);
  });

  it("code가 없으면 파라미터 없이 소셜 탭으로 리다이렉트한다", () => {
    render(<SocialJoinDeepLinkScreen />);
    expect(redirectCalls).toEqual([{ pathname: "/(tabs)/social", params: {} }]);
  });
});

/** 딥링크 진입은 네이티브만 아는 사실이다 — `invite_deep_link_opened`로 웹 Amplitude에 넘긴다. 코드 값은 싣지 않는다. */
describe("SocialJoinDeepLinkScreen — invite_deep_link_opened", () => {
  let received: NativeAnalyticsEvent[];

  beforeEach(() => {
    __resetNativeAnalyticsForTests();
    received = [];
    attachNativeAnalyticsSink((event) => received.push(event));
  });

  afterEach(() => {
    __resetNativeAnalyticsForTests();
  });

  it("코드가 있으면 has_code true — 값은 싣지 않는다", () => {
    mockParams.code = "5634";
    render(<SocialJoinDeepLinkScreen />);
    expect(received.map((event) => [event.name, event.properties])).toEqual([
      ["invite_deep_link_opened", { has_code: true }],
    ]);
  });

  it("코드가 없으면 has_code false", () => {
    render(<SocialJoinDeepLinkScreen />);
    expect(received.map((event) => event.properties)).toEqual([{ has_code: false }]);
  });
});
