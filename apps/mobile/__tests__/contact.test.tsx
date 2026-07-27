import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { Linking } from "react-native";

import ContactScreen from "../app/contact";
import { CONTACT_FORM_URL } from "../lib/settingsInfo";

/**
 * 문의하기 — 폼을 WebView로 띄우는 화면.
 *
 * 실제 폼이 뜨는지는 여기서 검증할 수 없다(네트워크·Google Forms). 이 테스트가 지키는 것은
 * **앱을 벗어나지 않는다**는 계약과, 폼을 못 불러왔을 때 사용자가 막다른 길에 갇히지 않는다는 것이다.
 */

jest.mock("react-native-webview", () => {
  /*
    eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports --
    `jest.mock` 팩토리는 상단 import보다 먼저 호이스팅돼 평가되므로 import 바인딩을 참조할 수 없다
    (`babel-plugin-jest-hoist`가 out-of-scope 변수 참조를 막는다). 팩토리 안에서 `require`로
    가져오는 것 외에 방법이 없어 이 블록에서만 공유 규칙을 끈다.
  */
  const ReactModule = require("react") as typeof import("react");
  const { View } = require("react-native") as typeof import("react-native");
  /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports */

  return {
    WebView: ReactModule.forwardRef(function MockWebView(
      props: Record<string, unknown>,
      ref: React.Ref<{ reload: () => void }>,
    ) {
      ReactModule.useImperativeHandle(ref, () => ({ reload: jest.fn() }));
      return ReactModule.createElement(View, { testID: "contact-webview", ...props });
    }),
  };
});

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn(), replace: jest.fn() },
  canGoBack: jest.fn(),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));

const mockedRouter = router as unknown as {
  back: jest.Mock;
  replace: jest.Mock;
  canGoBack: jest.Mock;
};

/** WebView 콜백을 실제 로드 없이 흉내 낸다. */
function fireWebViewEvent(name: "onLoadEnd" | "onError" | "onHttpError") {
  const handler = screen.getByTestId("contact-webview").props[name] as () => void;
  act(() => {
    handler();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedRouter.canGoBack = jest.fn().mockReturnValue(true);
  jest.spyOn(Linking, "openURL").mockResolvedValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("문의하기 화면", () => {
  it("확정된 문의 폼 주소를 WebView로 띄운다", () => {
    render(<ContactScreen />);

    expect(screen.getByTestId("contact-webview").props.source).toEqual({ uri: CONTACT_FORM_URL });
  });

  it("앱 밖으로 내보내지 않는다 (BY-257)", () => {
    render(<ContactScreen />);
    fireWebViewEvent("onLoadEnd");

    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it("제목과 뒤로가기를 제공한다", () => {
    render(<ContactScreen />);

    expect(screen.getByRole("header", { name: "문의하기" })).toBeTruthy();

    fireEvent.press(screen.getByRole("button", { name: "뒤로 가기" }));
    expect(mockedRouter.back).toHaveBeenCalledTimes(1);
  });

  it("로드가 끝나기 전에는 진행 표시를 보여주고, 끝나면 감춘다", () => {
    render(<ContactScreen />);

    expect(screen.getByLabelText("문의 폼을 불러오는 중")).toBeTruthy();

    fireWebViewEvent("onLoadEnd");

    expect(screen.queryByLabelText("문의 폼을 불러오는 중")).toBeNull();
  });

  it.each(["onError", "onHttpError"] as const)(
    "%s가 나면 실패 안내와 재시도 수단을 준다 (막다른 길로 두지 않는다)",
    (event) => {
      render(<ContactScreen />);
      fireWebViewEvent(event);

      expect(screen.getByText("문의 폼을 불러오지 못했어요")).toBeTruthy();
      expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
      // 실패했다고 진행 표시가 남아 돌면 안 된다.
      expect(screen.queryByLabelText("문의 폼을 불러오는 중")).toBeNull();
    },
  );

  it("다시 시도를 누르면 폼을 다시 불러온다", () => {
    render(<ContactScreen />);
    fireWebViewEvent("onError");

    fireEvent.press(screen.getByRole("button", { name: "다시 시도" }));

    expect(screen.queryByText("문의 폼을 불러오지 못했어요")).toBeNull();
    expect(screen.getByTestId("contact-webview")).toBeTruthy();
    expect(screen.getByLabelText("문의 폼을 불러오는 중")).toBeTruthy();
  });
});
