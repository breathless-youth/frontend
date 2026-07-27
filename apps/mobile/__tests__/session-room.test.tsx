import { render, screen, waitFor } from "@testing-library/react-native";
import React from "react";

import SessionRoomScreen from "../app/room/[id]";
import { getRegisteredUserId } from "../lib/userApi";
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

  it("서버를 주입하지 않은 기본 상태(= 실제 구현 없음)에서는 실패 안내로 간다", async () => {
    // 기본값이 fake였을 때는 start()가 성공해 존재하지 않는 서버를 로드하고 백지가 됐다.
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
