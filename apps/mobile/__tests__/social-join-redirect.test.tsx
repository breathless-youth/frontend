import { render } from "@testing-library/react-native";

import SocialJoinDeepLinkScreen from "../app/social/join";

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
