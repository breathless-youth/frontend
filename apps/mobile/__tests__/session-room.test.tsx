import { render, screen, waitFor } from "@testing-library/react-native";
import React from "react";

import SessionRoomScreen from "../app/room/[id]";
import { getRegisteredUserId } from "../lib/userApi";
import { createFakeWebAssetServer, createUnavailableWebAssetServer } from "../lib/webAssetServer";
import { resetWebAssetServer, setWebAssetServer } from "../lib/webAssetServerRegistry";

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "1" }),
}));

jest.mock("react-native-webview", () => {
  const { View } = jest.requireActual("react-native");
  return {
    WebView: ({ source, testID }: { source: { uri: string }; testID?: string }) => (
      <View testID={testID ?? "webview"} accessibilityLabel={source.uri} />
    ),
  };
});

jest.mock("../lib/userApi", () => ({
  getRegisteredUserId: jest.fn(async () => 7),
}));

const mockGetRegisteredUserId = getRegisteredUserId as jest.MockedFunction<
  typeof getRegisteredUserId
>;

describe("SessionRoomScreen", () => {
  beforeEach(() => {
    mockGetRegisteredUserId.mockResolvedValue(7);
  });

  afterEach(() => {
    resetWebAssetServer();
  });

  it("서버가 뜨면 세션 URL을 WebView에 넘긴다", async () => {
    setWebAssetServer(createFakeWebAssetServer({ origin: "http://localhost:9999" }));

    render(<SessionRoomScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("session-webview")).toHaveProp(
        "accessibilityLabel",
        "http://localhost:9999/room/1?userId=7",
      );
    });
  });

  it("서버가 뜨기 전에는 WebView를 그리지 않는다", () => {
    setWebAssetServer(createFakeWebAssetServer());

    render(<SessionRoomScreen />);

    expect(screen.queryByTestId("session-webview")).toBeNull();
  });

  it("서버 기동에 실패하면 WebView 대신 안내를 보여준다", async () => {
    setWebAssetServer(createFakeWebAssetServer({ failToStart: true }));

    render(<SessionRoomScreen />);

    await waitFor(() => {
      expect(screen.getByText("세션을 시작하지 못했어요")).toBeTruthy();
    });
    expect(screen.queryByTestId("session-webview")).toBeNull();
  });

  it("서버가 사용 불가면 실패 안내로 간다", async () => {
    // 사용 불가 서버는 start()가 **거부**된다. fake처럼 성공해버리면 라우트가 실패 분기를
    // 건너뛰고 존재하지 않는 서버를 로드해 백지가 된다 — 원인을 짚을 수 없는 실패다.
    // 레지스트리 기본값이 실제 구현으로 바뀐 뒤에도 이 분기는 그대로 살아 있어야 한다.
    setWebAssetServer(createUnavailableWebAssetServer());

    render(<SessionRoomScreen />);

    await waitFor(() => {
      expect(screen.getByText("세션을 시작하지 못했어요")).toBeTruthy();
    });
    expect(screen.queryByTestId("session-webview")).toBeNull();
  });

  it("userId를 못 읽어도 세션은 연다 — apps/web이 unsaved 경로로 처리한다", async () => {
    setWebAssetServer(createFakeWebAssetServer({ origin: "http://localhost:9999" }));
    mockGetRegisteredUserId.mockRejectedValue(new Error("SecureStore 읽기 실패"));

    render(<SessionRoomScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("session-webview")).toHaveProp(
        "accessibilityLabel",
        "http://localhost:9999/room/1",
      );
    });
    expect(screen.queryByText("세션을 시작하지 못했어요")).toBeNull();
  });
});
