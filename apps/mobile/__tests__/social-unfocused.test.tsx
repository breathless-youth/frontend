import { render } from "@testing-library/react-native";

import SocialScreen from "../app/(tabs)/social";

/**
 * 탭 포커스 → 탭 바 메시지 차단 연결.
 *
 * 다른 탭 테스트는 useIsFocused를 true로 고정해 두어 비포커스 경로가 비어 있었다 —
 * 화면에 없는 탭의 웹뷰가 suppress를 실제로 받는지 여기서 검증한다.
 */

jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useIsFocused: () => false,
}));

const remoteScreenProps: Record<string, unknown>[] = [];
jest.mock("../components/RemoteScreen", () => ({
  RemoteScreen: (props: Record<string, unknown>) => {
    remoteScreenProps.push(props);
    return null;
  },
}));

describe("SocialScreen — 비포커스", () => {
  it("탭이 포커스를 잃으면 웹뷰에 탭 바 메시지 차단을 전달한다", () => {
    render(<SocialScreen />);

    expect(remoteScreenProps[0]?.suppressTabBarMessages).toBe(true);
  });
});
