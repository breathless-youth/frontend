import { render, screen, waitFor } from "@testing-library/react-native";
import React from "react";

import SessionRoomScreen from "../app/room/[id]";
import { createFakeWebAssetServer } from "../lib/webAssetServer";
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

describe("SessionRoomScreen", () => {
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
});
