import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import PrivacyScreen from "../app/privacy";
import TermsScreen from "../app/terms";
import { PRIVACY_POLICY, TERMS_OF_SERVICE } from "../lib/legalDocuments";

/**
 * 이용약관 · 개인정보처리방침 화면.
 *
 * 본문 전문을 여기서 다시 검증하지 않는다(사본을 또 만드는 셈이라 원본이 바뀌면 두 곳이 갈라진다).
 * 대신 **문서 데이터가 화면에 빠짐없이 렌더되는지**를 데이터로부터 확인하고, 웹 원본과의
 * 대조는 `lib/__tests__/legalDocuments.test.ts`가 맡는다.
 */

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

beforeEach(() => {
  jest.clearAllMocks();
  mockedRouter.canGoBack = jest.fn().mockReturnValue(true);
});

describe.each([
  ["이용약관", TermsScreen, TERMS_OF_SERVICE],
  ["개인정보처리방침", PrivacyScreen, PRIVACY_POLICY],
])("%s 화면", (_name, Screen, document) => {
  it("제목과 시행일을 보여준다", () => {
    render(<Screen />);

    expect(screen.getByRole("header", { name: document.title })).toBeTruthy();
    expect(screen.getByText(`시행일: ${document.effectiveDate}`)).toBeTruthy();
  });

  it("모든 조항 제목을 순서대로 보여준다", () => {
    render(<Screen />);

    for (const section of document.sections) {
      expect(screen.getByRole("header", { name: section.heading })).toBeTruthy();
    }
  });

  it("모든 본문 블록을 한 줄도 빠뜨리지 않고 렌더한다", () => {
    render(<Screen />);

    for (const section of document.sections) {
      for (const block of section.blocks) {
        switch (block.kind) {
          case "paragraph":
            expect(screen.getByText(block.text)).toBeTruthy();
            break;
          case "bullets":
            for (const item of block.items) {
              expect(screen.getByText(item)).toBeTruthy();
            }
            break;
          case "fields":
            for (const row of block.rows) {
              expect(screen.getByText(row.label)).toBeTruthy();
              expect(screen.getByText(row.value)).toBeTruthy();
            }
            break;
        }
      }
    }
  });

  it("뒤로 가기 버튼이 이전 화면으로 되돌린다", () => {
    render(<Screen />);

    fireEvent.press(screen.getByRole("button", { name: "뒤로 가기" }));

    expect(mockedRouter.back).toHaveBeenCalledTimes(1);
    expect(mockedRouter.replace).not.toHaveBeenCalled();
  });

  it("스택이 비어 있으면(딥링크 직행) 설정으로 보낸다", () => {
    mockedRouter.canGoBack = jest.fn().mockReturnValue(false);
    render(<Screen />);

    fireEvent.press(screen.getByRole("button", { name: "뒤로 가기" }));

    expect(mockedRouter.replace).toHaveBeenCalledWith("/settings");
    expect(mockedRouter.back).not.toHaveBeenCalled();
  });
});

describe("개인정보처리방침 화면 고유", () => {
  it("도입 문단을 조항 앞에 보여준다", () => {
    render(<PrivacyScreen />);

    expect(PRIVACY_POLICY.intro).toBeDefined();
    expect(screen.getByText(PRIVACY_POLICY.intro as string)).toBeTruthy();
  });

  it("보호책임자 연락처를 그대로 보여준다", () => {
    render(<PrivacyScreen />);

    expect(screen.getByText("breathless.youth@gmail.com")).toBeTruthy();
  });
});
